-- 0017: the venue's public links, shown at the foot of the guest home page.
--   * instagram_url: the venue's Instagram page.
--   * google_review_url: the "write a review" link from the venue's Google Business profile.
-- Both optional (null = the link is not shown). Set by the owner on the Rules screen. https only.
-- Safe to apply before or after the code: the home page reads these columns on their own and carries on without them.

alter table venues add column if not exists instagram_url text
  check (instagram_url is null or (length(instagram_url) <= 300 and instagram_url ~ '^https://'));
alter table venues add column if not exists google_review_url text
  check (google_review_url is null or (length(google_review_url) <= 500 and google_review_url ~ '^https://'));
