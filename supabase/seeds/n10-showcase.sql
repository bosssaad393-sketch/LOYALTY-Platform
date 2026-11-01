-- Turns the showcase venue into "Nº10 by Hydur" (demo data, invented guests). Run once in the showcase project's SQL editor.
-- After it, set BRAND_DEFAULT_VENUE=n10 in the hosting settings and redeploy. Guests then join at /join/n10.
update venues
   set slug = 'n10',
       name = 'Nº10 by Hydur',
       brand = '{"background":"#0a0710","label":"#f0cf8a","text":"#f7f0e1"}'::jsonb,
       reward_text = 'A dessert of your choice'
 where slug in ('demo', 'n10');
