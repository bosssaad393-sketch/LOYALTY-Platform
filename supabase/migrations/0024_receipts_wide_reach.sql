-- 0024: what each guest ordered, and a wider lock-screen area for a branch.
--
-- 1. receipts / receipt_items: a paid bill sent by the till (POS) is kept against the guest's card with its lines, so
--    the owner can see what each guest ordered. Deleting a guest deletes their receipts (cascade).
-- 2. pos_receipt: saves the bill once (the same receipt twice changes nothing). At a visit-card venue it also counts
--    the visit and unlocks the gifts that visit earns, with the same rules as a staff scan (ledger_visit, 0022), so
--    the cashier does not scan the card a second time.
-- 3. pos_receipt_refund: marks the bill refunded. The visit stays.
-- 4. branches.wide_reach: the Wallet card gets extra points around the branch (see lib/branches.ts passLocations).
-- Safe to run twice. Run after 0023, on the client's OWN database, after a backup.

alter table branches add column if not exists wide_reach boolean not null default false;

create table if not exists receipts (
  id          bigint generated always as identity primary key,
  venue_id    uuid not null references venues(id) on delete cascade,
  card_id     uuid not null references cards(id) on delete cascade,
  branch_id   uuid references branches(id) on delete set null,
  receipt     text not null check (length(receipt) between 1 and 64),
  total_fils  integer not null check (total_fils >= 0),
  refunded_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (venue_id, receipt)
);
create index if not exists receipts_card_idx on receipts (card_id, created_at desc);
alter table receipts enable row level security;

create table if not exists receipt_items (
  id         bigint generated always as identity primary key,
  receipt_id bigint not null references receipts(id) on delete cascade,
  venue_id   uuid not null references venues(id) on delete cascade,
  name       text not null check (length(name) between 1 and 120),
  qty        integer not null default 1 check (qty between 1 and 99),
  price_fils integer check (price_fils is null or price_fils >= 0)
);
create index if not exists receipt_items_receipt_idx on receipt_items (receipt_id);
alter table receipt_items enable row level security;

create or replace function pos_receipt(p_venue uuid, p_code text, p_receipt text, p_bill numeric, p_items jsonb, p_branch text)
returns table (receipt_id bigint, guest_card uuid, duplicate boolean, visit_counted boolean, visits integer, vouchers_issued integer)
language plpgsql security definer set search_path = public as $$
declare
  v_venue  venues;
  v_card   cards;
  v_old    receipts;
  v_branch branches;
  v_id     bigint;
  v_ledger bigint;
  v_new    integer := 0;
  v_first  boolean;
  v_visit  boolean := false;
  r        vouchers;
