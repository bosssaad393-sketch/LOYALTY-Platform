-- 0013: points for a table's bill, added by themselves when the tab is paid.
-- A guest who has opened their card on their phone is linked to the tab of the table they order from; when the tab is paid
-- (card, BENEFIT or cash) the bill's points go to that card through ledger_pos_sale with the receipt "tab:<tab id>", so the
-- same bill can never earn twice. Safe to run twice. Run it after 0012, after a backup.

alter table tabs add column if not exists card_id uuid references cards(id) on delete set null;
alter table tabs add column if not exists points_added integer check (points_added is null or points_added >= 0);
create index if not exists tabs_card_idx on tabs (card_id) where card_id is not null;
