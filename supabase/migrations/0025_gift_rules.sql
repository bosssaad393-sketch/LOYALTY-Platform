-- 0025: more ways a gift unlocks.
--
-- * 'visit_count': the gift unlocks on one chosen visit (the 5th, the 10th ...), once per guest. Several of these make
--   a ladder the guest climbs.
-- * 'birthday': the gift unlocks on the guest's birthday, every year, from the daily job (birthday_gifts). Only guests
--   who gave their date of birth.
-- * card_vouchers.cycle: 0 for a gift a guest gets once, the year for a birthday gift, so "once" still holds per year.
-- * visit_gifts: the one place that decides which gifts a visit unlocks; a staff scan (ledger_visit) and a till bill
--   (pos_receipt) both call it, so they can never disagree.
-- Safe to run twice. Run after 0024, on the client's OWN database, after a backup.

alter table vouchers drop constraint if exists vouchers_trigger_check;
alter table vouchers add constraint vouchers_trigger_check check (trigger in ('first_visit', 'every_visit', 'manual', 'visit_count', 'birthday'));
alter table vouchers add column if not exists at_visit integer check (at_visit is null or at_visit between 2 and 1000);
alter table vouchers drop constraint if exists vouchers_at_visit_needed;
alter table vouchers add constraint vouchers_at_visit_needed check (trigger <> 'visit_count' or at_visit is not null);

alter table card_vouchers add column if not exists cycle integer not null default 0;
alter table card_vouchers drop constraint if exists card_vouchers_card_id_voucher_id_key;
create unique index if not exists card_vouchers_once_idx on card_vouchers (card_id, voucher_id, cycle);

-- Which gifts this visit unlocks. Called after the visit is in the ledger, so cards.visits already counts it.
create or replace function visit_gifts(p_card uuid, p_venue uuid, p_staff uuid, p_branch uuid, p_first boolean)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_new    integer := 0;
  v_visits integer;
  r        vouchers;
begin
  select c.visits into v_visits from cards c where c.id = p_card;
  for r in select * from vouchers v where v.venue_id = p_venue and v.active
             and (v.trigger = 'every_visit' or (v.trigger = 'first_visit' and p_first)
                  or (v.trigger = 'visit_count' and v.at_visit = v_visits)) loop
    insert into card_vouchers (card_id, venue_id, voucher_id, issued_by, issued_branch, expires_at)
    values (p_card, p_venue, r.id, p_staff, p_branch,
            case when r.valid_days is null then null else now() + make_interval(days => r.valid_days) end)
    on conflict (card_id, voucher_id, cycle) do nothing;
    if found then v_new := v_new + 1; end if;
  end loop;
  return v_new;
end $$;

-- The staff scan, as in 0022, with the gifts decided by visit_gifts.
create or replace function ledger_visit(p_card uuid, p_staff uuid, p_branch uuid)
returns table (ledger_id bigint, visits integer, vouchers_issued integer)
language plpgsql security definer set search_path = public as $$
declare
  v_card   cards;
  v_venue  venues;
  v_staff  staff_users;
  v_branch branches;
  v_id     bigint;
  v_new    integer := 0;
  v_first  boolean;
