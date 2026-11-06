-- Venue row for Orbyn. Run once in the Supabase SQL editor of THIS client's project.
insert into venues (slug, name, brand, points_per_bhd, reward_goal, reward_text)
values ('orbyn', 'Orbyn',
        '{"background":"#141210","label":"#cda55b","text":"#f3e9d2"}'::jsonb,
        2, 500, 'Reward chosen by Orbyn')
on conflict (slug) do update set name = excluded.name, brand = excluded.brand;
