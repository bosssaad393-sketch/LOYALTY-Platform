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
1. New Supabase project for Al Roshinah only. Run migrations 0001 to 0024 in order, then `supabase/seeds/roshinah.sql` and `supabase/seeds/roshinah-menu.sql`.
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
- Roshinah also uses `BRAND_FONT=cinzel` (Cinzel capitals for headings and figures, picked by Saad from eight options on 2026-11-25; Hanken Grotesk text; Noto Kufi Arabic and Noto Sans Arabic), `BRAND_FINISH=matte`, `BRAND_MARK=type` (remove `BRAND_MARK` once the real logo files are in).
- Local preview from this worktree: `npx next dev --webpack -p 3031` (the default bundler fails here because `node_modules` is a link to the main checkout).
- `next dev` prints a notice recommending a Next.js upgrade. Not acted on: upgrading needs Saad's yes.
- Reviewed and tested: `docs/SECURITY-REVIEW-2026-11-25.md`, `web/tests/visitFlow.test.ts` (the whole journey), `web/tests/visitsVouchers.test.ts` (the database rules).

## Hosted (2026-11-25)
- Vercel project `roshinah` (team LOYALTY), root `web`, Node 22, built from branch `agent/roshinah` of `bosssaad393-sketch/LOYALTY-Platform`. Address: **https://roshinah.orbyn.co** (also `roshinah-loyalty-0c1d.vercel.app`).
- It runs on SAMPLE data (`ORBYN_DEMO=1`): invented guests, kept in memory, lost on restart, no Wallet card, no automatic notices. For showing the owner only. Sample PINs are on the sign-in screens.
- The project's production branch is still `main` in Vercel's settings: a push to `main` would deploy `main`'s older code here. Deploy this project from `agent/roshinah` until the branch is merged.
- To go live with real guests, in this order: (1) a Supabase project for Al Roshinah, migrations 0001 to 0024, then the two seeds; (2) in Vercel: remove `ORBYN_DEMO` and the three `SAMPLE_*` settings, add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STAFF_SESSION_SECRET`, `CRON_SECRET` and the five `APPLE_*` settings (Saad pastes these himself); (3) redeploy; (4) developer login, owner PIN, till PINs with their branch. `PUBLIC_BASE_URL` is already `https://roshinah.orbyn.co`: keep it, Wallet cards call this address for life.

## Glass look (2026-11-25)
- `BRAND_FINISH=glass`: frosted glass panels, a round-key passcode screen and glass dashboards over a background picture (`web/src/app/glass.css`). The matte finish's quiet rules stay underneath.
- The two pictures (`web/public/venues/roshinah/glass-portrait.webp`, `glass-wide.webp`) were made on Higgsfield for this client: a deep green plaster wall with morning palm-leaf shadows, no people, no text. Cost 8 credits; balance after about 258 (floor 155).
- Phones that cannot blur, and people who ask their phone for less transparency, get solid panes.

## Back end round (2026-11-26)
- **Owner and staff sign-in** on the glass finish now follows the lounge sign-in Saad asked for (dark ground, drifting web, spheres, their logo, a raised keypad sheet with square keys, one wide button), drawn from the brand colours. `web/src/app/glass.css`, last section.
- **What each guest ordered** (migration `0024_receipts_wide_reach.sql`): the till sends each paid bill with the guest's 4-digit code and, if it can, the dishes (`docs/POS.md`). The owner sees it under **Guests > Orders**: every bill, the total spent, and what the guest orders most. For a visit card the bill also counts the visit and unlocks gifts, so the cashier types the code once and does not scan. Nothing reaches this screen until a till is connected (or guests order from the table code, which is not switched on for Roshinah). The hosted sample shows invented bills built from their own menu.
- **Invo:** no public API or developer page was found (searched 2026-11-26). Somebody has to ask Invo whether it can send each paid bill to a web address, or give API access. The till key is made in `/dev` > Till. Until Invo answers, visits are recorded by the staff scan as before.
- **Card on the lock screen:** Apple shows a loyalty card within about 100 m of a pinned place and a pass cannot ask for more (their words: "on the order of a hundred meters", "an implementation detail"). It is passive: the card appears on the lock screen, the phone does not ring. New per branch: **Wider area**, which spends the pass's spare location points (Apple allows ten) on a ring of 4 to 6 points around the branch, so the card comes up from about 240 to 270 m. Not tested on a real iPhone yet: check it in the first on-site test, standing 200 m away with the screen woken.
- **Map pin:** the owner pastes the branch's Google Maps link and saves; the server reads the pin from the link (short share links are followed, to Google's own maps addresses only). The two numbers can still be typed when that fails. Not tried with a real share link from the owner yet.
- **Owner screens for a visit card:** no points wording left (data export, erase texts, the offer example); "Tables and menu" opens on the menu and leaves out the wait-and-sales report, which would stay empty; the activity log names "The till"; the sample's top guests are in the right order.
