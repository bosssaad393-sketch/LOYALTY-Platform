-- 0006: POS connector (a business's till system sends sales and refunds to the loyalty software).
--   * ledger.source / ledger.external_ref: where an entry came from, and the POS receipt it belongs to (one entry per receipt)
--   * ledger_pos_sale / ledger_pos_refund: idempotent (the same receipt twice never doubles points), the card is found by its 4-digit code inside the venue
--   * pos_connections: one connection per venue; only a HASH of the API key is stored
--   * pos_events: a log of what the POS sent and what happened (no guest details)
-- Not applied to any database yet. Run on the client's OWN project, after a backup.

alter table ledger add column if not exists source text not null default 'till' check (source in ('till', 'pos', 'assistant'));
alter table ledger add column if not exists external_ref text;
-- One earn and one undo per receipt per venue: a retried request cannot create a second entry.
create unique index if not exists ledger_external_ref_idx on ledger (venue_id, external_ref, kind) where external_ref is not null;

create or replace function ledger_pos_sale(p_venue uuid, p_code text, p_bill numeric, p_receipt text)
returns table (ledger_id bigint, points_added integer, new_balance integer, duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_venue venues;
  v_card  cards;
  v_old   ledger;
  v_pts   integer;
  v_id    bigint;
begin
  if p_receipt is null or length(trim(p_receipt)) = 0 or length(p_receipt) > 64 then
    raise exception 'a receipt id is required';
  end if;
  select * into v_venue from venues where id = p_venue;
  if not found or not v_venue.active then raise exception 'venue is not active'; end if;

  -- The same receipt again: answer with the first result, change nothing.
  select * into v_old from ledger where venue_id = p_venue and external_ref = p_receipt and kind = 'earn';
  if found then
    return query select v_old.id, 0, (select c.points from cards c where c.id = v_old.card_id), true;
    return;
  end if;

  select * into v_card from cards where venue_id = p_venue and code = p_code for update;
  if not found then raise exception 'card not found'; end if;
  if p_bill is null or p_bill <= 0 or p_bill > 5000 then raise exception 'invalid bill amount'; end if;
  v_pts := floor(p_bill * v_venue.points_per_bhd);
  if v_pts < 1 then raise exception 'bill is too small to earn points'; end if;

  begin
    insert into ledger (card_id, venue_id, kind, points, bill_bhd, source, external_ref)
    values (v_card.id, v_card.venue_id, 'earn', v_pts, p_bill, 'pos', p_receipt)
    returning id into v_id;
  exception when unique_violation then
    select * into v_old from ledger where venue_id = p_venue and external_ref = p_receipt and kind = 'earn';
    return query select v_old.id, 0, (select c.points from cards c where c.id = v_old.card_id), true;
    return;
  end;

  insert into audit_log (venue_id, actor, action, detail)
  values (v_card.venue_id, 'pos', 'earn',
          jsonb_build_object('card', v_card.id, 'ledger', v_id, 'points', v_pts, 'bill_bhd', p_bill, 'receipt', p_receipt));

  return query select v_id, v_pts, (select c.points from cards c where c.id = v_card.id), false;
end $$;

-- A refund takes back the points of that receipt (once). If the guest has already spent them the balance rule refuses it.
create or replace function ledger_pos_refund(p_venue uuid, p_receipt text)
returns table (ledger_id bigint, points_removed integer, new_balance integer, duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_old ledger;
  v_id  bigint;
begin
  select * into v_old from ledger where venue_id = p_venue and external_ref = p_receipt and kind = 'earn';
  if not found then raise exception 'receipt not found'; end if;
  perform 1 from cards where id = v_old.card_id for update;

  select id into v_id from ledger where venue_id = p_venue and external_ref = p_receipt and kind = 'undo';
  if found then
    return query select v_id, 0, (select c.points from cards c where c.id = v_old.card_id), true;
    return;
  end if;

  begin
    insert into ledger (card_id, venue_id, kind, points, undoes, source, external_ref, note)
    values (v_old.card_id, v_old.venue_id, 'undo', -v_old.points, v_old.id, 'pos', p_receipt, 'POS refund')
    returning id into v_id;
  exception when unique_violation then
    select id into v_id from ledger where venue_id = p_venue and external_ref = p_receipt and kind = 'undo';
    return query select v_id, 0, (select c.points from cards c where c.id = v_old.card_id), true;
    return;
  end;

  insert into audit_log (venue_id, actor, action, detail)
  values (v_old.venue_id, 'pos', 'refund',
          jsonb_build_object('card', v_old.card_id, 'ledger', v_id, 'points', -v_old.points, 'receipt', p_receipt));

  return query select v_id, v_old.points, (select c.points from cards c where c.id = v_old.card_id), false;
end $$;

revoke all on function ledger_pos_sale(uuid, text, numeric, text) from public, anon, authenticated;
revoke all on function ledger_pos_refund(uuid, text)              from public, anon, authenticated;
grant execute on function ledger_pos_sale(uuid, text, numeric, text) to service_role;
grant execute on function ledger_pos_refund(uuid, text)              to service_role;

-- One POS connection per venue. The key is shown once when made; only its SHA-256 hash is kept.
create table if not exists pos_connections (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null unique references venues(id) on delete cascade,
  provider      text not null default 'generic' check (provider in ('generic')),
  status        text not null default 'active' check (status in ('active', 'disabled')),
  key_hash      text not null unique,
  key_prefix    text not null,
  created_at    timestamptz not null default now(),
  rotated_at    timestamptz,
  last_event_at timestamptz
);
alter table pos_connections enable row level security;

create table if not exists pos_events (
  id         bigint generated always as identity primary key,
  venue_id   uuid not null references venues(id) on delete cascade,
  kind       text not null check (kind in ('sale', 'refund', 'ping')),
  receipt    text,
  outcome    text not null check (outcome in ('ok', 'duplicate', 'rejected', 'error')),
  points     integer,
  detail     text,
  created_at timestamptz not null default now()
);
create index if not exists pos_events_venue_idx on pos_events (venue_id, created_at desc);
alter table pos_events enable row level security;
