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
