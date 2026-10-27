-- 0005: owner assistant (chat in the owner dashboard).
--   * ledger_adjust: the owner adds or removes points on one guest's card, with a reason, atomically
--   * assistant_pending: a change the assistant has proposed and the owner has not yet confirmed (10 minutes)
--   * assistant_requests: requests the assistant cannot do itself; the development team picks them up
-- Not applied to any database yet. Run it on the client's OWN project, after a backup, like the other migrations.

-- Manual adjustment: kind 'adjust' already exists in ledger_kind. Only an active OWNER of the card's venue may call it
-- (the server also checks); limits keep a typo from wiping a balance; the trigger refuses a balance below zero.
create or replace function ledger_adjust(p_card uuid, p_staff uuid, p_delta integer, p_reason text)
returns table (ledger_id bigint, new_balance integer)
language plpgsql security definer set search_path = public as $$
declare
  v_card  cards;
  v_staff staff_users;
  v_id    bigint;
begin
  if p_delta is null or p_delta = 0 or abs(p_delta) > 1000 then
    raise exception 'an adjustment is between 1 and 1000 points';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 or length(p_reason) > 200 then
    raise exception 'a short reason is required';
  end if;
  select * into v_card from cards where id = p_card for update;
  if not found then raise exception 'card not found'; end if;
  select * into v_staff from staff_users where id = p_staff and active and role = 'owner';
  if not found or v_staff.venue_id <> v_card.venue_id then
    raise exception 'only the owner of this venue can adjust points';
  end if;

  insert into ledger (card_id, venue_id, kind, points, staff_id, note)
  values (v_card.id, v_card.venue_id, 'adjust', p_delta, p_staff, trim(p_reason))
  returning id into v_id;

  insert into audit_log (venue_id, actor, action, detail)
  values (v_card.venue_id, p_staff::text, 'adjust',
          jsonb_build_object('card', v_card.id, 'ledger', v_id, 'points', p_delta));

  return query select v_id, (select c.points from cards c where c.id = p_card);
end $$;

revoke all on function ledger_adjust(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function ledger_adjust(uuid, uuid, integer, text) to service_role;

-- A proposed change waits here until the owner says yes. One row = one exact action; it cannot be changed, only done or cancelled.
create table if not exists assistant_pending (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues(id) on delete cascade,
  staff_id    uuid not null references staff_users(id) on delete cascade,
  action      jsonb not null,
  summary     text not null,
  status      text not null default 'pending' check (status in ('pending', 'done', 'cancelled', 'expired')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '10 minutes'
);
create index if not exists assistant_pending_staff_idx on assistant_pending (staff_id, created_at desc);
alter table assistant_pending enable row level security;

-- What the assistant passed on to the development team (never shown to the owner as an error).
create table if not exists assistant_requests (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues(id) on delete cascade,
  staff_id    uuid references staff_users(id) on delete set null,
  message     text not null,
  why         text not null default 'unsupported' check (why in ('unsupported', 'role', 'limit', 'failed')),
  status      text not null default 'open' check (status in ('open', 'in_progress', 'done')),
  result      text,
  created_at  timestamptz not null default now(),
  handled_at  timestamptz
);
create index if not exists assistant_requests_venue_idx on assistant_requests (venue_id, created_at desc);
alter table assistant_requests enable row level security;
