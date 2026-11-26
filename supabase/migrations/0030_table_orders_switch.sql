-- 0030: a visit-card venue may let guests order from the table's code.
--
-- A points venue always could. A visit-card venue (a restaurant whose waiters take the order) opens its guest page
-- from the table's code instead; with this switch on, that page also offers "Order from your table": the rounds go to
-- the staff's table board, the bill is paid at the counter (or by card from the phone where a Tap account is set up),
-- and each order is kept under the guest's card, so the owner sees what each guest ordered without a till link.
-- Off by default: it changes how the floor works, so the owner decides.
-- Safe to run twice. Run after 0029, on the client's OWN database, after a backup.

alter table venues add column if not exists table_orders_on boolean not null default false;
