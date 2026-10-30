-- Venue row for N10 Shisha Lounge by Hydur. Run once in the Supabase SQL editor of THIS client's project.
insert into venues (slug, name, brand, points_per_bhd, reward_goal, reward_text)
values ('n10', 'N10 Shisha Lounge by Hydur',
        '{"background":"#0a0710","label":"#f0cf8a","text":"#f7f0e1"}'::jsonb,
        2, 500, 'Reward chosen by N10 Shisha Lounge by Hydur')
on conflict (slug) do update set name = excluded.name, brand = excluded.brand;
