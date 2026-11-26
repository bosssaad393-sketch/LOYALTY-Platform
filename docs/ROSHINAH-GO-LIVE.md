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
1. New Supabase project for Al Roshinah only. Run migrations 0001 to 0031 in order, then `supabase/seeds/roshinah.sql` and `supabase/seeds/roshinah-menu.sql`.
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
- To go live with real guests, in this order: (1) a Supabase project for Al Roshinah, migrations 0001 to 0031, then the two seeds; (2) in Vercel: remove `ORBYN_DEMO` and the three `SAMPLE_*` settings, add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STAFF_SESSION_SECRET`, `CRON_SECRET` and the five `APPLE_*` settings (Saad pastes these himself); (3) redeploy; (4) developer login, owner PIN, till PINs with their branch. `PUBLIC_BASE_URL` is already `https://roshinah.orbyn.co`: keep it, Wallet cards call this address for life.

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

## Eight additions (2026-11-26, afternoon)
Built one at a time, each with tests, each on the hosted sample. Every one is the owner's choice: nothing below changes how the restaurant works until it is switched on or a gift is added.

| # | What | Where the owner finds it | Migration | Starts |
|---|---|---|---|---|
| 1 | **Gift rules**: a gift on a chosen visit (the 5th, the 10th: a ladder, and the guest's card says how many visits are left) and a birthday gift every year | Gifts > Add a gift > When it unlocks | 0025 | when a gift is added |
| 2 | **What members order**: bills, total and average over 30 days, dishes ordered most, biggest spenders over 90 days and which of them went quiet | Overview (appears once there is a bill) | none (reads 0024) | with the first bill |
| 3 | **Offers to one group**: guests not seen for 30 days, regulars (5 visits or more), new members (joined in the last 30 days) | Offers > Who gets it | 0026 | per offer |
| 4 | **Bring a friend**: a member shares their own link; when the friend's first visit is recorded the member gets the gift, once per friend | Gifts > Bring a friend; the link is on the guest's card | 0027 | when such a gift is added |
| 5 | **Table requests**: the guest asks for a day, a time and a party size; the venue confirms or declines; the guest sees the answer on the same page | Bookings tab; "Book a table" on the guest page | 0028 | owner's switch (off) |
| 6 | **Trusted tills**: a staff PIN signs in only on a device the owner added | Team > Trusted tills | 0029 | owner's switch (off) |
| 7 | **Google Wallet card** for the visit card: visits, the gift, menu / directions / review links | automatic once a Google issuer account is set up | none | needs `GOOGLE_WALLET_*` settings |
| 8 | **Ordering from the table**: the table's code offers the menu to order from; rounds go to the staff's table board; each order is kept under the guest's card | Tables and menu (top of the page) | 0030 | owner's switch (off) |

Honest limits:
- 5: the guest gets no message when the venue answers; they see it when they open the page again (the venue can phone, the number is on the request). There is no table plan: it is a request list, not a seating system.
- 6: a device is added by signing in as the owner ON that device. A staff member already signed in elsewhere stays in until their session ends.
- 7: written and checked for shape only. Not tried against Google: there is no issuer account yet.
- 8: paying by card from the phone needs a Tap account for Al Roshinah; without one the bill is paid at the counter. The ordering page was checked on the sample in Roshinah's look, not walked through a full service.
- On the hosted sample, table requests are switched on so the page can be seen; a real venue starts with them off.
- The sample has no gift of kinds 1 and 4 seeded (inventing offers for the client is not ours to do): add one in Gifts to see them work.

## Staff alerts and calling the waiter (2026-11-26, evening; migration 0031)
- **What it does.** A guest presses "Call the waiter" or "Ask for the bill" on the table's page; the call shows on the staff's table board and the staff's phones buzz. A watch paired with a phone (Apple Watch, Samsung, Wear OS) shows the same alert, because it mirrors the phone. The same alert fires for a new order from a table and for a new table request.
- **Owner's switch:** Tables and menu > "Calling the waiter from the table" (off by default). With it off, a table's page has no call buttons and a call sent anyway is refused.
- **Each waiter, once:** open `/staff` on their phone, sign in, press "Switch alerts on" and allow notifications. On an iPhone the staff page must first be added to the Home Screen (Share > Add to Home Screen) and opened from there: that is Apple's rule for web alerts.
- **Privacy.** The alert that travels through Google's or Apple's push service carries no text at all. It wakes the phone, and the phone asks this server what is waiting with the waiter's own sign-in. A phone that is no longer signed in shows "Something needs you. Open the table board."
- **Settings.** None needed: the signing key pair is made and kept in the database the first time. `PUSH_VAPID_PUBLIC` / `PUSH_VAPID_PRIVATE` override it when set.
- **Not tested on a real phone or watch.** The server side is tested (signing, which addresses are accepted, cleaning up dead devices, the wording). Delivery through Google and Apple has not been seen working.
- **Cannot be tried on the hosted sample:** the sample keeps its data in memory per server process, so a phone's registration and the signing key do not survive between requests. It needs the real database. On this PC it can be tried in Chrome at `http://localhost:3031/staff` while the sample is running.
- **Limits:** alerts go to every phone of the venue that switched them on, not only the waiter of that table or branch. The alert is in English. Radio pager watches (table buttons with wrist pagers) are a separate thing and are not connected.

## Going live: where it stands (2026-11-26, evening)

**Done**
- The whole database is one file: `supabase/roshinah-setup.sql` (migrations 0001 to 0031, then both seeds). Rebuild it with `python web/scripts/make-roshinah-setup.py` from the repository root after any new migration.
- That exact file is run on a real Postgres engine by `web/tests/roshinahSetup.test.ts`: the business, three places, the gift and the 90-dish menu come out right; every table is locked (nothing readable with the public key); a guest is walked through a till bill, the gift at Asmak, later gifts, a table request and erasure.
- The file runs ONCE on a new, empty project. The two seeds alone are safe to run again.
- Apple Wallet: the pass certificate for `pass.co.orbyn.roshinah` (team `BT22978JVQ`) is valid until 25 December 2027 and matches its private key. On Vercel: `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_PASS_CERT` and `APPLE_WWDR_CERT` are set (identifiers and public certificates only).

**The database (done 2026-11-26, night)**
- Saad created the Supabase project `roshinah` (ref `ysxkmpzyrojjhothohdt`, Frankfurt, organization `loyalty-platform`, free plan).
- Migrations 0001 to 0031 were applied to it one by one (each is in its migration history under its own name), then both seeds. Nothing failed.
- Checked against the tested copy (the setup file run on PGlite), by fingerprint: the 37 tables and 353 columns, 230 rules, 102 indexes and the bodies of all 19 functions are identical; so are the business, the three places, the gift, the two notices and all 90 dishes with their prices. Every table is locked, there are no policies, and no function of ours can be called with the public keys.
- A walk-through on the real database, undone afterwards (nothing was kept): a till bill counted the visit, kept its two dishes and unlocked the gift; the same bill again changed nothing; the gift was refused at Sanad, used at Asmak, refused a second time; a scan the same evening was refused.
- `SUPABASE_URL` is set on Vercel (production). The site still runs on sample data until step 2 below.
- Known and left as they are: the sample venue `orbyn` from migration 0001 is in this database too (as in the tested file); Supabase's own `rls_auto_enable` function is theirs, not ours; `stamp_due` has no fixed search path (it is not used by a visit card).

**Switched to the real database (2026-11-26, night)**
- Saad pasted the four secrets into Vercel (production, sensitive): `SUPABASE_SERVICE_ROLE_KEY`, `STAFF_SESSION_SECRET`, `CRON_SECRET`, `APPLE_PASS_KEY`.
- `ORBYN_DEMO` is `0` for production (and `1` for preview builds, which have no secrets and so stay on invented data). `TAP_FAKE` is `0`. The `SAMPLE_*` rows are still listed on Vercel: they are read only in sample mode, so they do nothing now and can be deleted by hand.
- The venue's Instagram link, which the sample took from `SAMPLE_INSTAGRAM_URL`, is now in the venue's row. Address, phone and menu link were already in the Sanad branch row.
- Production redeployed from `agent/roshinah` (commit `c705e72`). Checked on https://roshinah.orbyn.co without signing in: the pages open, the sample note and sample passcodes are gone, the guest page shows the phone and Instagram from the database, `/menu/roshinah` shows the real dishes, and the owner, staff and daily-job routes refuse a caller who is not signed in.
- Nobody can sign in yet: there is no developer login, no owner and no till. That is step 1 below.

**Left, in order**
1. Supabase > Authentication > Users > Add user: the developer login (Saad's own email and a password he chooses). Then link it as the venue's developer, set the owner's passcode, and one passcode per till with its branch (`docs/NEW-CLIENT.md`).
2. First test on real phones, before any guest: join, add to Apple Wallet, a staff scan, the gift appears, use it at the Asmak till, a second use is refused; stand near the branch for the lock screen; switch alerts on and call the waiter from a table.
3. Still from the owner: the map link and Google review link for Sanad, the voucher terms, the menu prices check, the vector logo.
