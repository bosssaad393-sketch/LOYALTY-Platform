-- Al Roshinah: the whole database in one file.
-- Made by web/scripts/make-roshinah-setup.py, run from the repository root (do not edit by hand): migrations 0001 to 0033 in order, then the two seeds.
-- Run ONCE on Al Roshinah's OWN new, EMPTY Supabase project (SQL editor, or as one migration). Not a second time:
-- the earliest parts stop with "already exists" on a database that has them.
-- Checked by web/tests/roshinahSetup.test.ts, which runs this exact file on a real Postgres engine and walks a guest
-- through joining, a visit, a gift, a table request and a till bill.

-- ===================================================================================================
-- 0001_init.sql
-- ===================================================================================================
-- Loyalty: initial schema (multi-venue from day one)
-- Points are never edited directly: every change is a row in `ledger`,
-- and `cards.points` is kept in sync by a trigger.

create extension if not exists pgcrypto;

-- Venues (one row per client) -------------------------------------------------
create table venues (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null check (slug ~ '^[a-z0-9-]+$'),
  name          text not null,
  brand         jsonb not null default '{}'::jsonb,  -- colours, logo url, card text
  points_per_bhd integer not null default 2 check (points_per_bhd between 1 and 100),
  reward_goal   integer not null default 500 check (reward_goal between 10 and 100000),
  reward_text   text not null default 'Reward chosen by the venue',
  terms_url     text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Staff accounts (linked to Supabase Auth users) -----------------------------
create type staff_role as enum ('staff', 'manager', 'owner', 'developer');

create table staff_users (
  id         uuid primary key default gen_random_uuid(),
  auth_user  uuid unique references auth.users(id) on delete cascade,
  venue_id   uuid not null references venues(id) on delete cascade,
  name       text not null,
  role       staff_role not null default 'staff',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Guests ----------------------------------------------------------------------
create table members (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(name) between 1 and 80),
  phone         text,
  email         text,
  consent_terms timestamptz not null,           -- when they agreed to the terms
  consent_news  boolean not null default false, -- offers on the Wallet card
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,                    -- "delete my data" (PDPL)
  check (phone is not null or email is not null)
);

-- One card per guest per venue -------------------------------------------------
create table cards (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references venues(id) on delete cascade,
  member_id       uuid not null references members(id) on delete cascade,
  code            char(4) not null check (code ~ '^[0-9]{4}$'),
  points          integer not null default 0,
  visits          integer not null default 0,
  rewards_given   integer not null default 0,
  last_visit      timestamptz,
  wallet_platform text check (wallet_platform in ('apple', 'google', 'image')),
  google_object_id text,
  apple_serial    text unique,
  apple_auth_token text,
  created_at      timestamptz not null default now(),
  unique (venue_id, member_id),
  unique (venue_id, code)
);

-- Points ledger (append-only) ---------------------------------------------------
create type ledger_kind as enum ('earn', 'redeem', 'undo', 'adjust', 'welcome');

create table ledger (
  id          bigint generated always as identity primary key,
  card_id     uuid not null references cards(id) on delete cascade,
  venue_id    uuid not null references venues(id) on delete cascade,
  kind        ledger_kind not null,
  points      integer not null,          -- positive = earn, negative = spend/undo
  bill_bhd    numeric(10,3),
  staff_id    uuid references staff_users(id),
  undoes      bigint references ledger(id),
  note        text,
  created_at  timestamptz not null default now()
);
create index ledger_card_idx on ledger(card_id, created_at desc);
create index ledger_venue_idx on ledger(venue_id, created_at desc);

create or replace function apply_ledger() returns trigger language plpgsql as $$
begin
  update cards set
    points        = points + new.points,
    visits        = visits + case when new.kind = 'earn' then 1 when new.kind = 'undo' and new.points < 0 then -1 else 0 end,
    rewards_given = rewards_given + case when new.kind = 'redeem' then 1 else 0 end,
    last_visit    = case when new.kind = 'earn' then new.created_at else last_visit end
  where id = new.card_id;
  if (select points from cards where id = new.card_id) < 0 then
    raise exception 'points cannot go below zero';
  end if;
  return new;
end $$;

create trigger ledger_apply after insert on ledger
  for each row execute function apply_ledger();

-- Offers pushed to Wallet cards ----------------------------------------------
create table offers (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  message    text not null check (length(message) <= 200),
  audience   text not null default 'all' check (audience in ('all', 'apple', 'google')),
  sent_by    uuid references staff_users(id),
  sent_at    timestamptz not null default now()
);

-- Apple Wallet: devices registered for pass updates ---------------------------
create table apple_registrations (
  device_id   text not null,
  push_token  text not null,
  card_id     uuid not null references cards(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (device_id, card_id)
);

-- Audit log --------------------------------------------------------------------
create table audit_log (
  id         bigint generated always as identity primary key,
  venue_id   uuid references venues(id) on delete cascade,
  actor      text not null,         -- staff id, 'guest', or 'system'
  action     text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Row level security: everything is locked by default.
-- The server uses the service-role key; staff access rules come in week 2.
alter table venues              enable row level security;
alter table staff_users         enable row level security;
alter table members             enable row level security;
alter table cards               enable row level security;
alter table ledger              enable row level security;
alter table offers              enable row level security;
alter table apple_registrations enable row level security;
alter table audit_log           enable row level security;

-- Demo venue ----------------------------------------------------------------------
-- Only so a fresh install has something to open at /join/demo. A real client gets its own row:
--   node web/scripts/new-client.mjs --name "Acme" --slug acme   (writes supabase/seeds/acme.sql)
insert into venues (slug, name, brand, points_per_bhd, reward_goal, reward_text)
values ('demo', 'Demo Venue',
        '{"background":"#141210","label":"#CDA55B","text":"#F3E9D2"}'::jsonb,
        2, 500, 'Reward chosen by the venue');

-- ===================================================================================================
-- 0002_ledger.sql
-- ===================================================================================================
-- Loyalty: ledger rules enforced in the database (migration 0002)
-- Points are only ever changed by these functions. Each one writes a ledger row;
-- the trigger from 0001 keeps cards.points in sync. Nothing here edits a balance directly.

-- An entry can be undone at most once.
create unique index if not exists ledger_one_undo on ledger (undoes) where kind = 'undo';

-- Same trigger as 0001, plus: undoing a redeem gives the reward back (rewards_given - 1).
create or replace function apply_ledger() returns trigger language plpgsql as $$
begin
  update cards set
    points        = points + new.points,
    visits        = visits + case when new.kind = 'earn' then 1
                                  when new.kind = 'undo' and new.points < 0 then -1 else 0 end,
    rewards_given = rewards_given + case when new.kind = 'redeem' then 1
                                         when new.kind = 'undo' and new.points > 0 then -1 else 0 end,
    last_visit    = case when new.kind = 'earn' then new.created_at else last_visit end
  where id = new.card_id;
  if (select points from cards where id = new.card_id) < 0 then
    raise exception 'points cannot go below zero';
  end if;
  return new;
end $$;

-- Earn: bill (BHD) x venue points_per_bhd, rounded down ---------------------------
create or replace function ledger_earn(p_card uuid, p_staff uuid, p_bill numeric)
returns table (ledger_id bigint, points_added integer, new_balance integer)
language plpgsql security definer set search_path = public as $$
declare
  v_card  cards;
  v_venue venues;
  v_staff staff_users;
  v_pts   integer;
  v_id    bigint;
begin
  select * into v_card from cards where id = p_card for update;   -- lock: no double spend
  if not found then raise exception 'card not found'; end if;
  select * into v_venue from venues where id = v_card.venue_id;
  select * into v_staff from staff_users where id = p_staff and active;
  if not found or v_staff.venue_id <> v_card.venue_id then
    raise exception 'staff member is not allowed at this venue';
  end if;
  if not v_venue.active then raise exception 'venue is not active'; end if;
  if p_bill is null or p_bill <= 0 or p_bill > 5000 then
    raise exception 'invalid bill amount';
  end if;
  v_pts := floor(p_bill * v_venue.points_per_bhd);
  if v_pts < 1 then raise exception 'bill is too small to earn points'; end if;

  insert into ledger (card_id, venue_id, kind, points, bill_bhd, staff_id)
  values (v_card.id, v_card.venue_id, 'earn', v_pts, p_bill, p_staff)
  returning id into v_id;

  insert into audit_log (venue_id, actor, action, detail)
  values (v_card.venue_id, p_staff::text, 'earn',
          jsonb_build_object('card', v_card.id, 'ledger', v_id, 'points', v_pts, 'bill_bhd', p_bill));

  return query select v_id, v_pts, (select c.points from cards c where c.id = p_card);
end $$;

-- Redeem: spends exactly reward_goal points -----------------------------------------
create or replace function ledger_redeem(p_card uuid, p_staff uuid)
returns table (ledger_id bigint, new_balance integer)
language plpgsql security definer set search_path = public as $$
declare
  v_card  cards;
  v_venue venues;
  v_staff staff_users;
  v_id    bigint;
begin
  select * into v_card from cards where id = p_card for update;
  if not found then raise exception 'card not found'; end if;
  select * into v_venue from venues where id = v_card.venue_id;
  select * into v_staff from staff_users where id = p_staff and active;
  if not found or v_staff.venue_id <> v_card.venue_id then
    raise exception 'staff member is not allowed at this venue';
  end if;
  if v_card.points < v_venue.reward_goal then
    raise exception 'not enough points to redeem';
  end if;

  insert into ledger (card_id, venue_id, kind, points, staff_id, note)
  values (v_card.id, v_card.venue_id, 'redeem', -v_venue.reward_goal, p_staff, v_venue.reward_text)
  returning id into v_id;

  insert into audit_log (venue_id, actor, action, detail)
  values (v_card.venue_id, p_staff::text, 'redeem',
          jsonb_build_object('card', v_card.id, 'ledger', v_id, 'points', -v_venue.reward_goal));

  return query select v_id, (select c.points from cards c where c.id = p_card);
end $$;

-- Undo: only earn/redeem, only once, only within 10 minutes ---------------------------
create or replace function ledger_undo(p_entry bigint, p_staff uuid)
returns table (ledger_id bigint, new_balance integer)
language plpgsql security definer set search_path = public as $$
declare
  v_entry ledger;
  v_staff staff_users;
  v_id    bigint;
begin
  select * into v_entry from ledger where id = p_entry for update;
  if not found then raise exception 'entry not found'; end if;
  perform 1 from cards where id = v_entry.card_id for update;
  select * into v_staff from staff_users where id = p_staff and active;
  if not found or v_staff.venue_id <> v_entry.venue_id then
    raise exception 'staff member is not allowed at this venue';
  end if;
  if v_entry.kind not in ('earn', 'redeem') then
    raise exception 'only earn and redeem entries can be undone';
  end if;
  if now() - v_entry.created_at > interval '10 minutes' then
    raise exception 'the 10 minute undo window has passed';
  end if;

  begin
    insert into ledger (card_id, venue_id, kind, points, staff_id, undoes)
    values (v_entry.card_id, v_entry.venue_id, 'undo', -v_entry.points, p_staff, v_entry.id)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'this entry was already undone';
  end;

  insert into audit_log (venue_id, actor, action, detail)
  values (v_entry.venue_id, p_staff::text, 'undo',
          jsonb_build_object('card', v_entry.card_id, 'undid', v_entry.id, 'ledger', v_id));

  return query select v_id, (select c.points from cards c where c.id = v_entry.card_id);
end $$;

-- Only the server (service role) may call these. Never the browser.
revoke all on function ledger_earn(uuid, uuid, numeric)   from public, anon, authenticated;
revoke all on function ledger_redeem(uuid, uuid)          from public, anon, authenticated;
revoke all on function ledger_undo(bigint, uuid)          from public, anon, authenticated;
grant execute on function ledger_earn(uuid, uuid, numeric) to service_role;
grant execute on function ledger_redeem(uuid, uuid)        to service_role;
grant execute on function ledger_undo(bigint, uuid)        to service_role;

-- ===================================================================================================
-- 0003_owner_offers_privacy.sql
-- ===================================================================================================
-- Loyalty: owner offers + data-privacy tools (migration 0003)
-- Adds: venue terms text, deletion requests from guests (PDPL), and a recipients count on offers.
-- Safe to run once on top of 0001 and 0002. Nothing here changes points or ledger rules.

-- 1. The venue's own terms and conditions ---------------------------------------------
-- NULL = the guest page shows the built-in clauses. Set from the owner app (PUT /api/owner/terms).
alter table venues
  add column if not exists terms_text text
    check (terms_text is null or char_length(terms_text) between 50 and 8000),
  add column if not exists terms_updated_at timestamptz;

-- 2. Offers: how many guests each one was addressed to ----------------------------------
alter table offers
  add column if not exists recipients integer not null default 0 check (recipients >= 0);

create index if not exists offers_venue_sent_idx on offers (venue_id, sent_at desc);

-- 3. Guests asking for their data to be deleted ------------------------------------------
-- card_id has NO foreign key on purpose: erasing the guest deletes the card, and the request
-- must stay as history. The row holds no name, phone or email.
create table if not exists deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null references venues(id) on delete cascade,
  card_id      uuid,
  requested_at timestamptz not null default now(),
  status       text not null default 'pending' check (status in ('pending', 'erased')),
  erased_at    timestamptz
);

create index if not exists deletion_requests_venue_status_idx on deletion_requests (venue_id, status);

-- One pending request per card (asking twice does not create a second row).
create unique index if not exists deletion_requests_one_pending_per_card
  on deletion_requests (card_id) where status = 'pending' and card_id is not null;

-- Locked by default like every other table: only the server (service role) reads or writes it.
alter table deletion_requests enable row level security;

-- ===================================================================================================
-- 0004_offer_withdraw.sql
-- ===================================================================================================
-- Loyalty: withdraw a sent offer (migration 0004)
-- Adds when an offer was withdrawn and by whom. A withdrawn offer stays in the list as history,
-- but it stops showing on Wallet cards (Apple passes are rebuilt without it).
-- Safe to run more than once, and on top of 0001, 0002 and 0003. Nothing here changes points or ledger rules.
-- Apply it BEFORE deploying the code that reads these columns.

alter table offers
  add column if not exists withdrawn_at timestamptz,
  -- Who withdrew it. If that staff account is ever deleted, the offer keeps its history and the link is cleared.
  add column if not exists withdrawn_by uuid references staff_users(id) on delete set null;

-- ===================================================================================================
-- 0005_owner_assistant.sql
-- ===================================================================================================
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

-- ===================================================================================================
-- 0006_pos_connector.sql
-- ===================================================================================================
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

-- ===================================================================================================
-- 0007_staff_perks.sql
-- ===================================================================================================
-- 0007: staff perks ("shift over, enjoy this"). The owner gives a team member a thank-you: a discount, a voucher, a free meal.
-- The title and note are the owner's own words (no amounts or rules are built in). The staff member sees it on the staff screen,
-- shows it to the owner or manager, and marks it used. Not applied to any database yet: run on the client's OWN project, after a backup.

create table if not exists staff_perks (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues(id) on delete cascade,
  staff_id    uuid not null references staff_users(id) on delete cascade,
  title       text not null check (length(trim(title)) between 2 and 80),
  note        text check (note is null or length(note) <= 200),
  valid_until date,
  status      text not null default 'ready' check (status in ('ready', 'claimed', 'cancelled')),
  granted_by  uuid references staff_users(id),
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz
);
create index if not exists staff_perks_staff_idx on staff_perks (staff_id, status);
create index if not exists staff_perks_venue_idx on staff_perks (venue_id, created_at desc);
alter table staff_perks enable row level security;

-- ===================================================================================================
-- 0008_pin_login.sql
-- ===================================================================================================
-- 0008: PIN sign-in for staff, managers and owners (instead of email + password).
--   * staff_users.pin_lookup: a keyed hash (HMAC with a server-side secret) of the PIN. The PIN itself is never stored, and the
--     hash cannot be checked without the server secret. Unique, so one PIN belongs to one person.
--   * pin_attempts: failed sign-ins (hashed caller address + time), used to lock guessing out, across all server instances.
-- Not applied to any database yet: run on the client's OWN project, after a backup.

alter table staff_users add column if not exists pin_lookup text;
alter table staff_users add column if not exists pin_set_at timestamptz;
create unique index if not exists staff_users_pin_lookup_idx on staff_users (pin_lookup) where pin_lookup is not null;

create table if not exists pin_attempts (
  id      bigint generated always as identity primary key,
  who     text not null,                       -- HMAC of the caller's address, never the address itself
  at      timestamptz not null default now()
);
create index if not exists pin_attempts_at_idx on pin_attempts (at desc);
create index if not exists pin_attempts_who_idx on pin_attempts (who, at desc);
alter table pin_attempts enable row level security;

-- ===================================================================================================
-- 0009_dev_chat.sql
-- ===================================================================================================
-- 0009: developer chat with CALABOS. The developer types what they need; CALABOS (running on the developer's own PC) fetches new messages
-- through a bridge endpoint (a long random token, no database key) and answers. Nothing here gives CALABOS access to guests or points.
-- Not applied anywhere yet: run on the client's OWN project, after a backup.

create table if not exists dev_messages (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  author     text not null check (author in ('dev', 'calabos')),
  body       text not null check (length(body) between 1 and 4000),
  status     text not null default 'new' check (status in ('new', 'done')),   -- only meaningful for author = 'dev'
  reply_to   uuid references dev_messages(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists dev_messages_venue_idx on dev_messages (venue_id, created_at desc);
create index if not exists dev_messages_new_idx on dev_messages (venue_id, status) where author = 'dev';
alter table dev_messages enable row level security;

-- ===================================================================================================
-- 0010_table_service.sql
-- ===================================================================================================
-- 0010: table service. Guests order and call from the table, staff work a live board, the owner sees wait times.
-- Money is integer fils (BHD 1.500 = 1500), so totals never pick up rounding errors.
-- Not applied to any database yet: run on the client's OWN project, after a backup.

create table if not exists venue_tables (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  label      text not null check (length(trim(label)) between 1 and 20),
  token      text not null unique check (length(token) >= 16), -- in the printed QR code; a long random value, not the table number
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (venue_id, label)
);

create table if not exists menu_categories (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  name_en    text not null check (length(trim(name_en)) between 1 and 60),
  name_ar    text check (name_ar is null or length(name_ar) <= 60),
  sort       integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists menu_categories_venue_idx on menu_categories (venue_id, sort);

create table if not exists menu_items (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues(id) on delete cascade,
  category_id uuid not null references menu_categories(id) on delete cascade,
  name_en     text not null check (length(trim(name_en)) between 1 and 80),
  name_ar     text check (name_ar is null or length(name_ar) <= 80),
  note_en     text check (note_en is null or length(note_en) <= 200),
  note_ar     text check (note_ar is null or length(note_ar) <= 200),
  price_fils  integer not null check (price_fils between 0 and 10000000),
  image_url   text,                          -- set only by the server, after checking the file
  available   boolean not null default true, -- false = sold out today
  active      boolean not null default true, -- false = removed from the menu (old orders keep their own copy of the name and price)
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists menu_items_venue_idx on menu_items (venue_id, category_id, sort);

-- One open tab per table: rounds add up on it until it is paid.
create table if not exists tabs (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues(id) on delete cascade,
  table_id    uuid not null references venue_tables(id) on delete cascade,
  status      text not null default 'open' check (status in ('open', 'paid')),
  paid_method text check (paid_method in ('cash')),
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz,
  closed_by   uuid references staff_users(id)
);
create unique index if not exists tabs_one_open_per_table on tabs (table_id) where status = 'open';
create index if not exists tabs_venue_idx on tabs (venue_id, status);

-- One row per round.
create table if not exists orders (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references venues(id) on delete cascade,
  tab_id        uuid not null references tabs(id) on delete cascade,
  table_id      uuid not null references venue_tables(id) on delete cascade,
  status        text not null default 'new' check (status in ('new', 'accepted', 'ready', 'served', 'cancelled')),
  source        text not null default 'guest' check (source in ('guest', 'staff')),
  ready_minutes integer check (ready_minutes in (10, 20)),
  created_by    uuid references staff_users(id),
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  ready_at      timestamptz,
  served_at     timestamptz,
  cancelled_at  timestamptz
);
create index if not exists orders_tab_idx on orders (tab_id, created_at);
create index if not exists orders_venue_idx on orders (venue_id, created_at desc);

-- Name and price are copied at order time, so a later menu change never rewrites an old bill.
create table if not exists order_items (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  order_id   uuid not null references orders(id) on delete cascade,
  item_id    uuid references menu_items(id) on delete set null,
  name_en    text not null,
  name_ar    text,
  price_fils integer not null check (price_fils >= 0),
  qty        integer not null check (qty between 1 and 20),
  note       text check (note is null or length(note) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on order_items (order_id);
create index if not exists order_items_venue_idx on order_items (venue_id, created_at desc);

-- The service clock: coal, waiter, bill. Timed from the guest's tap to the moment staff mark it done.
create table if not exists table_requests (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  tab_id     uuid not null references tabs(id) on delete cascade,
  table_id   uuid not null references venue_tables(id) on delete cascade,
  kind       text not null check (kind in ('coal', 'waiter', 'bill')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references staff_users(id)
);
create unique index if not exists table_requests_one_open on table_requests (tab_id, kind) where handled_at is null;
create index if not exists table_requests_venue_idx on table_requests (venue_id, created_at desc);

-- Menu photos are public pictures in their own storage folder. Only the server (service role) can add them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu', 'menu', true, 614400, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

-- Locked by default, like every other table: only the server (service role) reads and writes these.
alter table venue_tables    enable row level security;
alter table menu_categories enable row level security;
alter table menu_items      enable row level security;
alter table tabs            enable row level security;
alter table orders          enable row level security;
alter table order_items     enable row level security;
alter table table_requests  enable row level security;

-- ===================================================================================================
-- 0011_rename_sample_venue.sql
-- ===================================================================================================
-- 0011: the sample venue from 0001 is now called Orbyn, slug orbyn. Run together with 0010 on the client's OWN project, after a backup.
-- Only touches that one row. A real client's venue has its own slug and is not affected.
update venues
set slug = 'orbyn',
    name = 'Orbyn',
    reward_text = replace(reward_text, 'Demo Venue', 'Orbyn')
where slug = 'demo'
  and not exists (select 1 from venues where slug = 'orbyn');

-- ===================================================================================================
-- 0012_tap_payments.sql
-- ===================================================================================================
-- 0012: guests pay their table's tab on Tap's own payment page (BENEFIT, cards, Apple Pay: whatever the venue's Tap account offers).
-- The money goes straight to the venue's own Tap account; Orbyn never holds it. A payment counts only once the server has asked
-- Tap itself and Tap says CAPTURED for the same amount. Money is integer fils (BHD 1.500 = 1500).
-- Safe to run twice. Run it on the project after a backup.

-- A tab can now be closed by a card payment, or by card plus the rest in cash.
alter table tabs drop constraint if exists tabs_paid_method_check;
alter table tabs add constraint tabs_paid_method_check check (paid_method in ('cash', 'tap', 'mixed'));

-- "Pay cash" on the table page calls staff with the bill, as its own kind so the board says cash.
alter table table_requests drop constraint if exists table_requests_kind_check;
alter table table_requests add constraint table_requests_kind_check check (kind in ('coal', 'waiter', 'bill', 'cash'));

create table if not exists payments (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references venues(id) on delete cascade,
  tab_id          uuid not null references tabs(id) on delete cascade,
  provider        text not null default 'tap' check (provider in ('tap')),
  charge_id       text unique,                    -- Tap's chg_... id, set once Tap has made the charge
  amount_fils     integer not null check (amount_fils > 0),
  currency        text not null default 'BHD' check (currency = 'BHD'),
  -- initiated = sent to Tap, not paid yet; captured = Tap confirmed the money; failed = declined, cancelled or abandoned;
  -- review = Tap answered something that does not match this payment (amount, currency, reference): a person must look.
  status          text not null default 'initiated' check (status in ('initiated', 'captured', 'failed', 'review')),
  provider_status text,                           -- Tap's own word, e.g. CAPTURED, DECLINED
  method          text,                           -- benefit or card as the guest chose it; once paid, what Tap reports (BENEFIT, VISA...)
  pay_url         text,                           -- Tap's payment page for this charge, so a second tap on Pay reuses it
  note            text check (note is null or length(note) <= 300),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  paid_at         timestamptz
);
create index if not exists payments_tab_idx on payments (tab_id, created_at);
create index if not exists payments_venue_idx on payments (venue_id, created_at desc);

-- Locked like every other table: only the server (service role) reads and writes payments.
alter table payments enable row level security;

-- ===================================================================================================
-- 0013_tab_points.sql
-- ===================================================================================================
-- 0013: points for a table's bill, added by themselves when the tab is paid.
-- A guest who has opened their card on their phone is linked to the tab of the table they order from; when the tab is paid
-- (card, BENEFIT or cash) the bill's points go to that card through ledger_pos_sale with the receipt "tab:<tab id>", so the
-- same bill can never earn twice. Safe to run twice. Run it after 0012, after a backup.

alter table tabs add column if not exists card_id uuid references cards(id) on delete set null;
alter table tabs add column if not exists points_added integer check (points_added is null or points_added >= 0);
create index if not exists tabs_card_idx on tabs (card_id) where card_id is not null;

-- ===================================================================================================
-- 0014_rate_limiting.sql
-- ===================================================================================================
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

-- ===================================================================================================
-- 0015_owner_summary.sql
-- ===================================================================================================
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

-- ===================================================================================================
-- 0016_pin_per_venue.sql
-- ===================================================================================================
-- 0016: a PIN belongs to one venue.
-- Before: PINs were unique across the whole platform and PIN sign-in searched every venue. Setting a PIN answered "taken"
-- when anyone anywhere had it, which told an owner of one venue that a PIN works somewhere, possibly at another venue,
-- and PIN sign-in would then let them in. With 4-digit staff PINs there are only about 9000 for the whole platform.
-- After: unique per venue, and sign-in always names the venue (the app sends it), so a PIN only ever opens its own venue.
-- staff_users has no deleted_at column (people are deactivated with active = false and keep their row), so the index covers
-- every row with a PIN: a deactivated person's PIN stays reserved and reactivating them cannot clash.
-- Safe on existing data: the old platform-wide unique index already guarantees per-venue uniqueness.

create unique index if not exists staff_users_pin_per_venue on staff_users (venue_id, pin_lookup) where pin_lookup is not null;
drop index if exists staff_users_pin_lookup_idx;

-- ===================================================================================================
-- 0017_venue_links.sql
-- ===================================================================================================
-- 0017: the venue's public links, shown at the foot of the guest home page.
--   * instagram_url: the venue's Instagram page.
--   * google_review_url: the "write a review" link from the venue's Google Business profile.
-- Both optional (null = the link is not shown). Set by the owner on the Rules screen. https only.
-- Safe to apply before or after the code: the home page reads these columns on their own and carries on without them.

alter table venues add column if not exists instagram_url text
  check (instagram_url is null or (length(instagram_url) <= 300 and instagram_url ~ '^https://'));
alter table venues add column if not exists google_review_url text
  check (google_review_url is null or (length(google_review_url) <= 500 and google_review_url ~ '^https://'));

-- ===================================================================================================
-- 0018_feedback.sql
-- ===================================================================================================
-- 0018: guest feedback from the counter page (/counter/<venue>), read by the owner on the Feedback screen.
--   * Only a guest holding this venue's loyalty card can send it (checked in the route: /api/feedback).
--   * One row per message: a rating from 1 to 5 and an optional note (600 characters at most).
--   * Removed with the card when a guest's data is erased (on delete cascade).
-- Apply BEFORE the code that reads it goes live: without the table the Feedback screen shows a load error.

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  message text check (message is null or length(message) <= 600),
  created_at timestamptz not null default now()
);

create index if not exists feedback_venue_created on feedback (venue_id, created_at desc);

-- Locked like every other table: only the server (service role) reads and writes it.
alter table feedback enable row level security;

-- ===================================================================================================
-- 0019_reward_request.sql
-- ===================================================================================================
-- 0019: a guest can use their points for the venue's reward from their table ("Redeem points"). The points come off the
-- card at once (ledger_redeem_guest: no staff member on the entry, the audit log says 'guest'), and the staff board gets
-- its own kind of call saying what to bring.
-- Safe to run twice. Run it on the project after a backup.

alter table table_requests drop constraint if exists table_requests_kind_check;
alter table table_requests add constraint table_requests_kind_check check (kind in ('coal', 'waiter', 'bill', 'cash', 'reward'));

-- Same rules as ledger_redeem (0002), without a staff member: spends exactly reward_goal points, never below zero.
create or replace function ledger_redeem_guest(p_card uuid)
returns table (ledger_id bigint, new_balance integer)
language plpgsql security definer set search_path = public as $$
declare
  v_card  cards;
  v_venue venues;
  v_id    bigint;
begin
  select * into v_card from cards where id = p_card for update;
  if not found then raise exception 'card not found'; end if;
  select * into v_venue from venues where id = v_card.venue_id;
  if v_card.points < v_venue.reward_goal then
    raise exception 'not enough points to redeem';
  end if;

  insert into ledger (card_id, venue_id, kind, points, staff_id, note)
  values (v_card.id, v_card.venue_id, 'redeem', -v_venue.reward_goal, null, v_venue.reward_text)
  returning id into v_id;

  insert into audit_log (venue_id, actor, action, detail)
  values (v_card.venue_id, 'guest', 'redeem',
          jsonb_build_object('card', v_card.id, 'ledger', v_id, 'points', -v_venue.reward_goal, 'from', 'table'));

  return query select v_id, (select c.points from cards c where c.id = p_card);
end $$;

revoke all on function ledger_redeem_guest(uuid) from public, anon, authenticated;
grant execute on function ledger_redeem_guest(uuid) to service_role;

-- ===================================================================================================
-- 0020_stamp_mode.sql
-- ===================================================================================================
-- Stamp mode (migration 0020, 2026-11-20, first used by Spaloon)
-- A venue with stamp_tiers set runs on stamps instead of points per BHD:
--   * one stamp (= 1 point in the ledger) per paid visit, added by staff with ledger_stamp;
--   * rewards come in order, e.g. [{"at":3,"text":"10% off"},{"at":6,"text":"..."},{"at":9,"text":"..."}];
--   * each reward costs the stamps between it and the previous one (3, 3, 3 above), and which reward is
--     due follows from cards.rewards_given (0 -> first, 1 -> second, ...; after the last it starts again).
-- Points venues (stamp_tiers null) are unchanged. Undo keeps working: undoing a redeem gives the stamps back
-- and lowers rewards_given, so the same reward is due again.

alter table venues add column if not exists stamp_tiers jsonb
  check (stamp_tiers is null or (jsonb_typeof(stamp_tiers) = 'array' and jsonb_array_length(stamp_tiers) between 1 and 6));

-- Stamp venues use small goals (3 stamps); points venues keep their old range in practice.
alter table venues drop constraint if exists venues_reward_goal_check;
alter table venues add constraint venues_reward_goal_check check (reward_goal between 1 and 100000);

-- Cost and text of the reward due next for a card (stamp venues only).
create or replace function stamp_due(p_tiers jsonb, p_rewards_given integer)
returns table (cost integer, reward text)
language plpgsql immutable as $$
declare
  n    integer := jsonb_array_length(p_tiers);
  i    integer := mod(greatest(p_rewards_given, 0), n);
  prev integer := case when i = 0 then 0 else (p_tiers -> (i - 1) ->> 'at')::integer end;
begin
  return query select ((p_tiers -> i ->> 'at')::integer - prev), (p_tiers -> i ->> 'text');
end $$;

-- Add one stamp ---------------------------------------------------------------------
create or replace function ledger_stamp(p_card uuid, p_staff uuid)
returns table (ledger_id bigint, new_balance integer)
language plpgsql security definer set search_path = public as $$
declare
  v_card  cards;
  v_venue venues;
  v_staff staff_users;
  v_id    bigint;
begin
  select * into v_card from cards where id = p_card for update;
  if not found then raise exception 'card not found'; end if;
  select * into v_venue from venues where id = v_card.venue_id;
  select * into v_staff from staff_users where id = p_staff and active;
  if not found or v_staff.venue_id <> v_card.venue_id then
    raise exception 'staff member is not allowed at this venue';
  end if;
  if not v_venue.active then raise exception 'venue is not active'; end if;
  if v_venue.stamp_tiers is null then raise exception 'this venue does not use stamps'; end if;
  if exists (select 1 from ledger l where l.card_id = p_card and l.kind = 'earn'
             and l.created_at > now() - interval '30 minutes'
             and not exists (select 1 from ledger u where u.undoes = l.id)) then
    raise exception 'already stamped in the last 30 minutes';
  end if;

  insert into ledger (card_id, venue_id, kind, points, staff_id, note)
  values (v_card.id, v_card.venue_id, 'earn', 1, p_staff, 'stamp')
  returning id into v_id;

  insert into audit_log (venue_id, actor, action, detail)
  values (v_card.venue_id, p_staff::text, 'stamp', jsonb_build_object('card', v_card.id, 'ledger', v_id));

  return query select v_id, (select c.points from cards c where c.id = p_card);
end $$;

-- Redeem: points venues as before; stamp venues spend the due reward's cost ---------------------
create or replace function ledger_redeem(p_card uuid, p_staff uuid)
returns table (ledger_id bigint, new_balance integer)
language plpgsql security definer set search_path = public as $$
declare
  v_card  cards;
  v_venue venues;
  v_staff staff_users;
  v_id    bigint;
  v_cost  integer;
  v_text  text;
begin
  select * into v_card from cards where id = p_card for update;
  if not found then raise exception 'card not found'; end if;
  select * into v_venue from venues where id = v_card.venue_id;
  select * into v_staff from staff_users where id = p_staff and active;
  if not found or v_staff.venue_id <> v_card.venue_id then
    raise exception 'staff member is not allowed at this venue';
  end if;
  if v_venue.stamp_tiers is null then
    v_cost := v_venue.reward_goal;
    v_text := v_venue.reward_text;
  else
    select d.cost, d.reward into v_cost, v_text from stamp_due(v_venue.stamp_tiers, v_card.rewards_given) d;
  end if;
  if v_card.points < v_cost then
    raise exception 'not enough points to redeem';
  end if;

  insert into ledger (card_id, venue_id, kind, points, staff_id, note)
  values (v_card.id, v_card.venue_id, 'redeem', -v_cost, p_staff, v_text)
  returning id into v_id;

  insert into audit_log (venue_id, actor, action, detail)
  values (v_card.venue_id, p_staff::text, 'redeem',
          jsonb_build_object('card', v_card.id, 'ledger', v_id, 'points', -v_cost, 'reward', v_text));

  return query select v_id, (select c.points from cards c where c.id = p_card);
end $$;

revoke all on function ledger_stamp(uuid, uuid)  from public, anon, authenticated;
revoke all on function ledger_redeem(uuid, uuid) from public, anon, authenticated;
grant execute on function ledger_stamp(uuid, uuid)  to service_role;
grant execute on function ledger_redeem(uuid, uuid) to service_role;

-- ===================================================================================================
-- 0021_venue_wifi.sql
-- ===================================================================================================
-- 0021: the venue's guest Wi-Fi, shown on the guest page (a Wi-Fi button with the network name and a copy-password button).
--   * wifi_ssid: the network name guests see on their phone.
--   * wifi_password: the guest network password (it is shown to every guest on the public page, so use a guest network).
-- Both optional (null = no Wi-Fi button). Set by the owner on the Rules screen.
-- Safe to apply before or after the code: the code reads these columns on their own and carries on without them.

alter table venues add column if not exists wifi_ssid text
  check (wifi_ssid is null or length(wifi_ssid) between 1 and 64);
alter table venues add column if not exists wifi_password text
  check (wifi_password is null or length(wifi_password) <= 128);

-- ===================================================================================================
-- 0022_branches_visits_vouchers.sql
-- ===================================================================================================
-- Branches, visit cards, one-time vouchers and automatic notices (migration 0022, 2026-11-25, first used by Al Roshinah)
--
-- * A venue is ONE business with ONE loyalty card. It can now have several BRANCHES (Sanad, Zallaq, ...).
--   Guests and cards belong to the business; staff, scans and vouchers know which branch they happened at.
--   A branch of kind 'partner' is a counter that only REDEEMS vouchers (e.g. a sister restaurant): no visits there.
-- * card_mode 'visits': the card has no points and no stamps. Staff scan the card once per paid visit (ledger_visit).
-- * Vouchers: a voucher the venue defines can be unlocked on a card by a staff scan (trigger 'first_visit' or
--   'every_visit') or by the owner ('manual'). Each guest gets a given voucher ONCE and it is redeemed ONCE
--   (voucher_redeem), optionally only at one branch.
-- * Automatic notices: birthday and "we miss you" (no visit for N days). message_log keeps one row per card, kind
--   and period, so a notice is never sent twice.
-- Venues without branches and with card_mode null behave exactly as before.

-- Branches ------------------------------------------------------------------------------------
create table if not exists branches (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  slug       text not null check (slug ~ '^[a-z0-9-]{1,40}$'),
  name       text not null check (length(name) between 1 and 80),
  name_ar    text,
  kind       text not null default 'branch' check (kind in ('branch', 'partner')),
  address    text,
  phone      text,
  maps_url   text,
  review_url text,   -- Google review link of this branch: shown to every guest, never rewarded, never gated
  menu_url   text,
  lat        double precision check (lat is null or lat between -90 and 90),
  lng        double precision check (lng is null or lng between -180 and 180),
  sort       integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (venue_id, slug)
);
create index if not exists branches_venue_idx on branches(venue_id, sort);
alter table branches enable row level security;

-- null branch = may work at every branch (owner, manager, developer; staff of a venue with no branches).
alter table staff_users add column if not exists branch_id uuid references branches(id) on delete set null;
alter table ledger      add column if not exists branch_id uuid references branches(id) on delete set null;
alter table audit_log   add column if not exists branch_id uuid references branches(id) on delete set null;
alter table cards       add column if not exists joined_branch uuid references branches(id) on delete set null;
create index if not exists ledger_branch_idx on ledger(branch_id, created_at desc);

-- Guest details -------------------------------------------------------------------------------
-- Birthday is optional. Only day and month are needed for the birthday notice; the year is kept when given.
alter table members add column if not exists birth_day   smallint check (birth_day is null or birth_day between 1 and 31);
alter table members add column if not exists birth_month smallint check (birth_month is null or birth_month between 1 and 12);
alter table members add column if not exists birth_year  smallint check (birth_year is null or birth_year between 1900 and 2100);
create index if not exists members_birthday_idx on members(birth_month, birth_day) where birth_month is not null;

-- Venue settings ------------------------------------------------------------------------------
alter table venues add column if not exists card_mode text check (card_mode is null or card_mode in ('visits'));
-- Which fields the join page asks for besides the name: any of mobile, email, birthday. Empty/null = mobile only.
alter table venues add column if not exists join_fields text[];
-- A second scan of the same card inside this many minutes is refused (one visit per sitting).
alter table venues add column if not exists visit_gap_minutes integer not null default 180 check (visit_gap_minutes between 1 and 1440);
-- Fraud guard: one staff member cannot record more visits than this in 24 hours.
alter table venues add column if not exists visit_cap_per_staff integer not null default 250 check (visit_cap_per_staff between 1 and 5000);

-- Vouchers ------------------------------------------------------------------------------------
create table if not exists vouchers (
  id               uuid primary key default gen_random_uuid(),
  venue_id         uuid not null references venues(id) on delete cascade,
  title            text not null check (length(title) between 1 and 80),
  title_ar         text,
  detail           text check (detail is null or length(detail) <= 300),
  detail_ar        text,
  trigger          text not null default 'first_visit' check (trigger in ('first_visit', 'every_visit', 'manual')),
  redeem_branch_id uuid references branches(id) on delete set null,   -- null = any branch of the venue
  valid_days       integer check (valid_days is null or valid_days between 1 and 730),
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);
create index if not exists vouchers_venue_idx on vouchers(venue_id) where active;
alter table vouchers enable row level security;

create table if not exists card_vouchers (
  id              uuid primary key default gen_random_uuid(),
  card_id         uuid not null references cards(id) on delete cascade,
  venue_id        uuid not null references venues(id) on delete cascade,
  voucher_id      uuid not null references vouchers(id) on delete cascade,
  status          text not null default 'issued' check (status in ('issued', 'redeemed', 'void')),
  issued_at       timestamptz not null default now(),
  issued_by       uuid references staff_users(id),
  issued_branch   uuid references branches(id) on delete set null,
  expires_at      timestamptz,
  redeemed_at     timestamptz,
  redeemed_by     uuid references staff_users(id),
  redeemed_branch uuid references branches(id) on delete set null,
  voided_at       timestamptz,
  voided_by       uuid references staff_users(id),
  -- One of each voucher per guest, ever: this is what makes "redeemable once" hold even under double taps.
  unique (card_id, voucher_id)
);
create index if not exists card_vouchers_card_idx on card_vouchers(card_id);
create index if not exists card_vouchers_venue_idx on card_vouchers(venue_id, status, issued_at desc);
alter table card_vouchers enable row level security;

-- Automatic notices ---------------------------------------------------------------------------
create table if not exists auto_messages (
  venue_id uuid not null references venues(id) on delete cascade,
  kind     text not null check (kind in ('birthday', 'winback')),
  enabled  boolean not null default true,
  text_en  text not null check (length(text_en) between 1 and 200),
  text_ar  text check (text_ar is null or length(text_ar) <= 200),
  days     integer not null default 14 check (days between 1 and 365),  -- winback: days without a visit
  primary key (venue_id, kind)
);
alter table auto_messages enable row level security;

create table if not exists message_log (
  id       bigint generated always as identity primary key,
  card_id  uuid not null references cards(id) on delete cascade,
  venue_id uuid not null references venues(id) on delete cascade,
  kind     text not null check (kind in ('birthday', 'winback')),
  period   text not null,           -- birthday: the year; winback: the date of the last visit it answers
  message  text not null,
  sent_at  timestamptz not null default now(),
  unique (card_id, kind, period)
);
create index if not exists message_log_card_idx on message_log(card_id, sent_at desc);
alter table message_log enable row level security;

-- Record a visit ------------------------------------------------------------------------------
-- One row in the ledger (kind earn, 0 points: the trigger from 0001 counts the visit and sets last_visit), and any
-- voucher the visit unlocks. Everything is checked here, so no screen can skip a rule.
create or replace function ledger_visit(p_card uuid, p_staff uuid, p_branch uuid)
returns table (ledger_id bigint, visits integer, vouchers_issued integer)
language plpgsql security definer set search_path = public as $$
declare
  v_card   cards;
  v_venue  venues;
  v_staff  staff_users;
  v_branch branches;
  v_id     bigint;
  v_new    integer := 0;
  v_first  boolean;
  r        vouchers;
begin
  select * into v_card from cards where id = p_card for update;
  if not found then raise exception 'card not found'; end if;
  select * into v_venue from venues where id = v_card.venue_id;
  select * into v_staff from staff_users where id = p_staff and active;
  if not found or v_staff.venue_id <> v_card.venue_id then
    raise exception 'staff member is not allowed at this venue';
  end if;
  if not v_venue.active then raise exception 'venue is not active'; end if;
  if v_venue.card_mode is distinct from 'visits' then raise exception 'this venue does not use visit cards'; end if;

  if p_branch is not null then
    select * into v_branch from branches where id = p_branch and venue_id = v_card.venue_id and active;
    if not found then raise exception 'branch not found'; end if;
    if v_branch.kind <> 'branch' then raise exception 'visits cannot be recorded at this counter'; end if;
  elsif exists (select 1 from branches b where b.venue_id = v_card.venue_id and b.active and b.kind = 'branch') then
    raise exception 'choose a branch first';
  end if;
  if v_staff.branch_id is not null and v_staff.branch_id is distinct from p_branch then
    raise exception 'staff member is not allowed at this branch';
  end if;

  if exists (select 1 from ledger l where l.card_id = p_card and l.kind = 'earn'
             and l.created_at > now() - make_interval(mins => v_venue.visit_gap_minutes)
             and not exists (select 1 from ledger u where u.undoes = l.id)) then
    raise exception 'visit already recorded';
  end if;
  if (select count(*) from ledger l where l.staff_id = p_staff and l.kind = 'earn' and l.note = 'visit'
        and l.created_at > now() - interval '24 hours') >= v_venue.visit_cap_per_staff then
    raise exception 'daily scan limit reached';
  end if;

  v_first := not exists (select 1 from ledger l where l.card_id = p_card and l.kind = 'earn' and l.note = 'visit');

  insert into ledger (card_id, venue_id, kind, points, staff_id, note, branch_id)
  values (v_card.id, v_card.venue_id, 'earn', 0, p_staff, 'visit', p_branch)
  returning id into v_id;

  for r in select * from vouchers v where v.venue_id = v_card.venue_id and v.active
             and (v.trigger = 'every_visit' or (v.trigger = 'first_visit' and v_first)) loop
    insert into card_vouchers (card_id, venue_id, voucher_id, issued_by, issued_branch, expires_at)
    values (v_card.id, v_card.venue_id, r.id, p_staff, p_branch,
            case when r.valid_days is null then null else now() + make_interval(days => r.valid_days) end)
    on conflict (card_id, voucher_id) do nothing;
    if found then v_new := v_new + 1; end if;
  end loop;

  insert into audit_log (venue_id, branch_id, actor, action, detail)
  values (v_card.venue_id, p_branch, p_staff::text, 'visit',
          jsonb_build_object('card', v_card.id, 'ledger', v_id, 'vouchers_issued', v_new));

  return query select v_id, (select c.visits from cards c where c.id = p_card), v_new;
end $$;

-- Redeem a voucher (once) ---------------------------------------------------------------------
create or replace function voucher_redeem(p_card_voucher uuid, p_staff uuid, p_branch uuid)
returns table (card_voucher_id uuid, redeemed_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_cv      card_vouchers;
  v_voucher vouchers;
  v_staff   staff_users;
  v_now     timestamptz := now();
begin
  select * into v_cv from card_vouchers where id = p_card_voucher for update;
  if not found then raise exception 'voucher not found'; end if;
  select * into v_voucher from vouchers where id = v_cv.voucher_id;
  select * into v_staff from staff_users where id = p_staff and active;
  if not found or v_staff.venue_id <> v_cv.venue_id then
    raise exception 'staff member is not allowed at this venue';
  end if;
  if p_branch is not null and not exists (select 1 from branches b where b.id = p_branch and b.venue_id = v_cv.venue_id and b.active) then
    raise exception 'branch not found';
  end if;
  if v_staff.branch_id is not null and v_staff.branch_id is distinct from p_branch then
    raise exception 'staff member is not allowed at this branch';
  end if;
  -- Fraud guard, like visits: one person cannot use up more vouchers in 24 hours than the venue's daily scan limit.
  if (select count(*) from card_vouchers x where x.redeemed_by = p_staff and x.redeemed_at > v_now - interval '24 hours')
       >= (select visit_cap_per_staff from venues where id = v_cv.venue_id) then
    raise exception 'daily scan limit reached';
  end if;
  if v_cv.status = 'redeemed' then raise exception 'voucher already used'; end if;
  if v_cv.status <> 'issued' then raise exception 'voucher is not valid'; end if;
  if v_cv.expires_at is not null and v_cv.expires_at < v_now then raise exception 'voucher has expired'; end if;
  if v_voucher.redeem_branch_id is not null and v_voucher.redeem_branch_id is distinct from p_branch then
    raise exception 'voucher cannot be used at this branch';
  end if;

  update card_vouchers set status = 'redeemed', redeemed_at = v_now, redeemed_by = p_staff, redeemed_branch = p_branch
  where id = v_cv.id;

  insert into audit_log (venue_id, branch_id, actor, action, detail)
  values (v_cv.venue_id, p_branch, p_staff::text, 'voucher_redeem',
          jsonb_build_object('card', v_cv.card_id, 'card_voucher', v_cv.id, 'voucher', v_cv.voucher_id));

  return query select v_cv.id, v_now;
end $$;

-- Owner cancels a voucher that was unlocked by mistake -------------------------------------------
create or replace function voucher_void(p_card_voucher uuid, p_staff uuid)
returns table (card_voucher_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_cv    card_vouchers;
  v_staff staff_users;
begin
  select * into v_cv from card_vouchers where id = p_card_voucher for update;
  if not found then raise exception 'voucher not found'; end if;
  select * into v_staff from staff_users where id = p_staff and active;
  if not found or v_staff.venue_id <> v_cv.venue_id or v_staff.role not in ('owner', 'manager') then
    raise exception 'only the owner or a manager can cancel a voucher';
  end if;
  if v_cv.status <> 'issued' then raise exception 'voucher is not valid'; end if;
  update card_vouchers set status = 'void', voided_at = now(), voided_by = p_staff where id = v_cv.id;
  insert into audit_log (venue_id, actor, action, detail)
  values (v_cv.venue_id, p_staff::text, 'voucher_void', jsonb_build_object('card', v_cv.card_id, 'card_voucher', v_cv.id));
  return query select v_cv.id;
end $$;

revoke all on function ledger_visit(uuid, uuid, uuid)   from public, anon, authenticated;
revoke all on function voucher_redeem(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function voucher_void(uuid, uuid)         from public, anon, authenticated;
grant execute on function ledger_visit(uuid, uuid, uuid)   to service_role;
grant execute on function voucher_redeem(uuid, uuid, uuid) to service_role;
grant execute on function voucher_void(uuid, uuid)         to service_role;

-- ===================================================================================================
-- 0023_menu_note_length.sql
-- ===================================================================================================
-- Menu descriptions up to 400 characters (was 200): a sharing platter lists everything on it, and the owner's own
-- wording is kept whole rather than cut. Safe to run again.
alter table menu_items drop constraint if exists menu_items_note_en_check;
alter table menu_items drop constraint if exists menu_items_note_ar_check;
alter table menu_items add constraint menu_items_note_en_check check (note_en is null or length(note_en) <= 400);
alter table menu_items add constraint menu_items_note_ar_check check (note_ar is null or length(note_ar) <= 400);

-- ===================================================================================================
-- 0024_receipts_wide_reach.sql
-- ===================================================================================================
-- 0024: what each guest ordered, and a wider lock-screen area for a branch.
--
-- 1. receipts / receipt_items: a paid bill sent by the till (POS) is kept against the guest's card with its lines, so
--    the owner can see what each guest ordered. Deleting a guest deletes their receipts (cascade).
-- 2. pos_receipt: saves the bill once (the same receipt twice changes nothing). At a visit-card venue it also counts
--    the visit and unlocks the gifts that visit earns, with the same rules as a staff scan (ledger_visit, 0022), so
--    the cashier does not scan the card a second time.
-- 3. pos_receipt_refund: marks the bill refunded. The visit stays.
-- 4. branches.wide_reach: the Wallet card gets extra points around the branch (see lib/branches.ts passLocations).
-- Safe to run twice. Run after 0023, on the client's OWN database, after a backup.

alter table branches add column if not exists wide_reach boolean not null default false;

create table if not exists receipts (
  id          bigint generated always as identity primary key,
  venue_id    uuid not null references venues(id) on delete cascade,
  card_id     uuid not null references cards(id) on delete cascade,
  branch_id   uuid references branches(id) on delete set null,
  receipt     text not null check (length(receipt) between 1 and 64),
  total_fils  integer not null check (total_fils >= 0),
  refunded_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (venue_id, receipt)
);
create index if not exists receipts_card_idx on receipts (card_id, created_at desc);
alter table receipts enable row level security;

create table if not exists receipt_items (
  id         bigint generated always as identity primary key,
  receipt_id bigint not null references receipts(id) on delete cascade,
  venue_id   uuid not null references venues(id) on delete cascade,
  name       text not null check (length(name) between 1 and 120),
  qty        integer not null default 1 check (qty between 1 and 99),
  price_fils integer check (price_fils is null or price_fils >= 0)
);
create index if not exists receipt_items_receipt_idx on receipt_items (receipt_id);
alter table receipt_items enable row level security;

create or replace function pos_receipt(p_venue uuid, p_code text, p_receipt text, p_bill numeric, p_items jsonb, p_branch text)
returns table (receipt_id bigint, guest_card uuid, duplicate boolean, visit_counted boolean, visits integer, vouchers_issued integer)
language plpgsql security definer set search_path = public as $$
declare
  v_venue  venues;
  v_card   cards;
  v_old    receipts;
  v_branch branches;
  v_id     bigint;
  v_ledger bigint;
  v_new    integer := 0;
  v_first  boolean;
  v_visit  boolean := false;
  r        vouchers;
begin
  if p_receipt is null or length(trim(p_receipt)) = 0 or length(p_receipt) > 64 then
    raise exception 'a receipt id is required';
  end if;
  select * into v_venue from venues where id = p_venue;
  if not found or not v_venue.active then raise exception 'venue is not active'; end if;

  select * into v_old from receipts x where x.venue_id = p_venue and x.receipt = p_receipt;
  if found then
    return query select v_old.id, v_old.card_id, true, false, (select c.visits from cards c where c.id = v_old.card_id), 0;
    return;
  end if;

  select * into v_card from cards c where c.venue_id = p_venue and c.code = p_code for update;
  if not found then raise exception 'card not found'; end if;
  if p_bill is null or p_bill <= 0 or p_bill > 5000 then raise exception 'invalid bill amount'; end if;
  if p_items is not null and (jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100) then
    raise exception 'invalid items';
  end if;

  -- The branch: named by the till, or the venue's only branch. A till that names a wrong branch is refused.
  if p_branch is not null and length(trim(p_branch)) > 0 then
    select * into v_branch from branches b where b.venue_id = p_venue and b.slug = lower(trim(p_branch)) and b.active;
    if not found then raise exception 'branch not found'; end if;
  elsif (select count(*) from branches b where b.venue_id = p_venue and b.active and b.kind = 'branch') = 1 then
    select * into v_branch from branches b where b.venue_id = p_venue and b.active and b.kind = 'branch';
  end if;

  begin
    insert into receipts (venue_id, card_id, branch_id, receipt, total_fils)
    values (p_venue, v_card.id, v_branch.id, p_receipt, round(p_bill * 1000)::integer)
    returning id into v_id;
  exception when unique_violation then
    select * into v_old from receipts x where x.venue_id = p_venue and x.receipt = p_receipt;
    return query select v_old.id, v_old.card_id, true, false, (select c.visits from cards c where c.id = v_old.card_id), 0;
    return;
  end;

  insert into receipt_items (receipt_id, venue_id, name, qty, price_fils)
  select v_id, p_venue, left(trim(e->>'name'), 120), coalesce((e->>'qty')::integer, 1),
         case when e->>'priceBhd' is null then null else round((e->>'priceBhd')::numeric * 1000)::integer end
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  where length(trim(coalesce(e->>'name', ''))) > 0;

  -- A visit card: this bill is the visit, unless one is already counted for this sitting. A partner counter and a
  -- venue with several branches whose till did not say which one record the bill only.
  if v_venue.card_mode = 'visits' and v_branch.id is not null and v_branch.kind = 'branch'
     and not exists (select 1 from ledger l where l.card_id = v_card.id and l.kind = 'earn'
                     and l.created_at > now() - make_interval(mins => v_venue.visit_gap_minutes)
                     and not exists (select 1 from ledger u where u.undoes = l.id)) then
    v_first := not exists (select 1 from ledger l where l.card_id = v_card.id and l.kind = 'earn' and l.note = 'visit');
    insert into ledger (card_id, venue_id, kind, points, note, branch_id, source, external_ref)
    values (v_card.id, p_venue, 'earn', 0, 'visit', v_branch.id, 'pos', p_receipt)
    returning id into v_ledger;
    v_visit := true;
    for r in select * from vouchers v where v.venue_id = p_venue and v.active
               and (v.trigger = 'every_visit' or (v.trigger = 'first_visit' and v_first)) loop
      insert into card_vouchers (card_id, venue_id, voucher_id, issued_branch, expires_at)
      values (v_card.id, p_venue, r.id, v_branch.id,
              case when r.valid_days is null then null else now() + make_interval(days => r.valid_days) end)
      on conflict (card_id, voucher_id) do nothing;
      if found then v_new := v_new + 1; end if;
    end loop;
    insert into audit_log (venue_id, branch_id, actor, action, detail)
    values (p_venue, v_branch.id, 'pos', 'visit',
            jsonb_build_object('card', v_card.id, 'ledger', v_ledger, 'vouchers_issued', v_new, 'receipt', p_receipt));
  end if;

  return query select v_id, v_card.id, false, v_visit, (select c.visits from cards c where c.id = v_card.id), v_new;
end $$;

create or replace function pos_receipt_refund(p_venue uuid, p_receipt text)
returns table (receipt_id bigint, guest_card uuid, duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_old receipts;
begin
  select * into v_old from receipts x where x.venue_id = p_venue and x.receipt = p_receipt for update;
  if not found then raise exception 'receipt not found'; end if;
  if v_old.refunded_at is not null then
    return query select v_old.id, v_old.card_id, true;
    return;
  end if;
  update receipts set refunded_at = now() where id = v_old.id;
  insert into audit_log (venue_id, branch_id, actor, action, detail)
  values (p_venue, v_old.branch_id, 'pos', 'receipt_refund', jsonb_build_object('card', v_old.card_id, 'receipt', p_receipt));
  return query select v_old.id, v_old.card_id, false;
end $$;

revoke all on function pos_receipt(uuid, text, text, numeric, jsonb, text) from public, anon, authenticated;
revoke all on function pos_receipt_refund(uuid, text)                      from public, anon, authenticated;
grant execute on function pos_receipt(uuid, text, text, numeric, jsonb, text) to service_role;
grant execute on function pos_receipt_refund(uuid, text)                      to service_role;

-- ===================================================================================================
-- 0025_gift_rules.sql
-- ===================================================================================================
-- 0025: more ways a gift unlocks.
--
-- * 'visit_count': the gift unlocks on one chosen visit (the 5th, the 10th ...), once per guest. Several of these make
--   a ladder the guest climbs.
-- * 'birthday': the gift unlocks on the guest's birthday, every year, from the daily job (birthday_gifts). Only guests
--   who gave their date of birth.
-- * card_vouchers.cycle: 0 for a gift a guest gets once, the year for a birthday gift, so "once" still holds per year.
-- * visit_gifts: the one place that decides which gifts a visit unlocks; a staff scan (ledger_visit) and a till bill
--   (pos_receipt) both call it, so they can never disagree.
-- Safe to run twice. Run after 0024, on the client's OWN database, after a backup.

alter table vouchers drop constraint if exists vouchers_trigger_check;
alter table vouchers add constraint vouchers_trigger_check check (trigger in ('first_visit', 'every_visit', 'manual', 'visit_count', 'birthday'));
alter table vouchers add column if not exists at_visit integer check (at_visit is null or at_visit between 2 and 1000);
alter table vouchers drop constraint if exists vouchers_at_visit_needed;
alter table vouchers add constraint vouchers_at_visit_needed check (trigger <> 'visit_count' or at_visit is not null);

alter table card_vouchers add column if not exists cycle integer not null default 0;
alter table card_vouchers drop constraint if exists card_vouchers_card_id_voucher_id_key;
create unique index if not exists card_vouchers_once_idx on card_vouchers (card_id, voucher_id, cycle);

-- Which gifts this visit unlocks. Called after the visit is in the ledger, so cards.visits already counts it.
create or replace function visit_gifts(p_card uuid, p_venue uuid, p_staff uuid, p_branch uuid, p_first boolean)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_new    integer := 0;
  v_visits integer;
  r        vouchers;
begin
  select c.visits into v_visits from cards c where c.id = p_card;
  for r in select * from vouchers v where v.venue_id = p_venue and v.active
             and (v.trigger = 'every_visit' or (v.trigger = 'first_visit' and p_first)
                  or (v.trigger = 'visit_count' and v.at_visit = v_visits)) loop
    insert into card_vouchers (card_id, venue_id, voucher_id, issued_by, issued_branch, expires_at)
    values (p_card, p_venue, r.id, p_staff, p_branch,
            case when r.valid_days is null then null else now() + make_interval(days => r.valid_days) end)
    on conflict (card_id, voucher_id, cycle) do nothing;
    if found then v_new := v_new + 1; end if;
  end loop;
  return v_new;
end $$;

-- The staff scan, as in 0022, with the gifts decided by visit_gifts.
create or replace function ledger_visit(p_card uuid, p_staff uuid, p_branch uuid)
returns table (ledger_id bigint, visits integer, vouchers_issued integer)
language plpgsql security definer set search_path = public as $$
declare
  v_card   cards;
  v_venue  venues;
  v_staff  staff_users;
  v_branch branches;
  v_id     bigint;
  v_new    integer := 0;
  v_first  boolean;
begin
  select * into v_card from cards where id = p_card for update;
  if not found then raise exception 'card not found'; end if;
  select * into v_venue from venues where id = v_card.venue_id;
  select * into v_staff from staff_users where id = p_staff and active;
  if not found or v_staff.venue_id <> v_card.venue_id then
    raise exception 'staff member is not allowed at this venue';
  end if;
  if not v_venue.active then raise exception 'venue is not active'; end if;
  if v_venue.card_mode is distinct from 'visits' then raise exception 'this venue does not use visit cards'; end if;

  if p_branch is not null then
    select * into v_branch from branches where id = p_branch and venue_id = v_card.venue_id and active;
    if not found then raise exception 'branch not found'; end if;
    if v_branch.kind <> 'branch' then raise exception 'visits cannot be recorded at this counter'; end if;
  elsif exists (select 1 from branches b where b.venue_id = v_card.venue_id and b.active and b.kind = 'branch') then
    raise exception 'choose a branch first';
  end if;
  if v_staff.branch_id is not null and v_staff.branch_id is distinct from p_branch then
    raise exception 'staff member is not allowed at this branch';
  end if;

  if exists (select 1 from ledger l where l.card_id = p_card and l.kind = 'earn'
             and l.created_at > now() - make_interval(mins => v_venue.visit_gap_minutes)
             and not exists (select 1 from ledger u where u.undoes = l.id)) then
    raise exception 'visit already recorded';
  end if;
  if (select count(*) from ledger l where l.staff_id = p_staff and l.kind = 'earn' and l.note = 'visit'
        and l.created_at > now() - interval '24 hours') >= v_venue.visit_cap_per_staff then
    raise exception 'daily scan limit reached';
  end if;

  v_first := not exists (select 1 from ledger l where l.card_id = p_card and l.kind = 'earn' and l.note = 'visit');

  insert into ledger (card_id, venue_id, kind, points, staff_id, note, branch_id)
  values (v_card.id, v_card.venue_id, 'earn', 0, p_staff, 'visit', p_branch)
  returning id into v_id;

  v_new := visit_gifts(v_card.id, v_card.venue_id, p_staff, p_branch, v_first);

  insert into audit_log (venue_id, branch_id, actor, action, detail)
  values (v_card.venue_id, p_branch, p_staff::text, 'visit',
          jsonb_build_object('card', v_card.id, 'ledger', v_id, 'vouchers_issued', v_new));

  return query select v_id, (select c.visits from cards c where c.id = p_card), v_new;
end $$;

-- The till bill, as in 0024, with the gifts decided by visit_gifts.
create or replace function pos_receipt(p_venue uuid, p_code text, p_receipt text, p_bill numeric, p_items jsonb, p_branch text)
returns table (receipt_id bigint, guest_card uuid, duplicate boolean, visit_counted boolean, visits integer, vouchers_issued integer)
language plpgsql security definer set search_path = public as $$
declare
  v_venue  venues;
  v_card   cards;
  v_old    receipts;
  v_branch branches;
  v_id     bigint;
  v_ledger bigint;
  v_new    integer := 0;
  v_first  boolean;
  v_visit  boolean := false;
begin
  if p_receipt is null or length(trim(p_receipt)) = 0 or length(p_receipt) > 64 then
    raise exception 'a receipt id is required';
  end if;
  select * into v_venue from venues where id = p_venue;
  if not found or not v_venue.active then raise exception 'venue is not active'; end if;

  select * into v_old from receipts x where x.venue_id = p_venue and x.receipt = p_receipt;
  if found then
    return query select v_old.id, v_old.card_id, true, false, (select c.visits from cards c where c.id = v_old.card_id), 0;
    return;
  end if;

  select * into v_card from cards c where c.venue_id = p_venue and c.code = p_code for update;
  if not found then raise exception 'card not found'; end if;
  if p_bill is null or p_bill <= 0 or p_bill > 5000 then raise exception 'invalid bill amount'; end if;
  if p_items is not null and (jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100) then
    raise exception 'invalid items';
  end if;

  -- The branch: named by the till, or the venue's only branch. A till that names a wrong branch is refused.
  if p_branch is not null and length(trim(p_branch)) > 0 then
    select * into v_branch from branches b where b.venue_id = p_venue and b.slug = lower(trim(p_branch)) and b.active;
    if not found then raise exception 'branch not found'; end if;
  elsif (select count(*) from branches b where b.venue_id = p_venue and b.active and b.kind = 'branch') = 1 then
    select * into v_branch from branches b where b.venue_id = p_venue and b.active and b.kind = 'branch';
  end if;

  begin
    insert into receipts (venue_id, card_id, branch_id, receipt, total_fils)
    values (p_venue, v_card.id, v_branch.id, p_receipt, round(p_bill * 1000)::integer)
    returning id into v_id;
  exception when unique_violation then
    select * into v_old from receipts x where x.venue_id = p_venue and x.receipt = p_receipt;
    return query select v_old.id, v_old.card_id, true, false, (select c.visits from cards c where c.id = v_old.card_id), 0;
    return;
  end;

  insert into receipt_items (receipt_id, venue_id, name, qty, price_fils)
  select v_id, p_venue, left(trim(e->>'name'), 120), coalesce((e->>'qty')::integer, 1),
         case when e->>'priceBhd' is null then null else round((e->>'priceBhd')::numeric * 1000)::integer end
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  where length(trim(coalesce(e->>'name', ''))) > 0;

  -- A visit card: this bill is the visit, unless one is already counted for this sitting. A partner counter and a
  -- venue with several branches whose till did not say which one record the bill only.
  if v_venue.card_mode = 'visits' and v_branch.id is not null and v_branch.kind = 'branch'
     and not exists (select 1 from ledger l where l.card_id = v_card.id and l.kind = 'earn'
                     and l.created_at > now() - make_interval(mins => v_venue.visit_gap_minutes)
                     and not exists (select 1 from ledger u where u.undoes = l.id)) then
    v_first := not exists (select 1 from ledger l where l.card_id = v_card.id and l.kind = 'earn' and l.note = 'visit');
    insert into ledger (card_id, venue_id, kind, points, note, branch_id, source, external_ref)
    values (v_card.id, p_venue, 'earn', 0, 'visit', v_branch.id, 'pos', p_receipt)
    returning id into v_ledger;
    v_visit := true;
    v_new := visit_gifts(v_card.id, p_venue, null, v_branch.id, v_first);
    insert into audit_log (venue_id, branch_id, actor, action, detail)
    values (p_venue, v_branch.id, 'pos', 'visit',
            jsonb_build_object('card', v_card.id, 'ledger', v_ledger, 'vouchers_issued', v_new, 'receipt', p_receipt));
  end if;

  return query select v_id, v_card.id, false, v_visit, (select c.visits from cards c where c.id = v_card.id), v_new;
end $$;

-- The daily job: every guest of this venue whose birthday is the given day gets this year's birthday gifts, once.
-- p_feb29: also guests born on 29 February (the job passes true on 28 February of a year without one).
create or replace function birthday_gifts(p_venue uuid, p_month integer, p_day integer, p_year integer, p_feb29 boolean)
returns table (gift_card uuid)
language plpgsql security definer set search_path = public as $$
declare
  c     record;
  r     vouchers;
  v_any boolean;
begin
  if not exists (select 1 from vouchers v where v.venue_id = p_venue and v.active and v.trigger = 'birthday') then return; end if;
  for c in select k.id from cards k join members m on m.id = k.member_id
            where k.venue_id = p_venue and m.deleted_at is null
              and ((m.birth_month = p_month and m.birth_day = p_day) or (p_feb29 and m.birth_month = 2 and m.birth_day = 29)) loop
    v_any := false;
    for r in select * from vouchers v where v.venue_id = p_venue and v.active and v.trigger = 'birthday' loop
      insert into card_vouchers (card_id, venue_id, voucher_id, cycle, expires_at)
      values (c.id, p_venue, r.id, p_year, case when r.valid_days is null then null else now() + make_interval(days => r.valid_days) end)
      on conflict (card_id, voucher_id, cycle) do nothing;
      if found then v_any := true; end if;
    end loop;
    if v_any then
      insert into audit_log (venue_id, actor, action, detail) values (p_venue, 'system', 'birthday_gift', jsonb_build_object('card', c.id));
      gift_card := c.id;
      return next;
    end if;
  end loop;
end $$;

revoke all on function visit_gifts(uuid, uuid, uuid, uuid, boolean)            from public, anon, authenticated;
revoke all on function birthday_gifts(uuid, integer, integer, integer, boolean) from public, anon, authenticated;
grant execute on function visit_gifts(uuid, uuid, uuid, uuid, boolean)            to service_role;
grant execute on function birthday_gifts(uuid, integer, integer, integer, boolean) to service_role;

-- ===================================================================================================
-- 0026_offer_groups.sql
-- ===================================================================================================
-- 0026: an offer for one group of guests instead of everyone who agreed.
--
-- * offers.segment: 'all' (as before), 'quiet' (visited, but not in the last 30 days), 'regulars' (5 visits or
--   more), 'new' (joined in the last 30 days).
-- * offers.target_cards: the guests in that group at the moment of sending (null = everyone who agreed). The card of
--   a guest who is not in the list never shows the offer. The list is fixed at sending time on purpose: a guest who
--   comes back the next day keeps the "we miss you" offer they were sent.
-- Safe to run twice. Run after 0025, on the client's OWN database, after a backup.

alter table offers add column if not exists segment text not null default 'all';
alter table offers drop constraint if exists offers_segment_check;
alter table offers add constraint offers_segment_check check (segment in ('all', 'quiet', 'regulars', 'new'));
alter table offers add column if not exists target_cards uuid[];

-- ===================================================================================================
-- 0027_bring_a_friend.sql
-- ===================================================================================================
-- 0027: bring a friend.
--
-- * cards.invite: a short random code a guest shares as a link (/join/<venue>?r=<code>). It is NOT the card's own
--   link: knowing it opens nothing. Made the first time the guest asks for their link.
-- * cards.invited_by: the card whose link the new guest joined with.
-- * vouchers.trigger 'friend': when an invited guest's FIRST visit is recorded, the member who invited them gets this
--   gift, once per friend. The friend gets the venue's first-visit gift as any new guest does.
-- Safe to run twice. Run after 0026, on the client's OWN database, after a backup.

alter table cards add column if not exists invite text;
create unique index if not exists cards_invite_idx on cards (invite) where invite is not null;
alter table cards add column if not exists invited_by uuid references cards(id) on delete set null;
create index if not exists cards_invited_by_idx on cards (invited_by) where invited_by is not null;

alter table vouchers drop constraint if exists vouchers_trigger_check;
alter table vouchers add constraint vouchers_trigger_check check (trigger in ('first_visit', 'every_visit', 'manual', 'visit_count', 'birthday', 'friend'));

-- As in 0025, plus the inviter's gift on an invited guest's first visit.
create or replace function visit_gifts(p_card uuid, p_venue uuid, p_staff uuid, p_branch uuid, p_first boolean)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_new    integer := 0;
  v_visits integer;
  r        vouchers;
  v_inviter uuid;
begin
  select c.visits into v_visits from cards c where c.id = p_card;
  for r in select * from vouchers v where v.venue_id = p_venue and v.active
             and (v.trigger = 'every_visit' or (v.trigger = 'first_visit' and p_first)
                  or (v.trigger = 'visit_count' and v.at_visit = v_visits)) loop
    insert into card_vouchers (card_id, venue_id, voucher_id, issued_by, issued_branch, expires_at)
    values (p_card, p_venue, r.id, p_staff, p_branch,
            case when r.valid_days is null then null else now() + make_interval(days => r.valid_days) end)
    on conflict (card_id, voucher_id, cycle) do nothing;
    if found then v_new := v_new + 1; end if;
  end loop;

  -- Bring a friend: this is the first visit of a guest who joined with a member's link. That member gets each
  -- 'friend' gift once more (cycle = which friend this is for them). Not counted in v_new: it is not this guest's gift.
  if p_first then
    select c.invited_by into v_inviter from cards c where c.id = p_card;
    if v_inviter is not null and v_inviter <> p_card and exists (
         select 1 from cards k join members m on m.id = k.member_id
         where k.id = v_inviter and k.venue_id = p_venue and m.deleted_at is null) then
      for r in select * from vouchers v where v.venue_id = p_venue and v.active and v.trigger = 'friend' loop
        insert into card_vouchers (card_id, venue_id, voucher_id, cycle, issued_by, issued_branch, expires_at)
        values (v_inviter, p_venue, r.id,
                (select count(*) + 1 from card_vouchers x where x.card_id = v_inviter and x.voucher_id = r.id),
                p_staff, p_branch,
                case when r.valid_days is null then null else now() + make_interval(days => r.valid_days) end)
        on conflict (card_id, voucher_id, cycle) do nothing;
        if found then
          insert into audit_log (venue_id, branch_id, actor, action, detail)
          values (p_venue, p_branch, coalesce(p_staff::text, 'pos'), 'friend_gift', jsonb_build_object('card', v_inviter, 'friend', p_card));
        end if;
      end loop;
    end if;
  end if;
  return v_new;
end $$;

-- ===================================================================================================
-- 0028_bookings.sql
-- ===================================================================================================
-- 0028: table booking requests.
--
-- A guest asks for a table from the venue's guest page (a day, a time, how many people, a name and a mobile). It is a
-- REQUEST: the venue confirms or declines it from the owner's screen, and the guest sees the answer on the same page.
-- Nothing is promised automatically, because the platform does not know the room.
-- * venues.bookings_on: the owner's switch. Off = no "Book a table" on the guest page.
-- * bookings.token: the guest's key to their own request (kept on their phone). Knowing it shows only that request.
-- * A guest who erases their data loses their requests too (cascade); the daily job removes requests older than 90 days.
-- Safe to run twice. Run after 0027, on the client's OWN database, after a backup.

alter table venues add column if not exists bookings_on boolean not null default false;

create table if not exists bookings (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  branch_id  uuid references branches(id) on delete set null,
  card_id    uuid references cards(id) on delete cascade,
  token      text not null unique check (length(token) between 16 and 64),
  name       text not null check (length(name) between 1 and 80),
  phone      text not null check (length(phone) between 7 and 20),
  party      integer not null check (party between 1 and 30),
  at         timestamptz not null,
  note       text check (note is null or length(note) <= 300),
  status     text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  reply      text check (reply is null or length(reply) <= 200),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references staff_users(id)
);
create index if not exists bookings_venue_idx on bookings (venue_id, at);
alter table bookings enable row level security;

-- ===================================================================================================
-- 0029_trusted_tills.sql
-- ===================================================================================================
-- 0029: trusted tills.
--
-- A staff PIN is four digits. With this switched on, a staff PIN only signs in on a device the owner has added as one
-- of the venue's tills, so a PIN seen over a shoulder is useless on someone's own phone.
-- * trusted_devices: one row per till. The device keeps a long random key in a cookie the page cannot read; only a
--   hash of it is stored here.
-- * venues.tills_locked: the owner's switch. Off = staff PINs work on any device, as before.
-- The owner's and a manager's own PIN are never held to this, so the owner cannot lock themselves out.
-- Safe to run twice. Run after 0028, on the client's OWN database, after a backup.

alter table venues add column if not exists tills_locked boolean not null default false;

create table if not exists trusted_devices (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null references venues(id) on delete cascade,
  name         text not null check (length(name) between 1 and 60),
  key_hash     text not null unique,
  created_by   uuid references staff_users(id),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at   timestamptz
);
create index if not exists trusted_devices_venue_idx on trusted_devices (venue_id) where revoked_at is null;
alter table trusted_devices enable row level security;

-- ===================================================================================================
-- 0030_table_orders_switch.sql
-- ===================================================================================================
-- 0030: a visit-card venue may let guests order from the table's code.
--
-- A points venue always could. A visit-card venue (a restaurant whose waiters take the order) opens its guest page
-- from the table's code instead; with this switch on, that page also offers "Order from your table": the rounds go to
-- the staff's table board, the bill is paid at the counter (or by card from the phone where a Tap account is set up),
-- and each order is kept under the guest's card, so the owner sees what each guest ordered without a till link.
-- Off by default: it changes how the floor works, so the owner decides.
-- Safe to run twice. Run after 0029, on the client's OWN database, after a backup.

alter table venues add column if not exists table_orders_on boolean not null default false;

-- ===================================================================================================
-- 0031_staff_alerts.sql
-- ===================================================================================================
-- 0031: alerts on staff phones (and the watch paired with the phone), and calling the waiter from the table.
--
-- * push_subscriptions: a staff device that asked for alerts. The address is the phone maker's own push service
--   (Google, Apple, Mozilla, Microsoft); nothing else is accepted. No message text is ever sent through it: the alert
--   only wakes the device, which then asks this server what is waiting, with the staff member's own sign-in.
-- * push_keys: the one key pair this installation signs its alerts with, made the first time it is needed (unless the
--   server's settings carry one). Service role only.
-- * venues.table_calls_on: a visit-card venue's switch for "Call the waiter" and "Ask for the bill" on the table page.
-- Safe to run twice. Run after 0030, on the client's OWN database, after a backup.

alter table venues add column if not exists table_calls_on boolean not null default false;

create table if not exists push_keys (
  id          integer primary key default 1 check (id = 1),
  public_key  text not null,
  private_key text not null,
  created_at  timestamptz not null default now()
);
alter table push_keys enable row level security;

create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  staff_id   uuid references staff_users(id) on delete cascade,
  endpoint   text not null unique check (length(endpoint) between 20 and 1000),
  p256dh     text,
  auth       text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_venue_idx on push_subscriptions (venue_id);
alter table push_subscriptions enable row level security;

-- ===================================================================================================
-- 0032_card_design_refresh.sql
-- ===================================================================================================
-- 0032: send a new Wallet card design to the cards guests already saved.
--
-- A saved Apple Wallet card fetches a newer version of itself from this server when it is told to look. Until now
-- "newer" for a design change was a date written in the code. venues.pass_updated_at is that date kept per business:
-- the developer screen sets it to now and wakes every phone that holds a card, and each phone then fetches the card
-- with the new picture, colours and wording. Nobody joins again and nobody adds the card again.
-- Null = no design has been sent out since the cards were made.
-- Safe to run twice. Run after 0031, on the client's OWN database, after a backup.

alter table venues add column if not exists pass_updated_at timestamptz;

-- ===================================================================================================
-- 0033_gift_photo.sql
-- ===================================================================================================
-- 0033: a gift can have its own photo.
--
-- vouchers.image_url: the owner's photo of the gift (uploaded from Owner > Gifts into the venue's own storage, like a
-- menu photo). While that gift is waiting on a guest's card, the photo is shown in the opening of the card's picture
-- (the niche), on the Wallet card and on the card page. Null = no photo: the niche is simply lit.
-- When the owner later swaps one gift for another, the picture on every guest's card follows.
-- Safe to run twice. Run after 0032, on the client's OWN database, after a backup.

alter table vouchers add column if not exists image_url text check (image_url is null or length(image_url) <= 600);

-- ===================================================================================================
-- roshinah.sql
-- ===================================================================================================
-- Al Roshinah Restaurant & Cafe: one business, two branches (we start in Sanad), a visit card, and the first voucher.
-- Run ONCE in the Supabase SQL editor of THIS client's own project, after migrations 0001..0022. Safe to run again.
-- Facts below are from the client's own public pages (see docs/clients/roshinah.md in CALABOS). Unknown = left empty:
-- the map pins (lat/lng), the Google review links and the Zallaq go-live are set later in the owner dashboard.

insert into venues (slug, name, brand, points_per_bhd, reward_goal, reward_text, card_mode, join_fields)
values ('roshinah', 'Al Roshinah',
        '{"background":"#013220","label":"#C9A96E","text":"#FAF8F3"}'::jsonb,
        2, 500, 'Gifts chosen by Al Roshinah', 'visits', array['mobile','email','birthday'])
on conflict (slug) do update set name = excluded.name, brand = excluded.brand, card_mode = excluded.card_mode, join_fields = excluded.join_fields;

-- Branches. Zallaq is switched off until it goes live; Asmak Al Roshinah is a partner counter (redeems vouchers only).
insert into branches (venue_id, slug, name, name_ar, kind, address, phone, menu_url, sort, active)
select v.id, b.slug, b.name, b.name_ar, b.kind, b.address, b.phone, b.menu_url, b.sort, b.active
from venues v, (values
  ('sanad',  'Sanad',             'سند',           'branch',  'Bldg 1376w, Rd 4541, Block 745, Sanad',        '+97377909080', 'https://qr.finedinemenu.com/al-roshinah-restaurant-and-cafe/menu/64e5d573f2c374001431447a', 0, true),
  ('zallaq', 'Zallaq Springs',    'زلاق سبرينغز',  'branch',  'Shop 16, Bldg 23, Ave 55, Block 1056, Zallaq', '+97377909060', 'https://qr.finedinemenu.com/al-roshinah-restaurant-and-cafe/menu/6707a4b07533e20a76d54be9', 1, false),
  ('asmak',  'Asmak Al Roshinah', 'أسماك الروشنة', 'partner', 'Shop 143, Hala Plaza, Zinj, Manama',           '+97377909050', 'https://qr.finedinemenu.com/al-roshinah-restaurant-and-cafe/menu/68bd4cd814946c3898c2e309', 9, true)
) as b(slug, name, name_ar, kind, address, phone, menu_url, sort, active)
where v.slug = 'roshinah'
on conflict (venue_id, slug) do nothing;

-- The first gift: unlocked by the staff scan on the guest's first paid visit, used once, only at Asmak Al Roshinah.
-- valid_days is empty (no expiry) until the owner says how long it lasts.
insert into vouchers (venue_id, title, title_ar, detail, detail_ar, trigger, redeem_branch_id)
select v.id, '50% off at Asmak Al Roshinah', 'خصم ٥٠٪ في أسماك الروشنة',
       'A thank-you for joining. One visit, one bill.', 'شكراً لانضمامك. لزيارة واحدة وفاتورة واحدة.',
       'first_visit', b.id
from venues v join branches b on b.venue_id = v.id and b.slug = 'asmak'
where v.slug = 'roshinah'
  and not exists (select 1 from vouchers x where x.venue_id = v.id and x.title = '50% off at Asmak Al Roshinah');

-- Automatic notices (the owner can reword them or switch them off in the dashboard).
insert into auto_messages (venue_id, kind, enabled, text_en, text_ar, days)
select v.id, m.kind, true, m.text_en, m.text_ar, 14
from venues v, (values
  ('birthday', 'Happy birthday, {name}. Come in and celebrate with us.', 'كل عام وأنت بخير يا {name}. تفضل واحتفل معنا.'),
  ('winback',  'We have missed you, {name}. Your table is waiting.',     'اشتقنا لك يا {name}. طاولتك بانتظارك.')
) as m(kind, text_en, text_ar)
where v.slug = 'roshinah'
on conflict (venue_id, kind) do nothing;

-- ===================================================================================================
-- roshinah-menu.sql
-- ===================================================================================================
-- Al Roshinah (Sanad): the menu, copied from the venue's own public menu page on 2026-11-25.
-- Names, descriptions and prices are as shown there; the owner confirms them before go-live and edits them from
-- the owner screen afterwards. Generated from web/src/data/menus/roshinah.json. Run after seeds/roshinah.sql.
-- Safe to run again: it replaces this venue's menu.

delete from menu_items where venue_id = (select id from venues where slug = 'roshinah');
delete from menu_categories where venue_id = (select id from venues where slug = 'roshinah');

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Platters', 'بلاترات', 0 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Turkish Platter', 'بلاتر الفطور التركي', 'Includes: * Turkish Omelette * Finger Salad & Olives * Clotted Cream with Honey * Olive Oil & Zaatar * Makdous * Spicy Feta Cheese * Zaatar Labneh * Beetroot Cheese * Jam * Plain Labneh * Makdous Cheese * Karak or Red Tea (Pot) * Tannour Bread Note: Items on this platter cannot be substituted.', 'لا يمكن استبدال اي طبق في الصينيه عباره عن : بيض تركي سلطة الاصابع + زيتون قشطة بالعسل زيت وزعتر مكدوس جبنة الفيتا الحاره لبنة زعتر جبنة شمندر مربى لبنة ساده جبنة مكدوس دلة كرك أو شاي أحمر خبز تنور', 12000, '/venues/roshinah/menu/001.webp', 0),
  ('Khaleeji Platter', 'بلاتر الفطور الخليجي', 'Includes: * Chicken Liver * Chickpeas * Baked Beans * Cheese Samboosa * Eggs & Tomatoes * Balaleet * Karak or Red Tea (Pot) * Fresh Bread Note: Items on this platter cannot be substituted.', 'عبارة عن : كبدة دجاج بصوص دبس الرمان نخي لوبه سمبوسه جبن بيض وطماط بلاليط دلة كرك او شاي خبز تنور فرش لا يمكن استبدال اي طبق في الصينيه', 12000, '/venues/roshinah/menu/002.webp', 1)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Chef Specials', 'أطباق الشيف الخاصة', 1 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Felafel Special', 'فلافل سبيشال', 'A smooth mixture of labneh and beetroot paired with feta cheese, served with freshly fried falafel in the center, and garnished with crispy bread.', 'خلطة اللبنه بالشمندر مع جبنة الفيتا وسطها الفلافل المقليه و تزين بقطع الخبز الكرسبي', 3800, '/venues/roshinah/menu/003.webp', 0),
  ('Chef Hajar''s Special Chicken Liver', 'كبد الدجاج الخاص للشيف هاجر', 'A smooth mixture of labneh, fresh dill, and feta cheese, served with chicken liver cooked in pomegranate molasses in the center, garnished with crispy bread.', 'خلطة اللبنة بالشبنت مع جبنة الفيتا وسطها كبدة الدجاج بدبس الرمان وتزين بقطع من الخبز الكرسبي', 4500, '/venues/roshinah/menu/004.webp', 1),
  ('Mama''s Egg', 'بيض ماماز', 'Smooth and creamy scrambled eggs cooked with onions, garlic, and fresh dill.', 'بيض مخفوق مع البصل والثوم والشبنت ويقدم بشكل كريمي', 2900, '/venues/roshinah/menu/005.webp', 2),
  ('O''Ali', 'أوه علي', 'A smooth mixture of labneh and feta cheese topped with makdous and nuts, served with pieces of boiled egg on top and drizzled with paprika sauce.', 'خلطة اللبنة وجبنةالفيتا مع المكدوس والمكسرات فوقه قطع البيض المسلوق وصوص البابريكا', 3500, '/venues/roshinah/menu/006.webp', 3),
  ('Hummus & Foul', 'حمص بالفول', null, null, 2900, '/venues/roshinah/menu/007.webp', 4),
  ('Lebenah Falafel', 'لبنة بالفلافل', null, 'Lebenah Falafel', 3300, '/venues/roshinah/menu/008.webp', 5),
  ('Spicy Tikka Tacos', 'سبايسي تكا تاكو', 'Crispy pieces of fried bread stuffed with a special mixture of hummus and labneh, topped with fried tikka, and garnished with sweet pomegranate molasses.', 'قطع مقرمشة من الخبز المقلي، محشوة بمزيجنا الخاص من الحمص واللبنة، تعلوها قطع التكة المقلية وتُزين بدبس الرمان الحلو.', 3800, '/venues/roshinah/menu/009.webp', 6),
  ('Chicken Fatteh Special', null, null, null, 4800, '/venues/roshinah/menu/010.webp', 7),
  ('Chickpeas Fatteh Special', null, null, null, 3900, '/venues/roshinah/menu/011.webp', 8)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Khaleeji', 'خليجي', 2 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Balaleet & Eggs', 'بلاليط وبيض', 'Sweet, aromatic saffron and cardamom vermicelli topped with a savory egg omelette.', null, 2500, '/venues/roshinah/menu/012.webp', 0),
  ('Eggs & Tomato', 'بيض وطماط', 'A classic, comforting scramble of soft eggs simmered with juicy, slow-cooked tomatoes.', null, 2000, '/venues/roshinah/menu/013.webp', 1),
  ('Chicken Liver', 'كبدة دجاج', 'Tender, pan-seared chicken livers sautéed with caramelized onions and signature spices.', null, 2800, '/venues/roshinah/menu/014.webp', 2),
  ('Chickpeas', 'نخي', null, null, 1700, '/venues/roshinah/menu/015.webp', 3),
  ('Lubah', 'لوبة', null, 'Lubah', 1700, '/venues/roshinah/menu/016.webp', 4),
  ('Foul', 'فول', null, 'Foul', 1800, '/venues/roshinah/menu/017.webp', 5),
  ('Dal', 'حمسة دال', 'Wholesome, slow-cooked yellow lentils seasoned with fragrant garlic, cumin, and herbs.', null, 1900, '/venues/roshinah/menu/018.webp', 6),
  ('Falafel', 'فلافل', 'Crispy on the outside, fluffy on the inside golden chickpea fritters blended with fresh herbs.', null, 1900, '/venues/roshinah/menu/019.webp', 7)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'In the Pan', 'في الطابي (المقلاة)', 3 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Sunny Side Up', 'بيض عيون', 'Two eggs fried perfectly to order with soft, golden yolks.', null, 1500, '/venues/roshinah/menu/020.webp', 0),
  ('Shakshooka', 'شكشوكة', 'Eggs nestled in a rich, gently spiced tomato, pepper, and onion sauce.', null, 2700, '/venues/roshinah/menu/021.webp', 1),
  ('Greek Eggs', 'بيض يوناني', 'A Greek-inspired egg skillet tossed with Feta Cheese, fresh, vibrant herbs and savory ingredients.', null, 3700, '/venues/roshinah/menu/022.webp', 2),
  ('Mashed Luba shakshooka', 'شكشوكة لوبة مهروسة', 'Eggs nestled on a bed of mashed Luba (Beans), wIth special sauce and creamy spread cheese.', null, 3900, '/venues/roshinah/menu/023.webp', 3),
  ('Turkish Omelete', 'اومليت تركي', 'A Mediterranean-inspired egg skillet tossed with fresh, vibrant herbs and savory ingredients.', null, 3900, '/venues/roshinah/menu/024.webp', 4),
  ('Lava', 'لافا', 'Mild or Spicy shakshooka inspired eggs with cheddar cheese and special chefs sauce and cheese. (Boiled or scrambles).', null, 3900, '/venues/roshinah/menu/025.webp', 5)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Omelette Lovers', 'تحب الأومليت؟', 4 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Plain Omelete', 'آومليت سادة', null, 'Plain Omelete', 1500, '/venues/roshinah/menu/026.webp', 0),
  ('Cheese Omelette', null, null, null, 1800, '/venues/roshinah/menu/027.webp', 1),
  ('Vegetable Omelette', null, null, null, 1800, '/venues/roshinah/menu/028.webp', 2),
  ('Mushroom Omelette', null, null, null, 2300, '/venues/roshinah/menu/029.webp', 3)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Hamsaat', 'حمسات', 5 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Hamsaat Haloumi', 'حمسة حلومي', 'Halloumi cheese, house tomato sauce, green and black olives, mozzarella, and parmesan.', 'قطع من جبنة الحلومي يخلط بصلصة الطماطم الخاص بالشيف وقطع الزيتون الاخضر والزيتون الأسود وجبنة المازوريلا والبارميزان', 4500, '/venues/roshinah/menu/030.webp', 0),
  ('Chickpeas Hamsaat', 'حمسة نخي', 'Savory chickpeas stir-fried with fragrant onions, garlic, and a rich spice blend.', null, 2800, '/venues/roshinah/menu/031.webp', 1),
  ('Chicken Hamsaat', 'حمسة دجاح', 'Tender chicken sautéed in a rich, aromatic sauce.', null, 3500, '/venues/roshinah/menu/032.webp', 2),
  ('Fried Tikka Hamsaat', 'حمسة تكة مقلي', 'Juicy meat Tikka pan-flashed with intense, deeply flavorful regional spices.', null, 4800, '/venues/roshinah/menu/033.webp', 3)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Hot Appetizers', 'مقليات', 6 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('French Fries', null, null, null, 1500, '/venues/roshinah/menu/034.webp', 0),
  ('Samoosa Cheese', 'سمبوسة جبن', null, 'Samoosa Cheese', 1900, '/venues/roshinah/menu/035.webp', 1),
  ('Spicy Potato Samoosa', 'سمبوسة بطاطا حارة', null, 'Spicy Potato Samoosa', 1900, '/venues/roshinah/menu/036.webp', 2),
  ('Chicken Spinach Samoosa', 'سمبوسة دجاج وسبانخ', null, 'Chicken Spinach Samoosa', 2200, '/venues/roshinah/menu/037.webp', 3),
  ('Chicken Musakhan S.Rolls', 'سبرنق روول مسخن دجاج', null, 'Chicken Musakhan S.Rolls', 2500, '/venues/roshinah/menu/038.webp', 4),
  ('Vege Spring Rolls', 'سبرنق روول خضرة', null, 'Vege Spring Rolls', 1900, '/venues/roshinah/menu/039.webp', 5),
  ('Cheese N Zattar Rolls', 'سبرنق روول جبن وزعتر', null, 'Cheese N Zattar Rolls', 1900, '/venues/roshinah/menu/040.webp', 6)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Cold Appetizers', 'مقبلات', 7 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Hummus', 'حمص', null, null, 1800, '/venues/roshinah/menu/041.webp', 0),
  ('Grilled Feta Cheese', 'جبنة فيتا مشوية', null, null, 2000, '/venues/roshinah/menu/042.webp', 1),
  ('Lebnah with Pizza Sauce', 'لبنة مع صلصة البيتزا', null, null, 1800, '/venues/roshinah/menu/043.webp', 2),
  ('Spicy Hummus', 'بلاتر الحمص الحار', null, null, 2500, '/venues/roshinah/menu/044.webp', 3),
  ('Feta Cheese Zattar Dip', 'تغميسة جبنة الفيتا بالزعتر', 'Chef Um Waleed Creation', null, 2400, '/venues/roshinah/menu/045.webp', 4),
  ('Feta Cheese Beetroot Dip', 'تغميسة جبنة الفيتا بالشمندر', 'Chef Um Waleed Creation', null, 2400, '/venues/roshinah/menu/046.webp', 5),
  ('Spicy Feta Cheese Dip', 'تغميسة جبنة الفيتا الحارة', 'Chef Um Waleed Creation', null, 2400, '/venues/roshinah/menu/047.webp', 6),
  ('Feta Cheese Makdoos Dip', 'تغميسة جبنة الفيتا بالمكدوس', 'Chef Um Waleed Creation', null, 2400, '/venues/roshinah/menu/048.webp', 7),
  ('Tikka Hummus Platter', 'بلاتر الحمص بالتكا', null, null, 4000, '/venues/roshinah/menu/049.webp', 8)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Sides', 'نقنقة', 8 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Shredded Cheddar', 'جبن مبشور', null, 'Shredded Cheddar', 1500, '/venues/roshinah/menu/050.webp', 0),
  ('Cream & Honey', 'قشطة وعسل', null, 'Cream & Honey', 1500, '/venues/roshinah/menu/051.webp', 1),
  ('Fried Halloumi', 'حلومي مقلي', 'Fried Haloumi', null, 2900, '/venues/roshinah/menu/052.webp', 2),
  ('Feta Cheese and Zaatar Balls', 'كرات جبنة الفيتا بالزعتر', 'Labneh Balls', null, 1800, '/venues/roshinah/menu/053.webp', 3),
  ('Zattar Dip', 'تغميسة الزعتر', null, 'Zattar Dip', 1200, '/venues/roshinah/menu/054.webp', 4),
  ('Makdous', 'مكدوس', null, 'Makdous', 1800, '/venues/roshinah/menu/055.webp', 5),
  ('Finger Salad & Olives', 'سلطة أصابع وزيتون', null, 'Finger Salad & Olives', 1100, '/venues/roshinah/menu/056.webp', 6),
  ('Lebneh & Zattar', 'لبنة وزعتر', null, 'Lebneh & Zattar', 1500, '/venues/roshinah/menu/057.webp', 7),
  ('lebneh & Jam', 'لبنة ومربى', 'lebned & Jam', null, 1500, '/venues/roshinah/menu/058.webp', 8),
  ('Honey', 'عسل', null, 'Honey', 1000, '/venues/roshinah/menu/059.webp', 9),
  ('Jam', 'مربى', null, 'Jam', 1000, '/venues/roshinah/menu/060.webp', 10),
  ('Labneh', 'لبنة', null, 'Labneh', 1000, '/venues/roshinah/menu/061.webp', 11)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Saj Bread', 'خبز الصاج', 9 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Cheese and Zaater', 'الجبن والزعتر', null, null, 2500, '/venues/roshinah/menu/062.webp', 0),
  ('Muhammarah', 'محمرة', null, null, 2500, '/venues/roshinah/menu/063.webp', 1),
  ('Lebnah and Honey', 'لبنان والعسل', null, null, 2500, '/venues/roshinah/menu/064.webp', 2),
  ('Chocolate', 'شيكولاتة', null, null, 3000, '/venues/roshinah/menu/065.webp', 3),
  ('Mehyawa', 'ميهياوا', null, null, 2500, '/venues/roshinah/menu/066.webp', 4),
  ('Beef and Cheese', null, null, null, 3000, '/venues/roshinah/menu/067.webp', 5)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'From the Tanoor', 'من التنور', 10 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Cheese Khoboz', 'خبر بالجبنة', null, 'Cheese Khoboz', 1000, '/venues/roshinah/menu/068.webp', 0),
  ('Cheese & Zaater Khoboz', 'خبز بالجبنة والزعتر', null, 'Cheese & Zaater Khoboz', 1300, '/venues/roshinah/menu/069.webp', 1),
  ('Nutella Khoboz', 'خبز بالنوتيلا', null, 'Nutella Khoboz', 1700, '/venues/roshinah/menu/070.webp', 2),
  ('Mehyawa Bread', 'خبز مهياوة', null, 'Mehyawa Bread', 2000, '/venues/roshinah/menu/071.webp', 3),
  ('Khoboz with Halwa', null, null, null, 2000, '/venues/roshinah/menu/072.webp', 4)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Drinks: Traditional Cold', 'المشروبات: يسرسح', 11 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Rose Milk', 'حليب ورد', null, null, 1300, '/venues/roshinah/menu/073.webp', 0),
  ('Rose Drink', 'شربت ورد', null, null, 1300, null, 1),
  ('Vimto', 'فيمتو', null, null, 1300, '/venues/roshinah/menu/075.webp', 2),
  ('Saffron Drink', 'شربت زعفران', null, null, 1800, '/venues/roshinah/menu/076.webp', 3),
  ('Saffron Milk', 'حليب الزعفران', null, null, 2000, null, 4),
  ('Green Drink', null, null, null, 1200, '/venues/roshinah/menu/078.webp', 5),
  ('Karkade Original', null, null, null, 1600, '/venues/roshinah/menu/079.webp', 6),
  ('Karkade Rose', null, null, null, 1800, '/venues/roshinah/menu/080.webp', 7)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Drinks: Traditional Hot', 'المشروبات: تعديل مزاج', 12 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Karak Tea Cup', 'كوب كرك', null, null, 600, '/venues/roshinah/menu/081.webp', 0),
  ('Karak Tea Pot', 'دلة كرك', null, null, 1800, '/venues/roshinah/menu/082.webp', 1),
  ('Tea Cup', 'كوب شاي', null, null, 600, '/venues/roshinah/menu/083.webp', 2),
  ('Tea Pot', 'دلة شاي', null, null, 1500, null, 3),
  ('Moroccan Tea Pot (Small)', 'غوري شاي مغربي صغير', null, null, 1500, '/venues/roshinah/menu/085.webp', 4),
  ('Moroccan Tea Pot (Big)', 'غوري شاي مغربي كبير', null, null, 2300, '/venues/roshinah/menu/086.webp', 5),
  ('Turkish Coffee', 'قهوة تركية', null, null, 1300, '/venues/roshinah/menu/087.webp', 6),
  ('French Coffee', 'قهوة فرنسية', null, null, 1300, '/venues/roshinah/menu/088.webp', 7)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Drinks: Fresh Juices', 'المشروبات: Fresh Juices', 13 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Lemon and Mint juice', null, null, null, 1600, null, 0),
  ('Lemon Juice', null, null, null, 1500, null, 1)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);
