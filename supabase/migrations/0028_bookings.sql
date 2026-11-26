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
