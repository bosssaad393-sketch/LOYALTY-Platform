-- 0033: a gift can have its own photo.
--
-- vouchers.image_url: the owner's photo of the gift (uploaded from Owner > Gifts into the venue's own storage, like a
-- menu photo). While that gift is waiting on a guest's card, the photo is shown in the opening of the card's picture
-- (the niche), on the Wallet card and on the card page. Null = no photo: the niche is simply lit.
-- When the owner later swaps one gift for another, the picture on every guest's card follows.
-- Safe to run twice. Run after 0032, on the client's OWN database, after a backup.

alter table vouchers add column if not exists image_url text check (image_url is null or length(image_url) <= 600);
