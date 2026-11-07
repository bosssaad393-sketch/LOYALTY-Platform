-- 0015: the owner's home numbers, counted inside Postgres.
-- Before: the app fetched every card and 30 days of ledger rows, then counted in JavaScript. Supabase returns at most 1000 rows
-- per request, so past 1000 guests the numbers were silently wrong, and every page load moved all those rows.
-- After: one call returns a small JSON object with the same fields the owner screen already shows.
--   p_today = the start of today in Bahrain (UTC+3), sent by the app so "today" means the same thing on both sides.
--   A visit is an earn entry that was not undone; a reward is a redeem entry that was not undone.
-- Apply before deploying the code that calls owner_summary().

create index if not exists cards_venue_created_idx on cards (venue_id, created_at);

create or replace function owner_summary(p_venue uuid, p_today timestamptz)
returns jsonb
language sql stable security definer set search_path = public as $$
  with live as (
    select l.kind, l.created_at
      from ledger l
     where l.venue_id = p_venue
       and l.created_at >= p_today - interval '29 days'
       and l.kind in ('earn', 'redeem')
       and not exists (select 1 from ledger u where u.kind = 'undo' and u.undoes = l.id)
  ),
  days as (
    select i, p_today - (13 - i) * interval '1 day' as day_start from generate_series(0, 13) as i
  )
  select jsonb_build_object(
    'members',      (select count(*) from cards where venue_id = p_venue),
    'newThisWeek',  (select count(*) from cards where venue_id = p_venue and created_at >= p_today - interval '6 days'),
    'pointsHeld',   (select coalesce(sum(points), 0) from cards where venue_id = p_venue),
    'visits7d',     (select count(*) from live where kind = 'earn' and created_at >= p_today - interval '6 days'),
    'visitsPrev7d', (select count(*) from live where kind = 'earn'
                       and created_at >= p_today - interval '13 days' and created_at < p_today - interval '6 days'),
    'rewards30d',   (select count(*) from live where kind = 'redeem'),
    'perDay14',     (select jsonb_agg(jsonb_build_object(
                        'day', to_char((d.day_start + interval '3 hours') at time zone 'UTC', 'YYYY-MM-DD'),
                        'visits', (select count(*) from live
                                    where kind = 'earn' and created_at >= d.day_start and created_at < d.day_start + interval '1 day'))
                      order by d.i)
                       from days d)
  );
$$;

revoke all on function owner_summary(uuid, timestamptz) from public, anon, authenticated;
grant execute on function owner_summary(uuid, timestamptz) to service_role;
