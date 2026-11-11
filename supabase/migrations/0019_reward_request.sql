-- 0019: a guest can ask for the venue's reward from their table ("Redeem points"). It reaches the staff board as its own kind
-- of call; the points are spent only when staff confirm it there (ledger_redeem, with the staff member recorded).
-- Safe to run twice. Run it on the project after a backup.

alter table table_requests drop constraint if exists table_requests_kind_check;
alter table table_requests add constraint table_requests_kind_check check (kind in ('coal', 'waiter', 'bill', 'cash', 'reward'));
