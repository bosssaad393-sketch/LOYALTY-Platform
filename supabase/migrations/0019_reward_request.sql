-- 0019: a guest can use their points for the venue's reward from their table ("Redeem points"). The points come off the
-- card at once (ledger_redeem_guest: no staff member on the entry, the audit log says 'guest'), and the staff board gets
-- its own kind of call saying what to bring.
-- Safe to run twice. Run it on the project after a backup.

alter table table_requests drop constraint if exists table_requests_kind_check;
alter table table_requests add constraint table_requests_kind_check check (kind in ('coal', 'waiter', 'bill', 'cash', 'reward'));

-- Same rules as ledger_redeem (0002), without a staff member: spends exactly reward_goal points, never below zero.
create or replace function ledger_redeem_guest(p_card uuid)
returns table (ledger_id bigint, new_balance integer)
language plpgsql security definer set search_path = public as $$
declare
  v_card  cards;
  v_venue venues;
  v_id    bigint;
begin
  select * into v_card from cards where id = p_card for update;
  if not found then raise exception 'card not found'; end if;
  select * into v_venue from venues where id = v_card.venue_id;
  if v_card.points < v_venue.reward_goal then
    raise exception 'not enough points to redeem';
  end if;

  insert into ledger (card_id, venue_id, kind, points, staff_id, note)
  values (v_card.id, v_card.venue_id, 'redeem', -v_venue.reward_goal, null, v_venue.reward_text)
  returning id into v_id;

  insert into audit_log (venue_id, actor, action, detail)
  values (v_card.venue_id, 'guest', 'redeem',
          jsonb_build_object('card', v_card.id, 'ledger', v_id, 'points', -v_venue.reward_goal, 'from', 'table'));

  return query select v_id, (select c.points from cards c where c.id = p_card);
end $$;

revoke all on function ledger_redeem_guest(uuid) from public, anon, authenticated;
grant execute on function ledger_redeem_guest(uuid) to service_role;
