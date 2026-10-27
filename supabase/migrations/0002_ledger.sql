-- Loyalty: ledger rules enforced in the database (migration 0002)
-- Points are only ever changed by these functions. Each one writes a ledger row;
-- the trigger from 0001 keeps cards.points in sync. Nothing here edits a balance directly.

-- An entry can be undone at most once.
create unique index if not exists ledger_one_undo on ledger (undoes) where kind = 'undo';

-- Same trigger as 0001, plus: undoing a redeem gives the reward back (rewards_given - 1).
create or replace function apply_ledger() returns trigger language plpgsql as $$
begin
  update cards set
    points        = points + new.points,
    visits        = visits + case when new.kind = 'earn' then 1
                                  when new.kind = 'undo' and new.points < 0 then -1 else 0 end,
    rewards_given = rewards_given + case when new.kind = 'redeem' then 1
                                         when new.kind = 'undo' and new.points > 0 then -1 else 0 end,
    last_visit    = case when new.kind = 'earn' then new.created_at else last_visit end
  where id = new.card_id;
  if (select points from cards where id = new.card_id) < 0 then
    raise exception 'points cannot go below zero';
  end if;
  return new;
end $$;

-- Earn: bill (BHD) x venue points_per_bhd, rounded down ---------------------------
create or replace function ledger_earn(p_card uuid, p_staff uuid, p_bill numeric)
returns table (ledger_id bigint, points_added integer, new_balance integer)
language plpgsql security definer set search_path = public as $$
declare
  v_card  cards;
  v_venue venues;
  v_staff staff_users;
  v_pts   integer;
  v_id    bigint;
begin
  select * into v_card from cards where id = p_card for update;   -- lock: no double spend
  if not found then raise exception 'card not found'; end if;
  select * into v_venue from venues where id = v_card.venue_id;
  select * into v_staff from staff_users where id = p_staff and active;
  if not found or v_staff.venue_id <> v_card.venue_id then
    raise exception 'staff member is not allowed at this venue';
  end if;
  if not v_venue.active then raise exception 'venue is not active'; end if;
  if p_bill is null or p_bill <= 0 or p_bill > 5000 then
    raise exception 'invalid bill amount';
  end if;
  v_pts := floor(p_bill * v_venue.points_per_bhd);
  if v_pts < 1 then raise exception 'bill is too small to earn points'; end if;

  insert into ledger (card_id, venue_id, kind, points, bill_bhd, staff_id)
  values (v_card.id, v_card.venue_id, 'earn', v_pts, p_bill, p_staff)
  returning id into v_id;

  insert into audit_log (venue_id, actor, action, detail)
  values (v_card.venue_id, p_staff::text, 'earn',
          jsonb_build_object('card', v_card.id, 'ledger', v_id, 'points', v_pts, 'bill_bhd', p_bill));

  return query select v_id, v_pts, (select c.points from cards c where c.id = p_card);
end $$;

-- Redeem: spends exactly reward_goal points -----------------------------------------
create or replace function ledger_redeem(p_card uuid, p_staff uuid)
returns table (ledger_id bigint, new_balance integer)
language plpgsql security definer set search_path = public as $$
declare
  v_card  cards;
  v_venue venues;
  v_staff staff_users;
  v_id    bigint;
begin
  select * into v_card from cards where id = p_card for update;
  if not found then raise exception 'card not found'; end if;
  select * into v_venue from venues where id = v_card.venue_id;
  select * into v_staff from staff_users where id = p_staff and active;
  if not found or v_staff.venue_id <> v_card.venue_id then
    raise exception 'staff member is not allowed at this venue';
  end if;
  if v_card.points < v_venue.reward_goal then
    raise exception 'not enough points to redeem';
  end if;

  insert into ledger (card_id, venue_id, kind, points, staff_id, note)
  values (v_card.id, v_card.venue_id, 'redeem', -v_venue.reward_goal, p_staff, v_venue.reward_text)
  returning id into v_id;

  insert into audit_log (venue_id, actor, action, detail)
  values (v_card.venue_id, p_staff::text, 'redeem',
          jsonb_build_object('card', v_card.id, 'ledger', v_id, 'points', -v_venue.reward_goal));

  return query select v_id, (select c.points from cards c where c.id = p_card);
end $$;

-- Undo: only earn/redeem, only once, only within 10 minutes ---------------------------
create or replace function ledger_undo(p_entry bigint, p_staff uuid)
returns table (ledger_id bigint, new_balance integer)
language plpgsql security definer set search_path = public as $$
declare
  v_entry ledger;
  v_staff staff_users;
  v_id    bigint;
begin
  select * into v_entry from ledger where id = p_entry for update;
  if not found then raise exception 'entry not found'; end if;
  perform 1 from cards where id = v_entry.card_id for update;
  select * into v_staff from staff_users where id = p_staff and active;
  if not found or v_staff.venue_id <> v_entry.venue_id then
    raise exception 'staff member is not allowed at this venue';
  end if;
  if v_entry.kind not in ('earn', 'redeem') then
    raise exception 'only earn and redeem entries can be undone';
  end if;
  if now() - v_entry.created_at > interval '10 minutes' then
    raise exception 'the 10 minute undo window has passed';
  end if;

  begin
    insert into ledger (card_id, venue_id, kind, points, staff_id, undoes)
    values (v_entry.card_id, v_entry.venue_id, 'undo', -v_entry.points, p_staff, v_entry.id)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'this entry was already undone';
  end;

  insert into audit_log (venue_id, actor, action, detail)
  values (v_entry.venue_id, p_staff::text, 'undo',
          jsonb_build_object('card', v_entry.card_id, 'undid', v_entry.id, 'ledger', v_id));

  return query select v_id, (select c.points from cards c where c.id = v_entry.card_id);
end $$;

-- Only the server (service role) may call these. Never the browser.
revoke all on function ledger_earn(uuid, uuid, numeric)   from public, anon, authenticated;
revoke all on function ledger_redeem(uuid, uuid)          from public, anon, authenticated;
revoke all on function ledger_undo(bigint, uuid)          from public, anon, authenticated;
grant execute on function ledger_earn(uuid, uuid, numeric) to service_role;
grant execute on function ledger_redeem(uuid, uuid)        to service_role;
grant execute on function ledger_undo(bigint, uuid)        to service_role;
