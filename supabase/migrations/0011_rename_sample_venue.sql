-- 0011: the sample venue from 0001 is now called Orbyn, slug orbyn. Run together with 0010 on the client's OWN project, after a backup.
-- Only touches that one row. A real client's venue has its own slug and is not affected.
update venues
set slug = 'orbyn',
    name = 'Orbyn',
    reward_text = replace(reward_text, 'Demo Venue', 'Orbyn')
where slug = 'demo'
  and not exists (select 1 from venues where slug = 'orbyn');
