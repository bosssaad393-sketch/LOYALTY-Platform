# Owner assistant (chat)

Tab **Assistant** in the owner dashboard. The owner writes in plain words; the assistant shows the change and does it only after "yes".

## What it can do (owner only)

- Change the points per BHD ("change the points per BHD to 3").
- Change the reward ("change the reward to a free dessert at 300 points").
- Send a notification to all guests ("send a notification saying ...").
- Add or remove points for one guest (up to 1000 at a time, reason kept in the audit log).

Every change is shown first and waits up to 10 minutes for a yes. A new request cancels an older waiting one.

## What it never says

Anything it cannot or may not do (unsupported, a manager asking for an owner-only change, more than 1000 points, a failed action) is answered with: "Thanks, I've passed your request to our development team..." The request is stored and appears in the owner's **Requests with our team** list and in the developer inbox at `/dev`. The owner never sees "error" or "no permission".

## Design

- Rule-based reader (`web/src/lib/assistant/parse.ts`) behind a `Planner` interface, so a language model can replace it later without changing the safety steps.
- Safety steps (`service.ts`) do not depend on the reader: owner only, venue from the session, confirm-before-change, atomic claim of the pending row, audit log.
- Needs migration `0005_owner_assistant.sql`. Not yet run against a real Postgres.
- Arabic is not supported yet.

## AI mode (added 27 Oct 2026)

A language model reads free wording and proposes the action (`web/src/lib/assistant/llmPlanner.ts`). Switch on with `ASSISTANT_LLM_MODEL` (and `ASSISTANT_LLM_URL`, optional `ASSISTANT_LLM_KEY`) in `web/.env.local`; empty = the rule-based reader.
- The model only proposes. Its JSON is checked against a strict schema, then the same owner-only, confirm-first, audit steps apply. Yes/no/cancel are always decided by rules, never the model.
- Bad, out-of-range or hostile output, a slow model or no model: falls back to the rule-based reader.
- Only the owner's own text is sent to the model (no guest data).
- Tested live against local Ollama llama3.1:8b (0.2-1 s per message). A client's hosted site cannot reach a model on the PC: for production point `ASSISTANT_LLM_URL` at a hosted endpoint and check where the owner's text goes.
- `/api/owner/assistant-preview` (development only, 404 in production) feeds the sample screen `/owner?mock=1`.

## PIN sign-in, staff rewards, dashboards (27 Oct 2026)

- **PIN sign-in** for staff, managers and owners (`/api/staff/pin-login`, migration `0008_pin_login.sql`). No email or password. Staff 4+ digits, managers and owners 6+ digits, easy PINs refused. Only a keyed hash (HMAC, server secret) is stored, so a leaked database does not give the PINs. 5 wrong tries lock a caller for 10 minutes and 30 wrong tries overall pause everyone (counted in the database, works across server instances). Developers keep email + password. PINs are unique across one deployment, so choosing a taken PIN says "already in use".
- **Owner sets PINs:** Team tab, "New PIN" (random, shown once). The developer gives the first PIN (the owner's) in `/dev` > Access.
- **Staff thank-you rewards** (migration `0007_staff_perks.sql`): owner gives a person or the whole team a reward in their own words (Team tab). Staff see it on End, at the end of the shift, and mark it used once. Owner can take back an unused one.
- **Developer area** `/dev`: Overview (health tiles, set-up checklist), Till (POS), Requests, Access.
- **Not verified:** migrations 0007 and 0008 have not run on a real Postgres; PIN lock-out and sessions were tested against the in-memory database only; the sample screens are `?mock=1` (development only).
