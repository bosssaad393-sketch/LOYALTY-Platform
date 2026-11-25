# Al Roshinah: go-live steps

Branch `agent/roshinah`. One business (`roshinah`), branches Sanad (live first), Zallaq Springs (switched off until it opens on the card), partner counter Asmak Al Roshinah (redeems vouchers only). Nothing below has been run: every step that touches an account needs Saad's yes.

## What is built
- Migration `0022_branches_visits_vouchers.sql`: branches, staff tied to a branch, visit card (no points), vouchers unlocked by a staff scan and redeemed once, automatic birthday and "we miss you" notices.
- Seed `supabase/seeds/roshinah.sql`: the venue, the three places, the 50% Asmak voucher (first visit, Asmak only, no expiry set), the two notices.
- Join page fields: name, mobile, email, date of birth (optional).
- Apple Wallet card: visits, the gift when ready, menu / directions / Google review on the back, comes up on the lock screen within 100 m of a branch that has a map pin.
- Daily job `/api/cron/daily` (09:00 Bahrain, `vercel.json`): off until `CRON_SECRET` is set.

## Two ways to run it
**A. Demo (no database, nothing real).** A Vercel project with `ORBYN_DEMO=1`, `SAMPLE_CARD_MODE=visits`, `SAMPLE_BRANCHES=Sanad,Zallaq Springs`, `SAMPLE_PARTNER=Asmak Al Roshinah`, `LOGIN_MODE=pin`, a random `STAFF_SESSION_SECRET` and the `BRAND_*` lines. Invented guests, data is lost on restart, no Wallet updates. Good for showing the owner.

**B. Live (the real thing).**
1. New Supabase project for Al Roshinah only. Run migrations 0001 to 0022 in order, then `supabase/seeds/roshinah.sql`.
2. New Vercel project from this repo, root `web`, with:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STAFF_SESSION_SECRET`, `PUBLIC_BASE_URL`, `LOGIN_MODE=pin`, `CRON_SECRET`,
   `BRAND_NAME=Al Roshinah`, `BRAND_DEFAULT_VENUE=roshinah`, `BRAND_BG=#013220`, `BRAND_TEXT=#faf8f3`, `BRAND_ACCENT=#c9a96e`, `BRAND_LANGUAGES=en,ar`, `BRAND_OFFERS_BOX=unticked` (Saad, 2026-11-25: the offers box starts empty on the Roshinah join page),
   and the Apple settings `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_PASS_CERT`, `APPLE_PASS_KEY`, `APPLE_WWDR_CERT` (Saad pastes these himself; never in chat or in the repo).
3. Developer login, then the owner PIN, then one PIN per till. Give each till its branch (`staff_users.branch_id`): Sanad tills = Sanad, the Asmak till = Asmak.
4. In the owner dashboard: map pin (latitude, longitude) and Google review link for Sanad.
5. Test with the owner's inner circle on real iPhones: join, add to Wallet, staff scan, the gift appears, redeem at the Asmak till, a second redeem is refused.

## Still needed from the owner or Saad
- The clean logo file (vector). The card art and crest are placeholders until then.
- Voucher terms: how long it lasts, dine-in only, one bill, any cap.
- Sanad's Google Maps pin and its Google review link.
- Who holds the tills at Sanad and at Asmak.
- A native Arabic reviewer for the new Arabic lines.
- Invo: a contact or API documents (menu sync is not started).

## Known limits
- Undoing a visit does not lower the visit count (a visit carries 0 points, and the old undo rule only counts back entries with points). A voucher unlocked by mistake is cancelled by the owner instead.
- The lock-screen location only works for guests who hold the card. Nobody else can be notified by location.
- Google Wallet for the visit card is not adapted yet (Apple first, as agreed).

## Found while testing (2026-11-25)
- In a local `.env.local` file the colour lines must be quoted (`BRAND_BG="#013220"`): without quotes everything after `#` is read as a comment and the green never applies. Vercel's settings screen takes the value as typed; check the colour on the first deploy.
- Roshinah also uses `BRAND_FONT=baskerville`, `BRAND_FINISH=matte`, `BRAND_MARK=type` (remove `BRAND_MARK` once the real logo files are in).
- Local preview from this worktree: `npx next dev --webpack -p 3031` (the default bundler fails here because `node_modules` is a link to the main checkout).
- `next dev` prints a notice recommending a Next.js upgrade. Not acted on: upgrading needs Saad's yes.
- Reviewed and tested: `docs/SECURITY-REVIEW-2026-11-25.md`, `web/tests/visitFlow.test.ts` (the whole journey), `web/tests/visitsVouchers.test.ts` (the database rules).
