-- Loyalty: withdraw a sent offer (migration 0004)
-- Adds when an offer was withdrawn and by whom. A withdrawn offer stays in the list as history,
-- but it stops showing on Wallet cards (Apple passes are rebuilt without it).
-- Safe to run more than once, and on top of 0001, 0002 and 0003. Nothing here changes points or ledger rules.
-- Apply it BEFORE deploying the code that reads these columns.

alter table offers
  add column if not exists withdrawn_at timestamptz,
  -- Who withdrew it. If that staff account is ever deleted, the offer keeps its history and the link is cleared.
  add column if not exists withdrawn_by uuid references staff_users(id) on delete set null;
