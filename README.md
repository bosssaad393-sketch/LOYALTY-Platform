# LOYALTY rewards: white-label

A loyalty-card platform any business can run under its own name: a Wallet card for guests (Apple Wallet and Google Wallet, nothing to install), a staff app for the till, and an owner dashboard. Built by LOYALTY, the digital partner for businesses in Bahrain (websites, apps, loyalty software and more).

This folder is the **white-label copy** of the platform first built for KAYA. Same back end, same code, same developers. Everything that was KAYA-specific is now a setting, so a new client is **a few commands and an afternoon of branding, not a rebuild.**

> The KAYA project itself is separate and untouched: `workspace/loyalty-repo` (GitHub: Monaim-eng/loyalty). Nothing here connects to KAYA's database, keys or hosting. See `docs/UPSTREAM.md`.

## What a client gets
| Face | What it is |
|---|---|
| Guest card | Scan a QR, join, get a card in Apple or Google Wallet. Points update by themselves. A web version of the card too. |
| Staff app | Installable web app (PWA). Find a guest, add points from the bill, give a reward, undo within 10 minutes. |
| Owner app | Overview and chart, guests (search, CSV, erase), rules, offers pushed to Wallet cards, team, privacy and terms. |

## How branding works
One deployment = one client. The client's identity comes from environment variables (`web/.env.example`) and a folder of pictures:

| What | Where |
|---|---|
| Name, colours, "Powered by" line | `BRAND_NAME`, `BRAND_BG`, `BRAND_TEXT`, `BRAND_ACCENT`, `BRAND_POWERED_BY` |
| Logo mark, card textures, Apple Wallet images | `web/public/venues/<slug>/` and `web/passes/<slug>/` |
| The venue row (name, points rule, reward) | `supabase/seeds/<slug>.sql` |

The colour system derives every shade from three colours (background, text, accent), see `web/src/lib/brand.ts`. With no settings the app looks like the template: warm black and gold.

## Start a new client in five minutes
```bash
cd web
node scripts/new-client.mjs --name "Acme Cafe" --slug acme --accent "#3fa7a0" --bg "#0f1a1c" --text "#e8f1f0" --logo ../acme-logo.png
```
It writes all pictures, the SQL row and prints the settings to paste. The full checklist (own database, hosting, Wallet accounts, staff logins, handover) is `docs/NEW-CLIENT.md`.

## Run it locally
```bash
cd web
cp .env.example .env.local     # fill in the client's OWN values
npm run dev                    # http://localhost:3000/join/<slug>
```
No database yet? `LOYALTY_FAKE_DB=1 npm run dev` runs the screens on in-memory data (development only). Owner screens: `/owner?mock=1`.

Checks before every commit (all must pass): `npm run lint`, `npx tsc --noEmit`, `npm test` (265 tests).

## Folders
- `web/` the app (Next.js, TypeScript). `web/scripts/new-client.mjs` the client generator.
- `supabase/migrations/` the database (run in order on each client's own project). `supabase/seeds/` one venue row per client.
- `design/templates/` clickable HTML prototypes of every screen, `design/DESIGN-GUIDE.md` the look.
- `docs/` API contract, new-client guide, upstream notes, quotation template.

## Rules that never change
1. **One database per client.** Never put two clients' guests in one project, and never reuse the KAYA keys.
2. No secrets in the repo. No real guest data in tests, screenshots or prompts.
3. Points are a ledger (never edited directly) and covered by tests: do not weaken them.
4. Bahrain PDPL: consent, a real "delete my data", the client owns its guests' data.
5. Never invent a client's facts (prices, hours, offers). Unknown stays blank.
