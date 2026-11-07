-- 0016: a PIN belongs to one venue.
-- Before: PINs were unique across the whole platform and PIN sign-in searched every venue. Setting a PIN answered "taken"
-- when anyone anywhere had it, which told an owner of one venue that a PIN works somewhere, possibly at another venue,
-- and PIN sign-in would then let them in. With 4-digit staff PINs there are only about 9000 for the whole platform.
-- After: unique per venue, and sign-in always names the venue (the app sends it), so a PIN only ever opens its own venue.
-- staff_users has no deleted_at column (people are deactivated with active = false and keep their row), so the index covers
-- every row with a PIN: a deactivated person's PIN stays reserved and reactivating them cannot clash.
-- Safe on existing data: the old platform-wide unique index already guarantees per-venue uniqueness.

create unique index if not exists staff_users_pin_per_venue on staff_users (venue_id, pin_lookup) where pin_lookup is not null;
drop index if exists staff_users_pin_lookup_idx;
