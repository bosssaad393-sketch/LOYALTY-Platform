## What this changes
<!-- One or two sentences. -->

## Area
- [ ] Front end only (screens, styles, copy)
- [ ] Back end (API route, `web/src/lib`, database)
- [ ] Database migration (new file in `supabase/migrations/`)

## Checklist
- [ ] `npm run lint`, `npx tsc --noEmit` and `npm test` pass in `web/`
- [ ] No secrets, keys, passwords or real customer data in the diff
- [ ] If an endpoint changed: `docs/API.md` updated first
- [ ] If there is a migration: it is a NEW numbered file (never edit an old one), and I tested it on the dev Supabase project, not production
- [ ] I did not touch `main`, Vercel or the production database

## How I tested it
<!-- Steps, screenshots, or test names. -->
