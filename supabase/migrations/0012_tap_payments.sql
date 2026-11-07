-- 0012: guests pay their table's tab on Tap's own payment page (BENEFIT, cards, Apple Pay: whatever the venue's Tap account offers).
-- The money goes straight to the venue's own Tap account; Orbyn never holds it. A payment counts only once the server has asked
-- Tap itself and Tap says CAPTURED for the same amount. Money is integer fils (BHD 1.500 = 1500).
-- Safe to run twice. Run it on the project after a backup.

-- A tab can now be closed by a card payment, or by card plus the rest in cash.
alter table tabs drop constraint if exists tabs_paid_method_check;
alter table tabs add constraint tabs_paid_method_check check (paid_method in ('cash', 'tap', 'mixed'));

create table if not exists payments (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references venues(id) on delete cascade,
  tab_id          uuid not null references tabs(id) on delete cascade,
  provider        text not null default 'tap' check (provider in ('tap')),
  charge_id       text unique,                    -- Tap's chg_... id, set once Tap has made the charge
  amount_fils     integer not null check (amount_fils > 0),
  currency        text not null default 'BHD' check (currency = 'BHD'),
  -- initiated = sent to Tap, not paid yet; captured = Tap confirmed the money; failed = declined, cancelled or abandoned;
  -- review = Tap answered something that does not match this payment (amount, currency, reference): a person must look.
  status          text not null default 'initiated' check (status in ('initiated', 'captured', 'failed', 'review')),
  provider_status text,                           -- Tap's own word, e.g. CAPTURED, DECLINED
  method          text,                           -- e.g. BENEFIT, VISA, as Tap reports it
  pay_url         text,                           -- Tap's payment page for this charge, so a second tap on Pay reuses it
  note            text check (note is null or length(note) <= 300),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  paid_at         timestamptz
);
create index if not exists payments_tab_idx on payments (tab_id, created_at);
create index if not exists payments_venue_idx on payments (venue_id, created_at desc);

-- Locked like every other table: only the server (service role) reads and writes payments.
alter table payments enable row level security;
