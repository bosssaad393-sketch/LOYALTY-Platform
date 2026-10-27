# Rules for AI coding agents in this folder (OpenCode and any other agent)

This folder is **the new LOYALTY loyalty program**: the white-label platform for many businesses. It is the only place you work.

## Scope (hard limits)
- Work ONLY inside this folder (`workspace/loyalty-whitelabel`).
- **Do not read, edit, copy from, or run anything in `workspace/loyalty-repo`.** That is KAYA Rewards, a live client project owned by Monaim. Leave it alone completely. Never use KAYA's name, logo, photos, data, keys or URLs here.
- Do not touch anything outside this folder (no other projects, no `.env` files, no home folder, no other repositories).
- Never ask for or use real keys. No secrets in code, logs or chat. No real guest data; invented data only.

## Never without Saad's explicit yes
Push to any remote, deploy, run SQL on a database, install or upgrade dependencies, delete files you did not create, contact anyone, spend money.

## How to work
1. Read `README.md`, `docs/NEW-CLIENT.md`, `docs/UPSTREAM.md` and `web/AGENTS.md` first (the Next.js version here has breaking changes: read `web/node_modules/next/dist/docs/` before writing Next code).
2. Work on a branch named `agent/<short-task>`; never commit to `main`. Small commits, clear messages.
3. Before saying done, run in `web/`: `npm run lint`, `npm run typecheck`, `npm test`. All must pass. Add tests for new logic and for every bug you fix. Never claim a check passed unless you ran it; say what you could not verify.
4. Keep changes small and in the existing style. Tenant safety: every database read or write for a venue must filter by the signed-in person's venue on the server (see `web/tests/crossTenant.test.ts`). Do not weaken authentication, consent, delete-my-data, or the points ledger.
5. Branding stays in settings (`web/src/lib/brand.ts`, `BRAND_*`); never hard-code a client's name or colours.
6. Finish by writing a short note: what changed, files, checks run and results, risks, next step. Another engineer will review your diff before it merges.

Company rules: `../../docs/LOYALTY-RULES.md` (read it once; it applies to you too).
