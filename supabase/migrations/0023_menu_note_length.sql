-- Menu descriptions up to 400 characters (was 200): a sharing platter lists everything on it, and the owner's own
-- wording is kept whole rather than cut. Safe to run again.
alter table menu_items drop constraint if exists menu_items_note_en_check;
alter table menu_items drop constraint if exists menu_items_note_ar_check;
alter table menu_items add constraint menu_items_note_en_check check (note_en is null or length(note_en) <= 400);
alter table menu_items add constraint menu_items_note_ar_check check (note_ar is null or length(note_ar) <= 400);
