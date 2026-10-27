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
