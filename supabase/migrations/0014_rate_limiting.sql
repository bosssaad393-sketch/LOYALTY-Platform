-- 0014: rate limits that hold across all server instances.
-- Vercel runs many short-lived copies of the app, so a counter kept in one copy's memory only slows a single tab. These limits
-- are counted in the database instead, the same way pin_attempts already counts wrong PINs.
--   * rate_hits: one row per counted request. bucket = what is limited and for whom, for example "join:ip:<hash>".
--     Caller addresses are stored only as keyed hashes (HMAC with the server secret), never as the address itself.
--   * rate_hit(bucket, limit, window_seconds): counts the bucket's hits inside the window and, while under the limit, records
--     this one. True = allowed. One caller at a time per bucket (advisory lock), so two requests at the same instant cannot
--     both slip under the limit. Old rows are cleared now and then by the function itself.
-- Apply before deploying the code that calls rate_hit().

create table if not exists rate_hits (
  id      bigint generated always as identity primary key,
  bucket  text not null check (length(bucket) between 1 and 200),
  at      timestamptz not null default now()
);
create index if not exists rate_hits_bucket_at_idx on rate_hits (bucket, at desc);
create index if not exists rate_hits_at_idx on rate_hits (at);
alter table rate_hits enable row level security;

create or replace function rate_hit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if p_bucket is null or length(p_bucket) = 0 or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit';
  end if;
  perform pg_advisory_xact_lock(hashtext('rate:' || p_bucket));
  select count(*) into v_count from rate_hits
   where bucket = p_bucket and at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_limit then
    return false;
  end if;
  insert into rate_hits (bucket) values (p_bucket);
  -- Housekeeping on about 1 call in 100: nothing is limited over more than a day.
  if random() < 0.01 then
    delete from rate_hits where at < now() - interval '1 day';
  end if;
  return true;
end;
$$;

revoke all on function rate_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function rate_hit(text, integer, integer) to service_role;

-- Found by the platform audit (7 Nov 2026): the points trigger function had no fixed search_path and was callable by anyone.
alter function apply_ledger() set search_path = public;
revoke all on function apply_ledger() from public, anon, authenticated;
