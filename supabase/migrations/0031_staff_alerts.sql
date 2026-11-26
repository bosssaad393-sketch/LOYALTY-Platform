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
