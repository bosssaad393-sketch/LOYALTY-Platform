-- Stamp mode (migration 0020, 2026-11-20, first used by Spaloon)
-- A venue with stamp_tiers set runs on stamps instead of points per BHD:
--   * one stamp (= 1 point in the ledger) per paid visit, added by staff with ledger_stamp;
--   * rewards come in order, e.g. [{"at":3,"text":"10% off"},{"at":6,"text":"..."},{"at":9,"text":"..."}];
--   * each reward costs the stamps between it and the previous one (3, 3, 3 above), and which reward is
--     due follows from cards.rewards_given (0 -> first, 1 -> second, ...; after the last it starts again).
-- Points venues (stamp_tiers null) are unchanged. Undo keeps working: undoing a redeem gives the stamps back
-- and lowers rewards_given, so the same reward is due again.

alter table venues add column if not exists stamp_tiers jsonb
  check (stamp_tiers is null or (jsonb_typeof(stamp_tiers) = 'array' and jsonb_array_length(stamp_tiers) between 1 and 6));

-- Stamp venues use small goals (3 stamps); points venues keep their old range in practice.
alter table venues drop constraint if exists venues_reward_goal_check;
alter table venues add constraint venues_reward_goal_check check (reward_goal between 1 and 100000);

-- Cost and text of the reward due next for a card (stamp venues only).
create or replace function stamp_due(p_tiers jsonb, p_rewards_given integer)
returns table (cost integer, reward text)
language plpgsql immutable as $$
declare
  n    integer := jsonb_array_length(p_tiers);
  i    integer := mod(greatest(p_rewards_given, 0), n);
  prev integer := case when i = 0 then 0 else (p_tiers -> (i - 1) ->> 'at')::integer end;
begin
  return query select ((p_tiers -> i ->> 'at')::integer - prev), (p_tiers -> i ->> 'text');
end $$;

-- Add one stamp ---------------------------------------------------------------------
create or replace function ledger_stamp(p_card uuid, p_staff uuid)
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
  if not v_venue.active then raise exception 'venue is not active'; end if;
  if v_venue.stamp_tiers is null then raise exception 'this venue does not use stamps'; end if;
  if exists (select 1 from ledger l where l.card_id = p_card and l.kind = 'earn'
             and l.created_at > now() - interval '30 minutes'
             and not exists (select 1 from ledger u where u.undoes = l.id)) then
    raise exception 'already stamped in the last 30 minutes';
  end if;

  insert into ledger (card_id, venue_id, kind, points, staff_id, note)
  values (v_card.id, v_card.venue_id, 'earn', 1, p_staff, 'stamp')
  returning id into v_id;

  insert into audit_log (venue_id, actor, action, detail)
  values (v_card.venue_id, p_staff::text, 'stamp', jsonb_build_object('card', v_card.id, 'ledger', v_id));

  return query select v_id, (select c.points from cards c where c.id = p_card);
end $$;

-- Redeem: points venues as before; stamp venues spend the due reward's cost ---------------------
create or replace function ledger_redeem(p_card uuid, p_staff uuid)
returns table (ledger_id bigint, new_balance integer)
language plpgsql security definer set search_path = public as $$
declare
  v_card  cards;
  v_venue venues;
  v_staff staff_users;
  v_id    bigint;
  v_cost  integer;
  v_text  text;
begin
  select * into v_card from cards where id = p_card for update;
  if not found then raise exception 'card not found'; end if;
  select * into v_venue from venues where id = v_card.venue_id;
  select * into v_staff from staff_users where id = p_staff and active;
  if not found or v_staff.venue_id <> v_card.venue_id then
    raise exception 'staff member is not allowed at this venue';
  end if;
  if v_venue.stamp_tiers is null then
    v_cost := v_venue.reward_goal;
    v_text := v_venue.reward_text;
  else
    select d.cost, d.reward into v_cost, v_text from stamp_due(v_venue.stamp_tiers, v_card.rewards_given) d;
  end if;
  if v_card.points < v_cost then
    raise exception 'not enough points to redeem';
  end if;

  insert into ledger (card_id, venue_id, kind, points, staff_id, note)
  values (v_card.id, v_card.venue_id, 'redeem', -v_cost, p_staff, v_text)
  returning id into v_id;

  insert into audit_log (venue_id, actor, action, detail)
  values (v_card.venue_id, p_staff::text, 'redeem',
          jsonb_build_object('card', v_card.id, 'ledger', v_id, 'points', -v_cost, 'reward', v_text));

  return query select v_id, (select c.points from cards c where c.id = p_card);
end $$;

revoke all on function ledger_stamp(uuid, uuid)  from public, anon, authenticated;
revoke all on function ledger_redeem(uuid, uuid) from public, anon, authenticated;
grant execute on function ledger_stamp(uuid, uuid)  to service_role;
grant execute on function ledger_redeem(uuid, uuid) to service_role;
