-- Venue row for Spaloon. Run once in the Supabase SQL editor of THIS client's project.
insert into venues (slug, name, brand, points_per_bhd, reward_goal, reward_text)
values ('spaloon', 'Spaloon',
        '{"background":"#0d0d0e","label":"#c9ae74","text":"#f3eddf"}'::jsonb,
        2, 500, 'Reward chosen by Spaloon')
on conflict (slug) do update set name = excluded.name, brand = excluded.brand;
