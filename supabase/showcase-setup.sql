-- LOYALTY showcase: everything in one paste (migrations 0001 to 0008, then the showcase seed).
-- Run ONCE in a NEW, EMPTY Supabase project's SQL editor (never on a client's live database).

-- ===== 0001_init.sql =====
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

-- ===== 0002_ledger.sql =====
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

-- ===== 0003_owner_offers_privacy.sql =====
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

-- ===== 0004_offer_withdraw.sql =====
-- Loyalty: withdraw a sent offer (migration 0004)
-- Adds when an offer was withdrawn and by whom. A withdrawn offer stays in the list as history,
-- but it stops showing on Wallet cards (Apple passes are rebuilt without it).
-- Safe to run more than once, and on top of 0001, 0002 and 0003. Nothing here changes points or ledger rules.
-- Apply it BEFORE deploying the code that reads these columns.

alter table offers
  add column if not exists withdrawn_at timestamptz,
  -- Who withdrew it. If that staff account is ever deleted, the offer keeps its history and the link is cleared.
  add column if not exists withdrawn_by uuid references staff_users(id) on delete set null;

-- ===== 0005_owner_assistant.sql =====
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

-- ===== 0006_pos_connector.sql =====
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

-- ===== 0007_staff_perks.sql =====
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

-- ===== 0008_pin_login.sql =====
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

-- ===== showcase seed =====
-- SHOWCASE seed: invented people for the demo venue, so Saad can show a real, hosted dashboard to prospects.
-- Run AFTER migrations 0001 to 0008, in the showcase project's own Supabase. Never on a client's database.
-- Safe to run twice. PINs are not set here (they are a keyed hash made by the app): sign in at /dev, open Access, press "Give a PIN".

do $$
declare v uuid;
begin
  select id into v from venues where slug = 'demo';
  if v is null then raise exception 'venue demo not found: run the migrations first'; end if;

  update venues set name = 'Sol', reward_text = 'A dessert of your choice' where id = v;

  insert into staff_users (id, venue_id, name, role, active) values
    ('00000000-0000-4000-8000-0000000000a1', v, 'Demo owner', 'owner', true),
    ('00000000-0000-4000-8000-0000000000a2', v, 'Reem', 'manager', true),
    ('00000000-0000-4000-8000-0000000000a3', v, 'Ahmed', 'staff', true)
  on conflict (id) do nothing;

  insert into members (id, name, phone, consent_terms) values
    ('00000000-0000-4000-8000-0000000000d1', 'Ann Demo', '+97300000001', now()),
    ('00000000-0000-4000-8000-0000000000d2', 'Khalid Demo', '+97300000002', now()),
    ('00000000-0000-4000-8000-0000000000d3', 'Maryam Demo', '+97300000003', now())
  on conflict (id) do nothing;

  insert into cards (id, venue_id, member_id, code) values
    ('00000000-0000-4000-8000-0000000000c1', v, '00000000-0000-4000-8000-0000000000d1', '4821'),
    ('00000000-0000-4000-8000-0000000000c2', v, '00000000-0000-4000-8000-0000000000d2', '5555'),
    ('00000000-0000-4000-8000-0000000000c3', v, '00000000-0000-4000-8000-0000000000d3', '1357')
  on conflict (id) do nothing;

  if not exists (select 1 from ledger where note = 'showcase seed') then
    insert into ledger (card_id, venue_id, kind, points, note) values
      ('00000000-0000-4000-8000-0000000000c1', v, 'welcome', 380, 'showcase seed'),
      ('00000000-0000-4000-8000-0000000000c2', v, 'welcome', 520, 'showcase seed'),
      ('00000000-0000-4000-8000-0000000000c3', v, 'welcome', 40, 'showcase seed');
  end if;
end $$;

-- Your developer account: first create the user in Supabase (Authentication > Users > Add user), then replace YOUR-EMAIL and run:
-- insert into staff_users (auth_user, venue_id, name, role, active)
-- select u.id, (select id from venues where slug = 'demo'), 'Saad (developer)', 'developer', true from auth.users u where u.email = 'YOUR-EMAIL';
