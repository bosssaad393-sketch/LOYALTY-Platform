-- SHOWCASE seed: invented people for the sample venue, so Saad can show a real, hosted dashboard to prospects.
-- Run AFTER migrations 0001 to 0008, in the showcase project's own Supabase. Never on a client's database.
-- Safe to run twice. PINs are not set here (they are a keyed hash made by the app): sign in at /dev, open Access, press "Give a PIN".

do $$
declare v uuid;
begin
  select id into v from venues where slug = 'orbyn';
  if v is null then raise exception 'venue orbyn not found: run the migrations first'; end if;

  update venues set name = 'Sol', reward_text = 'A dessert of your choice' where id = v;

  insert into staff_users (id, venue_id, name, role, active) values
    ('00000000-0000-4000-8000-0000000000a1', v, 'Owner', 'owner', true),
    ('00000000-0000-4000-8000-0000000000a2', v, 'Reem', 'manager', true),
    ('00000000-0000-4000-8000-0000000000a3', v, 'Ahmed', 'staff', true)
  on conflict (id) do nothing;

  insert into members (id, name, phone, consent_terms) values
    ('00000000-0000-4000-8000-0000000000d1', 'Ann Hassan', '+97300000001', now()),
    ('00000000-0000-4000-8000-0000000000d2', 'Khalid Ali', '+97300000002', now()),
    ('00000000-0000-4000-8000-0000000000d3', 'Maryam Saleh', '+97300000003', now())
  on conflict (id) do nothing;

  insert into cards (id, venue_id, member_id, code) values
    ('00000000-0000-4000-8000-0000000000c1', v, '00000000-0000-4000-8000-0000000000d1', '4821'),
    ('00000000-0000-4000-8000-0000000000c2', v, '00000000-0000-4000-8000-0000000000d2', '5555'),
    ('00000000-0000-4000-8000-0000000000c3', v, '00000000-0000-4000-8000-0000000000d3', '1357')
  on conflict (id) do nothing;

  if not exists (select 1 from ledger where note = 'showcase seed') then
    insert into ledger (card_id, venue_id, kind, points, note) values
      ('00000000-0000-4000-8000-0000000000c1', v, 'welcome', 380, 'showcase seed'),
      ('00000000-0000-4000-8000-0000000000c2', v, 'welcome', 520, 'showcase seed'),
      ('00000000-0000-4000-8000-0000000000c3', v, 'welcome', 40, 'showcase seed');
  end if;
end $$;

-- Your developer account: first create the user in Supabase (Authentication > Users > Add user), then replace YOUR-EMAIL and run:
-- insert into staff_users (auth_user, venue_id, name, role, active)
-- select u.id, (select id from venues where slug = 'orbyn'), 'Saad (developer)', 'developer', true from auth.users u where u.email = 'YOUR-EMAIL';
