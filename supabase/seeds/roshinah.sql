-- Al Roshinah Restaurant & Cafe: one business, two branches (we start in Sanad), a visit card, and the first voucher.
-- Run ONCE in the Supabase SQL editor of THIS client's own project, after migrations 0001..0022. Safe to run again.
-- Facts below are from the client's own public pages (see docs/clients/roshinah.md in CALABOS). Unknown = left empty:
-- the map pins (lat/lng), the Google review links and the Zallaq go-live are set later in the owner dashboard.

insert into venues (slug, name, brand, points_per_bhd, reward_goal, reward_text, card_mode, join_fields)
values ('roshinah', 'Al Roshinah',
        '{"background":"#013220","label":"#C9A96E","text":"#FAF8F3"}'::jsonb,
        2, 500, 'Gifts chosen by Al Roshinah', 'visits', array['mobile','email','birthday'])
on conflict (slug) do update set name = excluded.name, brand = excluded.brand, card_mode = excluded.card_mode, join_fields = excluded.join_fields;

-- Branches. Zallaq is switched off until it goes live; Asmak Al Roshinah is a partner counter (redeems vouchers only).
insert into branches (venue_id, slug, name, name_ar, kind, address, phone, menu_url, sort, active)
select v.id, b.slug, b.name, b.name_ar, b.kind, b.address, b.phone, b.menu_url, b.sort, b.active
from venues v, (values
  ('sanad',  'Sanad',             'سند',           'branch',  'Bldg 1376w, Rd 4541, Block 745, Sanad',        '+97377909080', 'https://qr.finedinemenu.com/al-roshinah-restaurant-and-cafe/menu/64e5d573f2c374001431447a', 0, true),
  ('zallaq', 'Zallaq Springs',    'زلاق سبرينغز',  'branch',  'Shop 16, Bldg 23, Ave 55, Block 1056, Zallaq', '+97377909060', 'https://qr.finedinemenu.com/al-roshinah-restaurant-and-cafe/menu/6707a4b07533e20a76d54be9', 1, false),
  ('asmak',  'Asmak Al Roshinah', 'أسماك الروشنة', 'partner', 'Shop 143, Hala Plaza, Zinj, Manama',           '+97377909050', 'https://qr.finedinemenu.com/al-roshinah-restaurant-and-cafe/menu/68bd4cd814946c3898c2e309', 9, true)
) as b(slug, name, name_ar, kind, address, phone, menu_url, sort, active)
where v.slug = 'roshinah'
on conflict (venue_id, slug) do nothing;

-- The first gift: unlocked by the staff scan on the guest's first paid visit, used once, only at Asmak Al Roshinah.
-- valid_days is empty (no expiry) until the owner says how long it lasts.
insert into vouchers (venue_id, title, title_ar, detail, detail_ar, trigger, redeem_branch_id)
select v.id, '50% off at Asmak Al Roshinah', 'خصم ٥٠٪ في أسماك الروشنة',
       'A thank-you for joining. One visit, one bill.', 'شكراً لانضمامك. لزيارة واحدة وفاتورة واحدة.',
       'first_visit', b.id
from venues v join branches b on b.venue_id = v.id and b.slug = 'asmak'
where v.slug = 'roshinah'
  and not exists (select 1 from vouchers x where x.venue_id = v.id and x.title = '50% off at Asmak Al Roshinah');

-- Automatic notices (the owner can reword them or switch them off in the dashboard).
insert into auto_messages (venue_id, kind, enabled, text_en, text_ar, days)
select v.id, m.kind, true, m.text_en, m.text_ar, 14
from venues v, (values
  ('birthday', 'Happy birthday, {name}. Come in and celebrate with us.', 'كل عام وأنت بخير يا {name}. تفضل واحتفل معنا.'),
  ('winback',  'We have missed you, {name}. Your table is waiting.',     'اشتقنا لك يا {name}. طاولتك بانتظارك.')
) as m(kind, text_en, text_ar)
where v.slug = 'roshinah'
on conflict (venue_id, kind) do nothing;
