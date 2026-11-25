-- Branches, visit cards, one-time vouchers and automatic notices (migration 0022, 2026-11-25, first used by Al Roshinah)
--
-- * A venue is ONE business with ONE loyalty card. It can now have several BRANCHES (Sanad, Zallaq, ...).
--   Guests and cards belong to the business; staff, scans and vouchers know which branch they happened at.
--   A branch of kind 'partner' is a counter that only REDEEMS vouchers (e.g. a sister restaurant): no visits there.
-- * card_mode 'visits': the card has no points and no stamps. Staff scan the card once per paid visit (ledger_visit).
-- * Vouchers: a voucher the venue defines can be unlocked on a card by a staff scan (trigger 'first_visit' or
--   'every_visit') or by the owner ('manual'). Each guest gets a given voucher ONCE and it is redeemed ONCE
--   (voucher_redeem), optionally only at one branch.
-- * Automatic notices: birthday and "we miss you" (no visit for N days). message_log keeps one row per card, kind
--   and period, so a notice is never sent twice.
-- Venues without branches and with card_mode null behave exactly as before.

-- Branches ------------------------------------------------------------------------------------
create table if not exists branches (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  slug       text not null check (slug ~ '^[a-z0-9-]{1,40}$'),
  name       text not null check (length(name) between 1 and 80),
  name_ar    text,
  kind       text not null default 'branch' check (kind in ('branch', 'partner')),
  address    text,
  phone      text,
  maps_url   text,
  review_url text,   -- Google review link of this branch: shown to every guest, never rewarded, never gated
  menu_url   text,
  lat        double precision check (lat is null or lat between -90 and 90),
  lng        double precision check (lng is null or lng between -180 and 180),
  sort       integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (venue_id, slug)
);
create index if not exists branches_venue_idx on branches(venue_id, sort);
alter table branches enable row level security;

-- null branch = may work at every branch (owner, manager, developer; staff of a venue with no branches).
alter table staff_users add column if not exists branch_id uuid references branches(id) on delete set null;
alter table ledger      add column if not exists branch_id uuid references branches(id) on delete set null;
alter table audit_log   add column if not exists branch_id uuid references branches(id) on delete set null;
alter table cards       add column if not exists joined_branch uuid references branches(id) on delete set null;
create index if not exists ledger_branch_idx on ledger(branch_id, created_at desc);

-- Guest details -------------------------------------------------------------------------------
-- Birthday is optional. Only day and month are needed for the birthday notice; the year is kept when given.
alter table members add column if not exists birth_day   smallint check (birth_day is null or birth_day between 1 and 31);
alter table members add column if not exists birth_month smallint check (birth_month is null or birth_month between 1 and 12);
alter table members add column if not exists birth_year  smallint check (birth_year is null or birth_year between 1900 and 2100);
create index if not exists members_birthday_idx on members(birth_month, birth_day) where birth_month is not null;

-- Venue settings ------------------------------------------------------------------------------
alter table venues add column if not exists card_mode text check (card_mode is null or card_mode in ('visits'));
-- Which fields the join page asks for besides the name: any of mobile, email, birthday. Empty/null = mobile only.
alter table venues add column if not exists join_fields text[];
-- A second scan of the same card inside this many minutes is refused (one visit per sitting).
alter table venues add column if not exists visit_gap_minutes integer not null default 180 check (visit_gap_minutes between 1 and 1440);
-- Fraud guard: one staff member cannot record more visits than this in 24 hours.
alter table venues add column if not exists visit_cap_per_staff integer not null default 250 check (visit_cap_per_staff between 1 and 5000);