begin
  select * into v_card from cards where id = p_card for update;
  if not found then raise exception 'card not found'; end if;
  select * into v_venue from venues where id = v_card.venue_id;
  select * into v_staff from staff_users where id = p_staff and active;
  if not found or v_staff.venue_id <> v_card.venue_id then
    raise exception 'staff member is not allowed at this venue';
  end if;
  if not v_venue.active then raise exception 'venue is not active'; end if;
  if v_venue.card_mode is distinct from 'visits' then raise exception 'this venue does not use visit cards'; end if;

  if p_branch is not null then
    select * into v_branch from branches where id = p_branch and venue_id = v_card.venue_id and active;
    if not found then raise exception 'branch not found'; end if;
    if v_branch.kind <> 'branch' then raise exception 'visits cannot be recorded at this counter'; end if;
  elsif exists (select 1 from branches b where b.venue_id = v_card.venue_id and b.active and b.kind = 'branch') then
    raise exception 'choose a branch first';
  end if;
  if v_staff.branch_id is not null and v_staff.branch_id is distinct from p_branch then
    raise exception 'staff member is not allowed at this branch';
  end if;

  if exists (select 1 from ledger l where l.card_id = p_card and l.kind = 'earn'
             and l.created_at > now() - make_interval(mins => v_venue.visit_gap_minutes)
             and not exists (select 1 from ledger u where u.undoes = l.id)) then
    raise exception 'visit already recorded';
  end if;
  if (select count(*) from ledger l where l.staff_id = p_staff and l.kind = 'earn' and l.note = 'visit'
        and l.created_at > now() - interval '24 hours') >= v_venue.visit_cap_per_staff then
    raise exception 'daily scan limit reached';
  end if;

  v_first := not exists (select 1 from ledger l where l.card_id = p_card and l.kind = 'earn' and l.note = 'visit');

  insert into ledger (card_id, venue_id, kind, points, staff_id, note, branch_id)
  values (v_card.id, v_card.venue_id, 'earn', 0, p_staff, 'visit', p_branch)
  returning id into v_id;

  v_new := visit_gifts(v_card.id, v_card.venue_id, p_staff, p_branch, v_first);

  insert into audit_log (venue_id, branch_id, actor, action, detail)
  values (v_card.venue_id, p_branch, p_staff::text, 'visit',
          jsonb_build_object('card', v_card.id, 'ledger', v_id, 'vouchers_issued', v_new));

  return query select v_id, (select c.visits from cards c where c.id = p_card), v_new;
end $$;

-- The till bill, as in 0024, with the gifts decided by visit_gifts.
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
    v_new := visit_gifts(v_card.id, p_venue, null, v_branch.id, v_first);
    insert into audit_log (venue_id, branch_id, actor, action, detail)
    values (p_venue, v_branch.id, 'pos', 'visit',
            jsonb_build_object('card', v_card.id, 'ledger', v_ledger, 'vouchers_issued', v_new, 'receipt', p_receipt));
  end if;

  return query select v_id, v_card.id, false, v_visit, (select c.visits from cards c where c.id = v_card.id), v_new;
end $$;

-- The daily job: every guest of this venue whose birthday is the given day gets this year's birthday gifts, once.
-- p_feb29: also guests born on 29 February (the job passes true on 28 February of a year without one).
create or replace function birthday_gifts(p_venue uuid, p_month integer, p_day integer, p_year integer, p_feb29 boolean)
returns table (gift_card uuid)
language plpgsql security definer set search_path = public as $$
declare
  c     record;
  r     vouchers;
  v_any boolean;
begin
  if not exists (select 1 from vouchers v where v.venue_id = p_venue and v.active and v.trigger = 'birthday') then return; end if;
  for c in select k.id from cards k join members m on m.id = k.member_id
            where k.venue_id = p_venue and m.deleted_at is null
              and ((m.birth_month = p_month and m.birth_day = p_day) or (p_feb29 and m.birth_month = 2 and m.birth_day = 29)) loop
    v_any := false;
    for r in select * from vouchers v where v.venue_id = p_venue and v.active and v.trigger = 'birthday' loop
      insert into card_vouchers (card_id, venue_id, voucher_id, cycle, expires_at)
      values (c.id, p_venue, r.id, p_year, case when r.valid_days is null then null else now() + make_interval(days => r.valid_days) end)
      on conflict (card_id, voucher_id, cycle) do nothing;
      if found then v_any := true; end if;
    end loop;
    if v_any then
      insert into audit_log (venue_id, actor, action, detail) values (p_venue, 'system', 'birthday_gift', jsonb_build_object('card', c.id));
      gift_card := c.id;
      return next;
    end if;
  end loop;
end $$;

revoke all on function visit_gifts(uuid, uuid, uuid, uuid, boolean)            from public, anon, authenticated;
revoke all on function birthday_gifts(uuid, integer, integer, integer, boolean) from public, anon, authenticated;
grant execute on function visit_gifts(uuid, uuid, uuid, uuid, boolean)            to service_role;
grant execute on function birthday_gifts(uuid, integer, integer, integer, boolean) to service_role;
