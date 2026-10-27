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
