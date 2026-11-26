-- 0032: send a new Wallet card design to the cards guests already saved.
--
-- A saved Apple Wallet card fetches a newer version of itself from this server when it is told to look. Until now
-- "newer" for a design change was a date written in the code. venues.pass_updated_at is that date kept per business:
-- the developer screen sets it to now and wakes every phone that holds a card, and each phone then fetches the card
-- with the new picture, colours and wording. Nobody joins again and nobody adds the card again.
-- Null = no design has been sent out since the cards were made.
-- Safe to run twice. Run after 0031, on the client's OWN database, after a backup.

alter table venues add column if not exists pass_updated_at timestamptz;
