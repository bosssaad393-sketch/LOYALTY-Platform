-- 0034: the guest record (CRM). The owner opens one guest and sees everything about them in one place.
--
-- guest_notes: what the owner or a manager writes about a guest ("allergic to nuts", "likes the corner table").
--   Private to the venue's own team: never shown to the guest, never on the Wallet card.
--   Removed with the card when a guest's data is erased (on delete cascade), so an erased guest leaves no notes behind.
-- cards.tags: short labels the venue puts on a guest ("vip", "family"), eight at most, used to filter the guest list.
-- Safe to run twice. Run after 0033, on the client's OWN database, after a backup.

create table if not exists guest_notes (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  staff_id uuid references staff_users(id) on delete set null,
  author text not null check (length(author) between 1 and 80),
  body text not null check (length(body) between 1 and 600),
  created_at timestamptz not null default now()
);

create index if not exists guest_notes_card_created on guest_notes (card_id, created_at desc);

-- Locked like every other table: only the server (service role) reads and writes it.
alter table guest_notes enable row level security;

alter table cards add column if not exists tags text[] not null default '{}' check (cardinality(tags) <= 8);
