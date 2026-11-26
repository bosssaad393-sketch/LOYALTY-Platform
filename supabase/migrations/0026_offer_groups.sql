-- 0026: an offer for one group of guests instead of everyone who agreed.
--
-- * offers.segment: 'all' (as before), 'quiet' (visited, but not in the last 30 days), 'regulars' (5 visits or
--   more), 'new' (joined in the last 30 days).
-- * offers.target_cards: the guests in that group at the moment of sending (null = everyone who agreed). The card of
--   a guest who is not in the list never shows the offer. The list is fixed at sending time on purpose: a guest who
--   comes back the next day keeps the "we miss you" offer they were sent.
-- Safe to run twice. Run after 0025, on the client's OWN database, after a backup.

alter table offers add column if not exists segment text not null default 'all';
alter table offers drop constraint if exists offers_segment_check;
alter table offers add constraint offers_segment_check check (segment in ('all', 'quiet', 'regulars', 'new'));
alter table offers add column if not exists target_cards uuid[];