-- Vouchers ------------------------------------------------------------------------------------
create table if not exists vouchers (
  id               uuid primary key default gen_random_uuid(),
  venue_id         uuid not null references venues(id) on delete cascade,
  title            text not null check (length(title) between 1 and 80),
  title_ar         text,
  detail           text check (detail is null or length(detail) <= 300),
  detail_ar        text,
  trigger          text not null default 'first_visit' check (trigger in ('first_visit', 'every_visit', 'manual')),
  redeem_branch_id uuid references branches(id) on delete set null,   -- null = any branch of the venue
  valid_days       integer check (valid_days is null or valid_days between 1 and 730),
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);
create index if not exists vouchers_venue_idx on vouchers(venue_id) where active;
alter table vouchers enable row level security;

create table if not exists card_vouchers (
  id              uuid primary key default gen_random_uuid(),
  card_id         uuid not null references cards(id) on delete cascade,
  venue_id        uuid not null references venues(id) on delete cascade,
  voucher_id      uuid not null references vouchers(id) on delete cascade,
  status          text not null default 'issued' check (status in ('issued', 'redeemed', 'void')),
  issued_at       timestamptz not null default now(),
  issued_by       uuid references staff_users(id),
  issued_branch   uuid references branches(id) on delete set null,
  expires_at      timestamptz,
  redeemed_at     timestamptz,
  redeemed_by     uuid references staff_users(id),
  redeemed_branch uuid references branches(id) on delete set null,
  voided_at       timestamptz,
  voided_by       uuid references staff_users(id),
  -- One of each voucher per guest, ever: this is what makes "redeemable once" hold even under double taps.
  unique (card_id, voucher_id)
);
create index if not exists card_vouchers_card_idx on card_vouchers(card_id);
create index if not exists card_vouchers_venue_idx on card_vouchers(venue_id, status, issued_at desc);
alter table card_vouchers enable row level security;

-- Automatic notices ---------------------------------------------------------------------------
create table if not exists auto_messages (
  venue_id uuid not null references venues(id) on delete cascade,
  kind     text not null check (kind in ('birthday', 'winback')),
  enabled  boolean not null default true,
  text_en  text not null check (length(text_en) between 1 and 200),
  text_ar  text check (text_ar is null or length(text_ar) <= 200),
  days     integer not null default 14 check (days between 1 and 365),  -- winback: days without a visit
  primary key (venue_id, kind)
);
alter table auto_messages enable row level security;

create table if not exists message_log (
  id       bigint generated always as identity primary key,
  card_id  uuid not null references cards(id) on delete cascade,
  venue_id uuid not null references venues(id) on delete cascade,
  kind     text not null check (kind in ('birthday', 'winback')),
  period   text not null,           -- birthday: the year; winback: the date of the last visit it answers
  message  text not null,
  sent_at  timestamptz not null default now(),
  unique (card_id, kind, period)
);
create index if not exists message_log_card_idx on message_log(card_id, sent_at desc);
alter table message_log enable row level security;

-- Record a visit ------------------------------------------------------------------------------
-- One row in the ledger (kind earn, 0 points: the trigger from 0001 counts the visit and sets last_visit), and any
-- voucher the visit unlocks. Everything is checked here, so no screen can skip a rule.
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
  r        vouchers;
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

  for r in select * from vouchers v where v.venue_id = v_card.venue_id and v.active
             and (v.trigger = 'every_visit' or (v.trigger = 'first_visit' and v_first)) loop
    insert into card_vouchers (card_id, venue_id, voucher_id, issued_by, issued_branch, expires_at)
    values (v_card.id, v_card.venue_id, r.id, p_staff, p_branch,
            case when r.valid_days is null then null else now() + make_interval(days => r.valid_days) end)
    on conflict (card_id, voucher_id) do nothing;
    if found then v_new := v_new + 1; end if;
  end loop;

  insert into audit_log (venue_id, branch_id, actor, action, detail)
  values (v_card.venue_id, p_branch, p_staff::text, 'visit',
          jsonb_build_object('card', v_card.id, 'ledger', v_id, 'vouchers_issued', v_new));

  return query select v_id, (select c.visits from cards c where c.id = p_card), v_new;
end $$;

