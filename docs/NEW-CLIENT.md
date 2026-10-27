# New client checklist

For Saad and Monaim (and their Claudes). One client = one folder of branding, one Supabase project, one Vercel project. Tick as you go.

## 0. Before you start
- [ ] Client's name, logo (PNG or SVG, ideally 1000 px+), brand colours, Instagram. **Never** reuse another client's logo or photos.
- [ ] A short chat with the owner: points per BHD, the reward goal, what the reward is, who will be the owner login. Unknown = leave it, ask.
- [ ] A quote: `docs/templates/quotation-template.html` (fill the `{{...}}` parts; prices are yours to set).

## 1. Brand it (about 10 minutes)
```bash
cd web
node scripts/new-client.mjs --name "Acme Cafe" --slug acme --accent "#3fa7a0" --bg "#0f1a1c" --text "#e8f1f0" --logo path/to/logo.png --main
```
- `--slug`: lowercase letters, digits, dashes. It is the guest link: `/join/acme`.
- `--main`: also writes the home-screen icons (do this once per deployment, for the deployment's main client).
- `--force` overwrites files that exist. Without it, existing files are kept.
- Colours: three only. Background should be dark, text light (the template look). Check contrast: text on background, and the dark gold-button text on the accent.
- It writes `public/venues/<slug>/`, `passes/<slug>/` and `supabase/seeds/<slug>.sql`, and prints the `BRAND_*` settings.
- The pictures are **placeholders** (a monogram, a calm velvet background). Replace `marble.jpg` / `texture.jpg` and the pass `strip` / `artwork` with the client's real photography before launch. Keep the sizes (see `scripts/new-client.mjs`).

## 2. A database of their own
- [ ] New Supabase project (free tier is fine to start). Choose the region on purpose (PDPL: where do guests' details live?).
- [ ] SQL editor: run `supabase/migrations/0001` to the newest, in order.
- [ ] Run `supabase/seeds/<slug>.sql`. Remove the `demo` venue if you do not want it (`delete from venues where slug = 'demo';`).
- [ ] Project settings, API: copy the URL and the `service_role` key into the Vercel settings only (never the repo, a chat or a screenshot).

## 3. Hosting
- [ ] New Vercel project from this repo, root folder `web`. Add the settings from `web/.env.example`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STAFF_SESSION_SECRET` (32+ random characters), `PUBLIC_BASE_URL`, and all `BRAND_*`.
- [ ] Deploy, then check: `/join/<slug>`, `/staff`, `/owner`, and that the page title and colours are the client's.
- [ ] A domain for the client (e.g. `rewards.theirname.com`) when they have one.

## 4. Logins
- [ ] Create the owner login in the client's own project (hash and insert as the existing staff table expects; see the migrations and `web/src/lib/staffAuth.ts`). Use a strong password, give it to the owner privately, ask them to change it.
- [ ] The owner creates the team in the Owner app (Team tab). No shared PINs.

## 5. Wallets (the long pole: start early)
- [ ] **Google Wallet:** a Google Pay and Wallet Console issuer account, a service account, then `GOOGLE_WALLET_ISSUER_ID` and the service-account JSON. Free.
- [ ] **Apple Wallet:** Apple Developer account (US$99 a year), a Pass Type ID, the pass certificate, the WWDR certificate, `APPLE_*` settings. **Open question:** Apple ties a Pass Type ID to the account holder's own brand (a limited service-provider exception exists). Check the agreement, or give the client its own Pass Type ID. Decide who holds the account in writing.
- [ ] Use Apple's official "Add to Apple Wallet" badge, not a custom button.
- Until the accounts exist, the card page still works on the web and the buttons say "coming soon".

## 6. Test like a guest (real phones, invented data only)
- [ ] Join at `/join/<slug>` on an iPhone and an Android phone. Card appears, QR scans.
- [ ] Staff login: find the card, add points, redeem, undo. Points appear on the card within a minute.
- [ ] Owner login: numbers, guests, rules, send an offer, withdraw it, export, erase.
- [ ] Arabic (if the client wants it): machine-written text needs a native reviewer first.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` all pass.

## 7. Legal and privacy
- [ ] Terms and Conditions: the built-in text is a draft. The client (or a lawyer) approves the final wording; the owner can edit it in the app.
- [ ] Privacy: consent box on, "delete my data" works, the client owns its guest data. Cross-border question if the database is outside Bahrain.

## 8. Handover
- [ ] Owner shown how to: add team, send an offer, change the rules, read the numbers, erase a guest.
- [ ] QR code for the join link printed (table tent or counter card): `https://<domain>/join/<slug>`.
- [ ] Monthly plan, support route and "how to ask for a change" agreed in writing.
- [ ] Note in the client log: slug, project names, who holds which account, renewal dates.

## Things you will want to add later (not built yet)
- A changing till code (second check at the till), see `docs/API.md`.
- POS link (needs the client's POS system), a second branch, more than one reward, Arabic strings in one place.
- Per-venue colours inside one shared deployment (today colours are per deployment).