begin
  if p_receipt is null or length(trim(p_receipt)) = 0 or length(p_receipt) > 64 then
    raise exception 'a receipt id is required';
  end if;
  select * into v_venue from venues where id = p_venue;
  if not found or not v_venue.active then raise exception 'venue is not active'; end if;

  select * into v_old from receipts x where x.venue_id = p_venue and x.receipt = p_receipt;
  if found then
    return query select v_old.id, v_old.card_id, true, false, (select c.visits from cards c where c.id = v_old.card_id), 0;
    return;
  end if;

  select * into v_card from cards c where c.venue_id = p_venue and c.code = p_code for update;
  if not found then raise exception 'card not found'; end if;
  if p_bill is null or p_bill <= 0 or p_bill > 5000 then raise exception 'invalid bill amount'; end if;
  if p_items is not null and (jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100) then
    raise exception 'invalid items';
  end if;

  -- The branch: named by the till, or the venue's only branch. A till that names a wrong branch is refused.
  if p_branch is not null and length(trim(p_branch)) > 0 then
    select * into v_branch from branches b where b.venue_id = p_venue and b.slug = lower(trim(p_branch)) and b.active;
    if not found then raise exception 'branch not found'; end if;
  elsif (select count(*) from branches b where b.venue_id = p_venue and b.active and b.kind = 'branch') = 1 then
    select * into v_branch from branches b where b.venue_id = p_venue and b.active and b.kind = 'branch';
  end if;

  begin
    insert into receipts (venue_id, card_id, branch_id, receipt, total_fils)
    values (p_venue, v_card.id, v_branch.id, p_receipt, round(p_bill * 1000)::integer)
    returning id into v_id;
  exception when unique_violation then
    select * into v_old from receipts x where x.venue_id = p_venue and x.receipt = p_receipt;
    return query select v_old.id, v_old.card_id, true, false, (select c.visits from cards c where c.id = v_old.card_id), 0;
    return;
  end;

  insert into receipt_items (receipt_id, venue_id, name, qty, price_fils)
  select v_id, p_venue, left(trim(e->>'name'), 120), coalesce((e->>'qty')::integer, 1),
         case when e->>'priceBhd' is null then null else round((e->>'priceBhd')::numeric * 1000)::integer end
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  where length(trim(coalesce(e->>'name', ''))) > 0;

  -- A visit card: this bill is the visit, unless one is already counted for this sitting. A partner counter and a
  -- venue with several branches whose till did not say which one record the bill only.
  if v_venue.card_mode = 'visits' and v_branch.id is not null and v_branch.kind = 'branch'
     and not exists (select 1 from ledger l where l.card_id = v_card.id and l.kind = 'earn'
                     and l.created_at > now() - make_interval(mins => v_venue.visit_gap_minutes)
                     and not exists (select 1 from ledger u where u.undoes = l.id)) then
    v_first := not exists (select 1 from ledger l where l.card_id = v_card.id and l.kind = 'earn' and l.note = 'visit');
    insert into ledger (card_id, venue_id, kind, points, note, branch_id, source, external_ref)
    values (v_card.id, p_venue, 'earn', 0, 'visit', v_branch.id, 'pos', p_receipt)
    returning id into v_ledger;
    v_visit := true;
    for r in select * from vouchers v where v.venue_id = p_venue and v.active
               and (v.trigger = 'every_visit' or (v.trigger = 'first_visit' and v_first)) loop
      insert into card_vouchers (card_id, venue_id, voucher_id, issued_branch, expires_at)
      values (v_card.id, p_venue, r.id, v_branch.id,
              case when r.valid_days is null then null else now() + make_interval(days => r.valid_days) end)
      on conflict (card_id, voucher_id) do nothing;
      if found then v_new := v_new + 1; end if;
    end loop;
    insert into audit_log (venue_id, branch_id, actor, action, detail)
    values (p_venue, v_branch.id, 'pos', 'visit',
            jsonb_build_object('card', v_card.id, 'ledger', v_ledger, 'vouchers_issued', v_new, 'receipt', p_receipt));
  end if;

  return query select v_id, v_card.id, false, v_visit, (select c.visits from cards c where c.id = v_card.id), v_new;
end $$;

create or replace function pos_receipt_refund(p_venue uuid, p_receipt text)
returns table (receipt_id bigint, guest_card uuid, duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_old receipts;
begin
  select * into v_old from receipts x where x.venue_id = p_venue and x.receipt = p_receipt for update;
  if not found then raise exception 'receipt not found'; end if;
  if v_old.refunded_at is not null then
    return query select v_old.id, v_old.card_id, true;
    return;
  end if;
  update receipts set refunded_at = now() where id = v_old.id;
  insert into audit_log (venue_id, branch_id, actor, action, detail)
  values (p_venue, v_old.branch_id, 'pos', 'receipt_refund', jsonb_build_object('card', v_old.card_id, 'receipt', p_receipt));
  return query select v_old.id, v_old.card_id, false;
end $$;

revoke all on function pos_receipt(uuid, text, text, numeric, jsonb, text) from public, anon, authenticated;
revoke all on function pos_receipt_refund(uuid, text)                      from public, anon, authenticated;
grant execute on function pos_receipt(uuid, text, text, numeric, jsonb, text) to service_role;
grant execute on function pos_receipt_refund(uuid, text)                      to service_role;
