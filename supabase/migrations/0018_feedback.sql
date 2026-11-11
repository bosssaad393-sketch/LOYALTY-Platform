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
