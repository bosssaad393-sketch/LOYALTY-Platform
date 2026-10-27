# Where this came from

White-label copy made on 27 Oct 2026 from `Monaim-eng/loyalty`, branch `main`, commit `93cba65` ("Add backend access guide for Saad"). That repository is the live KAYA Rewards project, owned by Monaim (back end and production). It is **not** modified by this folder.

## What was changed
- Every KAYA reference became a setting (`web/src/lib/brand.ts`, `BRAND_*` in `web/.env.example`): name, colours, "Powered by" line, venue folder.
- Colours: all hard-coded gold and warm greys in the stylesheets are now CSS variables derived from three base colours. With no settings the look is identical to the template.
- Wallet colours (Apple and Google) come from the same settings. The Google logo falls back to `<PUBLIC_BASE_URL>/venues/<slug>/crest.png`.
- Home-screen manifests (`owner.webmanifest`, `staff.webmanifest`) are generated from the settings.
- New: `web/scripts/new-client.mjs` (makes a client's pictures, SQL row and settings), `docs/NEW-CLIENT.md`.
- Removed: KAYA's pictures, Wallet artwork, logo, the KAYA venue row, meeting notes, quotations, the margin sheet, deck, and the Supabase/Google IDs that belonged to Monaim's accounts.
- Database: `0001_init.sql` seeds a `demo` venue instead of KAYA. The other migrations are unchanged.
- Tests: KAYA sample names became "Demo Venue"; `tests/brand.test.ts` added (265 tests pass).

## Using the same back end
The code in `web/src/app/api`, `web/src/lib` (ledger, Wallet, auth) and `supabase/migrations` is the same as upstream, so a fix there is a fix everywhere. To bring upstream improvements in:
1. In a clone of the upstream repo, find what changed since `93cba65` (`git log 93cba65..origin/main`).
2. Apply the same change here by hand or as a patch. Files that mention branding (`brand.ts`, `layout.tsx`, the two Wallet files, the sign-in and owner/staff apps, `globals.css`) differ on purpose: merge with care.
3. Run lint, types and tests.
Changes that start here and are useful for KAYA go back to Monaim as a pull request, never straight to `main`.

## Hard separation (do not break)
- Own Supabase project, Vercel project and Wallet identifiers **per client**. Never reuse the KAYA keys or project.
- Monaim's rules from `BACKEND-ACCESS-FOR-SAAD.md` still apply to anything that touches the live KAYA database.
- Tell Monaim this folder exists and agree how the two codebases stay in step (one shared repo with several deployments is the alternative).
