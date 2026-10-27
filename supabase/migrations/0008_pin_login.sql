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
