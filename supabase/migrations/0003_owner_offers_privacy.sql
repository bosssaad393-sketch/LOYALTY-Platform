-- Loyalty: owner offers + data-privacy tools (migration 0003)
-- Adds: venue terms text, deletion requests from guests (PDPL), and a recipients count on offers.
-- Safe to run once on top of 0001 and 0002. Nothing here changes points or ledger rules.

-- 1. The venue's own terms and conditions ---------------------------------------------
-- NULL = the guest page shows the built-in clauses. Set from the owner app (PUT /api/owner/terms).
alter table venues
  add column if not exists terms_text text
    check (terms_text is null or char_length(terms_text) between 50 and 8000),
  add column if not exists terms_updated_at timestamptz;

-- 2. Offers: how many guests each one was addressed to ----------------------------------
alter table offers
  add column if not exists recipients integer not null default 0 check (recipients >= 0);

create index if not exists offers_venue_sent_idx on offers (venue_id, sent_at desc);

-- 3. Guests asking for their data to be deleted ------------------------------------------
-- card_id has NO foreign key on purpose: erasing the guest deletes the card, and the request
-- must stay as history. The row holds no name, phone or email.
create table if not exists deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null references venues(id) on delete cascade,
  card_id      uuid,
  requested_at timestamptz not null default now(),
  status       text not null default 'pending' check (status in ('pending', 'erased')),
  erased_at    timestamptz
);

create index if not exists deletion_requests_venue_status_idx on deletion_requests (venue_id, status);

-- One pending request per card (asking twice does not create a second row).
create unique index if not exists deletion_requests_one_pending_per_card
  on deletion_requests (card_id) where status = 'pending' and card_id is not null;

-- Locked by default like every other table: only the server (service role) reads or writes it.
alter table deletion_requests enable row level security;
