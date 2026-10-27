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
