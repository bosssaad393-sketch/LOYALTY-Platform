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
