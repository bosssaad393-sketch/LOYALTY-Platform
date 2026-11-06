-- Turns the live project into Orbyn. Paste the whole file into the Supabase SQL editor and press Run.
-- It runs as one transaction: if anything fails, nothing changes. Safe to run twice.
-- Part 1 adds the table service tables (nothing existing is changed).
-- Part 2 renames the one live venue to Orbyn, keeping its guests, points, staff and sign-ins.
-- To undo part 2: update venues set slug = 'n10', name = 'Nº10 by Hydur', brand = '{"background":"#0a0710","label":"#f0cf8a","text":"#f7f0e1"}'::jsonb where slug = 'orbyn';

begin;

-- Part 1
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

-- Part 2
update venues
   set slug = 'orbyn',
       name = 'Orbyn',
       brand = '{"background":"#04191d","label":"#14f1e9","text":"#eaf7f5"}'::jsonb
 where slug = 'n10'
   and not exists (select 1 from venues where slug = 'orbyn');

update venues
   set slug = 'orbyn',
       name = 'Orbyn',
       brand = '{"background":"#04191d","label":"#14f1e9","text":"#eaf7f5"}'::jsonb,
       reward_text = replace(reward_text, 'Demo Venue', 'Orbyn')
 where slug = 'demo'
   and not exists (select 1 from venues where slug = 'orbyn');

-- The invented showcase people, so no name says demo.
update members set name = 'Ann Hassan' where name = 'Ann Demo';
update members set name = 'Khalid Ali' where name = 'Khalid Demo';
update members set name = 'Maryam Saleh' where name = 'Maryam Demo';
update staff_users set name = 'Owner' where name = 'Demo owner';

commit;

-- This should show one venue called Orbyn, with slug orbyn, and the table count 7.
select slug, name,
       (select count(*) from information_schema.tables where table_schema = 'public'
         and table_name in ('venue_tables','menu_categories','menu_items','tabs','orders','order_items','table_requests')) as table_service_tables
  from venues;