-- Redeem a voucher (once) ---------------------------------------------------------------------
create or replace function voucher_redeem(p_card_voucher uuid, p_staff uuid, p_branch uuid)
returns table (card_voucher_id uuid, redeemed_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_cv      card_vouchers;
  v_voucher vouchers;
  v_staff   staff_users;
  v_now     timestamptz := now();
begin
  select * into v_cv from card_vouchers where id = p_card_voucher for update;
  if not found then raise exception 'voucher not found'; end if;
  select * into v_voucher from vouchers where id = v_cv.voucher_id;
  select * into v_staff from staff_users where id = p_staff and active;
  if not found or v_staff.venue_id <> v_cv.venue_id then
    raise exception 'staff member is not allowed at this venue';
  end if;
  if p_branch is not null and not exists (select 1 from branches b where b.id = p_branch and b.venue_id = v_cv.venue_id and b.active) then
    raise exception 'branch not found';
  end if;
  if v_staff.branch_id is not null and v_staff.branch_id is distinct from p_branch then
    raise exception 'staff member is not allowed at this branch';
  end if;
  -- Fraud guard, like visits: one person cannot use up more vouchers in 24 hours than the venue's daily scan limit.
  if (select count(*) from card_vouchers x where x.redeemed_by = p_staff and x.redeemed_at > v_now - interval '24 hours')
       >= (select visit_cap_per_staff from venues where id = v_cv.venue_id) then
    raise exception 'daily scan limit reached';
  end if;
  if v_cv.status = 'redeemed' then raise exception 'voucher already used'; end if;
  if v_cv.status <> 'issued' then raise exception 'voucher is not valid'; end if;
  if v_cv.expires_at is not null and v_cv.expires_at < v_now then raise exception 'voucher has expired'; end if;
  if v_voucher.redeem_branch_id is not null and v_voucher.redeem_branch_id is distinct from p_branch then
    raise exception 'voucher cannot be used at this branch';
  end if;

  update card_vouchers set status = 'redeemed', redeemed_at = v_now, redeemed_by = p_staff, redeemed_branch = p_branch
  where id = v_cv.id;

  insert into audit_log (venue_id, branch_id, actor, action, detail)
  values (v_cv.venue_id, p_branch, p_staff::text, 'voucher_redeem',
          jsonb_build_object('card', v_cv.card_id, 'card_voucher', v_cv.id, 'voucher', v_cv.voucher_id));

  return query select v_cv.id, v_now;
end $$;

-- Owner cancels a voucher that was unlocked by mistake -------------------------------------------
create or replace function voucher_void(p_card_voucher uuid, p_staff uuid)
returns table (card_voucher_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_cv    card_vouchers;
  v_staff staff_users;
begin
  select * into v_cv from card_vouchers where id = p_card_voucher for update;
  if not found then raise exception 'voucher not found'; end if;
  select * into v_staff from staff_users where id = p_staff and active;
  if not found or v_staff.venue_id <> v_cv.venue_id or v_staff.role not in ('owner', 'manager') then
    raise exception 'only the owner or a manager can cancel a voucher';
  end if;
  if v_cv.status <> 'issued' then raise exception 'voucher is not valid'; end if;
  update card_vouchers set status = 'void', voided_at = now(), voided_by = p_staff where id = v_cv.id;
  insert into audit_log (venue_id, actor, action, detail)
  values (v_cv.venue_id, p_staff::text, 'voucher_void', jsonb_build_object('card', v_cv.card_id, 'card_voucher', v_cv.id));
  return query select v_cv.id;
end $$;

revoke all on function ledger_visit(uuid, uuid, uuid)   from public, anon, authenticated;
revoke all on function voucher_redeem(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function voucher_void(uuid, uuid)         from public, anon, authenticated;
grant execute on function ledger_visit(uuid, uuid, uuid)   to service_role;
grant execute on function voucher_redeem(uuid, uuid, uuid) to service_role;
grant execute on function voucher_void(uuid, uuid)         to service_role;
