-- 0027: bring a friend.
--
-- * cards.invite: a short random code a guest shares as a link (/join/<venue>?r=<code>). It is NOT the card's own
--   link: knowing it opens nothing. Made the first time the guest asks for their link.
-- * cards.invited_by: the card whose link the new guest joined with.
-- * vouchers.trigger 'friend': when an invited guest's FIRST visit is recorded, the member who invited them gets this
--   gift, once per friend. The friend gets the venue's first-visit gift as any new guest does.
-- Safe to run twice. Run after 0026, on the client's OWN database, after a backup.

alter table cards add column if not exists invite text;
create unique index if not exists cards_invite_idx on cards (invite) where invite is not null;
alter table cards add column if not exists invited_by uuid references cards(id) on delete set null;
create index if not exists cards_invited_by_idx on cards (invited_by) where invited_by is not null;

alter table vouchers drop constraint if exists vouchers_trigger_check;
alter table vouchers add constraint vouchers_trigger_check check (trigger in ('first_visit', 'every_visit', 'manual', 'visit_count', 'birthday', 'friend'));

-- As in 0025, plus the inviter's gift on an invited guest's first visit.
create or replace function visit_gifts(p_card uuid, p_venue uuid, p_staff uuid, p_branch uuid, p_first boolean)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_new    integer := 0;
  v_visits integer;
  r        vouchers;
  v_inviter uuid;
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

  -- Bring a friend: this is the first visit of a guest who joined with a member's link. That member gets each
  -- 'friend' gift once more (cycle = which friend this is for them). Not counted in v_new: it is not this guest's gift.
  if p_first then
    select c.invited_by into v_inviter from cards c where c.id = p_card;
    if v_inviter is not null and v_inviter <> p_card and exists (
         select 1 from cards k join members m on m.id = k.member_id
         where k.id = v_inviter and k.venue_id = p_venue and m.deleted_at is null) then
      for r in select * from vouchers v where v.venue_id = p_venue and v.active and v.trigger = 'friend' loop
        insert into card_vouchers (card_id, venue_id, voucher_id, cycle, issued_by, issued_branch, expires_at)
        values (v_inviter, p_venue, r.id,
                (select count(*) + 1 from card_vouchers x where x.card_id = v_inviter and x.voucher_id = r.id),
                p_staff, p_branch,
                case when r.valid_days is null then null else now() + make_interval(days => r.valid_days) end)
        on conflict (card_id, voucher_id, cycle) do nothing;
        if found then
          insert into audit_log (venue_id, branch_id, actor, action, detail)
          values (p_venue, p_branch, coalesce(p_staff::text, 'pos'), 'friend_gift', jsonb_build_object('card', v_inviter, 'friend', p_card));
        end if;
      end loop;
    end if;
  end if;
  return v_new;
end $$;
