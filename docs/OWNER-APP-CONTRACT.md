# Owner app: contract between back end and front end

Goal: a working owner web app (phone first, also laptop) that matches `design/templates/owner-app/index.html` (the prototype, the visual spec), built on Monaim's existing files, not rewritten.

Already working on `main` (do not break): `/owner` page, `OwnerApp.tsx`, `/api/owner/{summary,guests,rules,team,export}`, `withOwner()` in `lib/ownerApi.ts`, staff sessions in `lib/staffAuth.ts`, `/api/staff/{login,logout,me}`.

New in this work: **Offers**, **Data and privacy**, the restyle, and new login screens (designed separately, handed over later).

## Who owns which files (no overlap, so the two branches merge cleanly)

| | Back end agent | Front end agent |
|---|---|---|
| Branch | `owner-backend` | `owner-frontend` |
| Owns | `web/src/app/api/**` (new routes), `web/src/lib/**` (new libs, `appleWallet.ts` for the offer field), `supabase/migrations/0003_*.sql`, `web/tests/**`, `docs/OWNER-APP-CONTRACT.md` edits | `web/src/app/owner/**`, `web/src/components/**`, `web/src/app/globals.css` (new `ow-` prefixed rules only; do not change existing rules other pages use), `web/public/**` |
| Must not touch | anything under `web/src/app/owner/**`, `globals.css` | anything under `web/src/app/api/**`, `web/src/lib/**`, `supabase/**` |

If one side needs a change in the other's files, write it down in the report and let the supervisor decide.

## Roles
`owner` can do everything. `manager` can view overview, guests and rules; **cannot** send offers, erase guests, edit terms or manage the team. Use `withOwner(handler)` (owner or manager) and `withOwner(handler, true)` (owner only). Errors use `fail(message, status)` from `lib/staffApi.ts`: JSON `{ error }`.

## New endpoints (back end builds, front end calls)

### Offers
`GET /api/owner/offers` (owner or manager) ->
```json
{ "eligible": 212, "total": 248, "offers": [ { "id": "uuid", "message": "Double points this Friday, from 7 pm.", "audience": "all", "sentAt": "2026-10-15T18:02:11Z", "recipients": 212 } ] }
```
`eligible` = cards at this venue whose member agreed to news (`members.consent_news = true`, not deleted). `offers` = newest first, max 20.

`POST /api/owner/offers` (owner only) body `{ "message": string (1 to 200 chars, trimmed), "audience": "all" | "apple" | "google" }` ->
`{ "id": "uuid", "recipients": 212 }`. 400 `fail("Write a short message (up to 200 characters).")`, 400 if nobody agreed to notifications. Stores a row in `offers`, then updates the wallet cards of consenting guests:
- Apple: the pass gets a back field `offer` (key `offer`, label "From {{CLIENT}}", value = latest offer message, `changeMessage: "%@"`) for offers sent in the last 14 days, then the existing push mechanism wakes the registered devices.
- Google: add a message to the loyalty object if the existing Google code makes that straightforward; otherwise record it and say so in the report.
Writes an `audit_log` row (`offer_sent`).

**As built (back end, 2026-10-15), where it adds to or differs from the text above:**
- The message is cleaned to one line (line breaks and control characters become spaces). `audience` defaults to `"all"` when missing.
- `recipients` = guests the offer was addressed to: `all` = every guest who agreed; `apple` = those with a registered Apple device; `google` = cards Google accepted the message for (counted after sending).
- Other 400 texts the screen may show: "Nobody has agreed to notifications yet." / "No guest with an Apple Wallet card has agreed to notifications yet." (audience `apple`) / "Apple Wallet is not set up yet." / "Google Wallet is not set up yet." (audience `apple` / `google` while that wallet is not configured on the server).
- Sending the same message to the same audience again within 2 minutes (double tap) returns the first offer's `{ id, recipients }` and sends nothing new.
- Apple, **deviation:** every pass of a guest who agreed to offers carries the `offer` back field, first on the back. With a live offer (last 14 days) it has `changeMessage: "%@"`. With none it shows "No offer right now." and has no changeMessage. Reason: Apple documents the alert only for a field whose value changes, not for a field that is newly added, so the field must already be on the card when the first offer arrives. Guests who did not agree get no `offer` field. An offer expiring never raises an alert.
- Google: a message with type `TEXT_AND_NOTIFY` (shown on the card and as a notification) and a 14-day display interval is added to each consenting guest's saved card; cards the guest never saved are skipped.

### Data and privacy
Guests can ask for deletion (PDPL). New public endpoint `POST /api/card/[cardId]/delete-request` (no login; the unguessable card id is the credential; rate limit: one pending request per card) -> `{ "ok": true }`. The card page gets a small "Delete my data" link (front end adds it later in `card/[cardId]/page.tsx` only when the supervisor asks: not in this task).

`GET /api/owner/privacy` (owner only) ->
```json
{ "requests": [ { "id": "uuid", "cardId": "uuid", "label": "Guest from 12 Oct", "requestedAt": "2026-10-13T09:00:00Z", "status": "pending" } ],
  "terms": { "text": "…", "updatedAt": "2026-10-10T12:00:00Z" | null, "isDefault": true } }
```
`label` never contains the guest's name or contact (the point of the screen is that the owner can erase without browsing personal data); status is `pending` or `erased`; newest first, max 50.

`POST /api/owner/privacy/erase` (owner only) body `{ "requestId": "uuid" }` -> `{ "erased": true }`. Does exactly what `DELETE /api/owner/guests` does (erase the member, which removes the card and ledger by cascade), marks the request `erased`, audit row `guest_erased`. Keep the history of the request itself (no personal data in it).

`PUT /api/owner/terms` (owner only) body `{ "text": string (50 to 8000 chars) }` -> `{ "ok": true }`. Stored on the venue (`venues.terms_text`, new column). The guest terms page (`join/[venue]/terms`) shows `terms_text` when set, otherwise the current built-in clauses. (Back end changes that page's data source only; the front end does not touch it.)

**As built (back end, 2026-10-15):**
- Text format: blocks separated by a blank line; a block whose first line is short (60 characters or fewer) and does not end like a sentence gets that line as its title. When `isDefault` is true, `terms.text` is the built-in clauses written in that same format, so the editor can start from it. Line endings and control characters are cleaned before saving. Error text: "The terms must be between 50 and 8000 characters."
- The guest terms page hides the "Draft text, to be replaced by ..." note once the venue has saved its own terms.
- The full text of every change goes into `audit_log` (`terms_changed`), so there is a record of what guests agreed to.
- `DELETE /api/owner/guests` is now **owner only** (it let managers erase guests before, which this contract does not allow). The front end should not show Erase to a manager. It also closes any pending deletion request for that card.
- `POST /api/owner/privacy/erase` answers 404 "Request not found." for an unknown request (or one of another venue) and `{ "erased": true }` again if asked twice. A request's `cardId` stays in the history after the card is gone.
- `POST /api/card/[cardId]/delete-request`: 404 `{ error }` for a malformed or unknown card id, 429 `{ error }` after 10 calls in 10 minutes from one caller (per server instance), `{ "ok": true }` otherwise, also when a request was already pending.

Export: existing `GET /api/owner/export` (CSV). No change.

## Migration `supabase/migrations/0003_owner_offers_privacy.sql` (back end writes; Monaim applies it, agents never run it against the real database)
- `venues.terms_text text`, `venues.terms_updated_at timestamptz`
- `deletion_requests (id uuid pk default gen_random_uuid(), venue_id uuid not null references venues on delete cascade, card_id uuid, requested_at timestamptz not null default now(), status text not null default 'pending' check (status in ('pending','erased')), erased_at timestamptz)`, index on `(venue_id, status)`, **row level security enabled** like the other tables, unique pending request per card.
- `offers` already exists; add `recipients integer not null default 0`.

## Front end rules
- Build against these shapes. Until the back end is merged, add a **development-only mock** (client side, only when `process.env.NODE_ENV !== "production"` and the address has `?mock=1`) that returns fake data for every owner endpoint (existing and new), so every tab can be seen and clicked without a database. The mock must be impossible to enable in production.
- Visual spec: `design/templates/owner-app/index.html` and the screenshot `design/templates/owner-app/gallery-phone.png`. Tabs: Overview, Guests, Rules, Offers, Team, Data and privacy. Phone: tab pills at the top; 900 px and wider: a side menu. English strings as in the prototype. Keep Monaim's behaviour (search, CSV export, erase with confirmation, steppers, invite with one-time password).
- Colours and fonts: the existing tokens in `globals.css` (`--bg #141210`, `--gold #cda55b`, Georgia serif headings). Do not make it look like generic AI output: restrained, strict spacing, real typography.

## Everyone
- Next.js 16: read `web/node_modules/next/dist/docs/` before using APIs you are unsure of.
- Run `npx next typegen`, `npx tsc --noEmit`, `npx eslint src`, `npm test` before every commit. All must pass.
- Commit often to your branch. **Never push to `main`. Never push at all** (the supervisor pushes). Never touch secrets or `.env*`. Never write to the real Supabase.
- Windows PowerShell: avoid commands that mix `Remove-Item` with path string replacement (a safety guard blocks them).


---

# Round 2 (2026-10-15): luxury restyle, points summary, easy updates, message templates

Branch base: `owner-app-royal`. Three agents, three branches, no overlapping files.

| | Back end | Front end | Marketing |
|---|---|---|---|
| Branch / worktree | `owner-v2-backend` | `owner-v2-frontend` | `owner-v2-marketing` |
| Owns | `web/src/app/api/owner/points/**`, `web/src/lib/pointsSummary*.ts`, `web/tests/points*.test.ts`, this file (edits to the points section only) | `web/src/app/owner/**` (except `offerTemplates.ts`), `web/src/components/**` (except `SignIn.tsx`, `signin.css`), `ow-` rules in `globals.css`, `web/public/**` | `web/src/app/owner/offerTemplates.ts`, `docs/OWNER-MESSAGE-GUIDE.md` |

## New endpoint: points summary
`GET /api/owner/points?range=today|7d|30d|all` (owner or manager; default `7d`) ->
```json
{
  "range": "7d",
  "from": "2026-10-09",            // Bahrain calendar day, first day included ("all": the day of the first ledger entry, or today)
  "to": "2026-10-15",              // last day included (today)
  "issued": 5240,                  // points given out: sum of live 'earn' points
  "redeemed": 3000,                // points spent on rewards (positive number), live 'redeem' entries
  "rewards": 6,                    // number of live redeems
  "visits": 312,                   // number of live 'earn' entries
  "billBhd": 1845.5,               // sum of bill_bhd of live earn entries (BHD, 3 decimals max)
  "held": 39452,                   // points held by guests right now (sum of cards.points), not range dependent
  "perDay": [ { "day": "2026-10-09", "issued": 702, "redeemed": 500 } ]   // one item per Bahrain day in the range, oldest first, empty days included; "all" is capped to the last 90 days
}
```
"Live" = not undone: an entry is dropped when another entry has `undoes` pointing at it; `undo` entries themselves are never counted. Any other ledger kind (adjustments, welcome bonus and so on) is ignored in `issued` unless the enum says it gives points: the back end agent decides after reading `ledger_kind`, and writes the decision in the report. Day boundaries use Bahrain time (`bahrainDayStart()` in `lib/ownerApi.ts`). Pure aggregation lives in `lib/pointsSummary.ts` (no database inside) and is unit tested; the route only fetches rows.

**As built (back end, 2026-10-15), where it adds to or differs from the text above:**
- Ledger kinds (from `ledger_kind` in migrations 0001 and 0002): `earn` counts in `issued`, `visits` and `billBhd`; `redeem` counts in `redeemed` and `rewards`; `undo` is never counted; **`welcome` counts in `issued` only** (points handed out with no bill and no visit; no code writes this kind yet); `adjust` (manual correction, plus or minus) and any future kind are ignored. An adjustment still changes `held`, so `held` can differ from "issued minus redeemed over all time".
- `range=all`: `from` is the day of the first ledger entry, but `perDay` only covers the last 90 days, so its first item can be later than `from`. Totals cover the whole history.
- Ledger rows dated after today (Bahrain) or with an unreadable date are ignored.
- A `range` other than the four values answers 400 `{ "error": "Choose a range: today, 7d, 30d or all." }`; a missing `range` means `7d`. Signed out is 401; staff and developer roles are 403 like the other owner screens.
- The route reads the ledger in pages of 1000 rows. Past 100,000 ledger rows for a venue it answers 500 instead of showing totals that miss rows (a database-side total would be needed then).

## Easy updates (front end only, uses what exists)
- **Send an update**: the Offers composer gets a "Today's update" form (Today's reward, Today's bonus, From). It builds the message text and sends it through the existing `POST /api/owner/offers` (200 characters, owner only, same confirmation step).
- **Change the reward**: a quick sheet that posts the existing `POST /api/owner/rules` (owner only).
- **Points given out**: an Overview card that opens a summary sheet using the new endpoint.

## Message templates (marketing agent writes, front end imports)
File `web/src/app/owner/offerTemplates.ts`, pure data, no imports except types:
```ts
export type OfferField = { key: string; label: string; example: string; maxLength: number };
export type OfferTemplate = {
  id: string;                 // kebab-case, unique
  title: string;              // short name on the chip, 2 to 4 words
  when: string;               // one line: when an owner would use it
  text: string;               // the message with {key} placeholders, 200 characters or fewer AFTER filling the examples
  fields: OfferField[];       // every {key} used in text, in the order the owner fills them
  demo?: boolean;             // true for the Big Boss Saud demo message
};
export const OFFER_TEMPLATES: OfferTemplate[];
export const DEFAULT_SIGNED_BY = "the Big Boss Saud";   // demo sender name
export function fillTemplate(t: OfferTemplate, values: Record<string, string>): string;  // replaces {key}, trims, collapses spaces
```
`fillTemplate` leaves an unfilled `{key}` as the field's example. Every template, filled with its examples, must be 200 characters or fewer; a unit test (`web/tests/offerTemplates.test.ts`, marketing agent writes it) enforces that, plus unique ids and that every placeholder has a field.

## Visual direction for "more luxurious" (front end)
{{CLIENT}} is a high-end venue. Luxury here means restraint and craft, not decoration: no sparkle, glow, or neon; strict 8 px grid; real typography.
- Marble header band behind the page title (`/venues/<slug>/marble.jpg`, darkened, cropped), with the gold {{CLIENT}} lettering in the side menu.
- Figures in gold foil (the existing `.foil` gradient), Georgia, large; small caps eyebrows with wide tracking.
- Cards with a fine double gold line (1 px at about 38 percent, inner 1 px at about 14 percent), hairline rules, generous padding.
- Side menu: crest, thin gold indicator for the open section, quiet hover.
- Numbers count up once on first load (skip for reduced motion). Dialogs, tables, steppers, forms, Team, Privacy and Guests all get the same treatment.
- Phone must stay excellent; 900 px and wider keeps the side menu and two columns. Keep contrast AA.

## Everyone
Same rules as round 1: typegen, tsc, eslint, vitest before each commit; never push; no secrets; no real Supabase. Dev server: `npm run dev -- --webpack` (Turbopack cannot follow the `node_modules` junction).

---

# Round 3 (2026-10-16): undo a sent message, or resend it with an edit

Saad: "undo a message or resend with an edit". Honest limit that the screens must say plainly: a notification that has already appeared on a guest's phone cannot be recalled. What the owner CAN do is (a) withdraw the message so it disappears from guests' Wallet cards, and (b) send a corrected message (Apple only alerts when the text changes, so a corrected text does alert).

| | Back end | Front end |
|---|---|---|
| Branch / worktree | `owner-v3-backend` / `loyalty-owner-v3-backend` | `owner-v3-frontend` / `loyalty-owner-v3-frontend` |
| Owns | `web/src/app/api/owner/offers/**`, `web/src/lib/**` (offers, passOffer, googleWallet, appleWallet, apns as needed), `supabase/migrations/0004_offer_withdraw.sql`, `web/tests/**`, this file (round 3 section only) | `web/src/app/owner/**`, `web/src/components/**` (not SignIn), `ow-` rules in `globals.css` |

## Back end
- Migration `supabase/migrations/0004_offer_withdraw.sql`: `offers.withdrawn_at timestamptz` and `offers.withdrawn_by uuid references staff_users(id)`. Agents never run it against the real database; Monaim applies it.
- `POST /api/owner/offers/[id]/withdraw` (owner only, no body). Response `{ "ok": true, "withdrawnAt": "ISO" }`. 404 `fail("That message was not found.")` when the id is not an offer of this venue; 409 `fail("That message was already withdrawn.")`; 400 when the id is not a uuid. Idempotent-safe: never withdraw an offer of another venue. Writes an `audit_log` row `offer_withdrawn`.
- A withdrawn offer must stop appearing on cards: Apple (`offer` back field is computed from the newest offer of the last 14 days that is NOT withdrawn; with none left it reads "No offer right now." without changeMessage, as already built), and Google (remove the withdrawn message from the loyalty object if the Google API allows it with the existing code; otherwise say so in the report). After marking it withdrawn, trigger the same push mechanism used when sending so registered Apple devices re-fetch the pass. Pushing must not fail the request if APNs is not configured (same behaviour as sending).
- `GET /api/owner/offers` items gain `withdrawnAt: string | null`. `eligible`/`total` unchanged. Withdrawn items stay in the list (history).
- Tests for: withdraw happy path, 404 for another venue's offer, 409 twice, 400 bad id, role check (manager gets 403), Apple field excludes withdrawn and falls back to the previous live offer, GET shape.

**As built (back end, 2026-10-16), where it adds to or differs from the text above:**
- Response shapes are exactly as written: 200 `{ "ok": true, "withdrawnAt": "ISO" }`; 404 "That message was not found." (an unknown id and another venue's offer look the same); 409 "That message was already withdrawn." (also when two taps arrive together: one gets 200, the other 409); 400 "That message id is not valid." for an id that is not a uuid (checked before the database is read); 401 / 403 come from `withOwner` ("Please sign in again." / "Only the owner can open this."; managers, staff and developers get 403). Nothing is withdrawn on any error. The route file is a thin shell; the logic is `withdrawOfferResponse` in `lib/offersApi.ts` (so the tests can run it without Next.js).
- `GET /api/owner/offers`: every item has `withdrawnAt` (ISO string, or `null`). Withdrawn items stay in the list, in their place by send time. `eligible`/`total` are unchanged.
- **Apple, exactly.** The pass is built from the database each time Wallet fetches it. A withdrawn offer is left out, so the back field `offer` shows the newest offer that is not withdrawn and was sent in the last 14 days, or "No offer right now." (no changeMessage) when none is left. After marking the offer, the same push as sending wakes every registered device of guests who agreed to offers (best effort: a missing Apple setup or a failing push or lookup never fails the request). The change stamp Apple compares (`offerChangeStamp`) includes the withdrawal time, so every card that still holds the withdrawn text is fetched again, even though the card now shows an older offer. No push is sent when the offer was Google only or is older than 14 days (no card shows it).
- **Apple alert rule (deviation, to avoid a confusing alert).** `changeMessage` is attached only while the offer on show is the newest offer sent to Apple. If an OLDER offer comes back because newer ones were withdrawn, it is shown without `changeMessage`, so withdrawing a wrong message does not alert guests again with an old offer. "Edit and resend" is unaffected: the corrected text is sent first, so it is the newest offer and alerts; the original is withdrawn after. The "No offer right now." line never alerts (unchanged).
- **Google: nothing is removed.** Google Wallet has no call that deletes one message from a loyalty object (only `addMessage`). Removing it would mean reading every guest's object and rewriting its whole `messages` list with PATCH, and whether that replaces the list, how it treats an empty list, and whether it makes Google notify again for the other messages cannot be checked without a real Google Wallet account. Re-notifying guests would be worse than leaving the text, so the safe choice was made: **a withdrawn offer stays on Google Wallet cards until its 14-day display interval ends.** Apple cards are cleaned at once. The screens should not say "it will disappear from guests' cards" for offers whose audience is `all` or `google` without this limit (the list item has `audience`, so the front end can tell). To add it later: test GET + PATCH against a Google test object first, using the message `id` (it is the offer id).
- Sending the same text again right after withdrawing it is a new send (the double-tap check ignores withdrawn offers).
- Audit: `offer_withdrawn` with `detail { offer, audience }`, actor = the owner's staff id.
- **Migration `0004_offer_withdraw.sql` must be applied BEFORE this code is deployed.** Offers list, sending, Apple passes and the Apple change stamp all read `withdrawn_at`. (`withdrawn_by` is set to null if that staff account is ever deleted.)

## Front end
- In the Sent offers list each row shows, for the owner only: **Edit and resend** and **Withdraw** (Withdraw only when the offer is under 14 days old and not withdrawn). A withdrawn row shows a quiet "Withdrawn" tag and no actions. Managers see the list without actions.
- **Withdraw**: confirmation dialog in the same style as Send: title "Withdraw this message?", the message in the lock-screen preview, plain text: "It will disappear from guests' cards. Guests who already received the notification have seen it, and that cannot be undone." Buttons "Withdraw it" and "Not yet". After success the row updates in place (status text "Withdrawn", polite live message).
- **Edit and resend**: opens the composer in free-text mode with the old message filled in (a "Message" text area, 200 characters max, counter), a note "Change the words: guests are alerted only when the text is different", and a checkbox "Withdraw the original when I send this" (checked by default). Review and send stays disabled until the text differs from the original (compare trimmed, case-sensitive) and is 1 to 200 characters. Same confirmation dialog as always; nothing sends without it. On success: if the box is checked, call the withdraw endpoint for the original (send first, then withdraw, so cards never go empty); if the withdraw fails, still report the send as done and say plainly that the original could not be withdrawn, with a Withdraw button to retry.
- Mock (`?mock=1`, development only): support the withdraw endpoint and `withdrawnAt` so every state can be seen and clicked.
- Dialog, focus and keyboard behaviour as for the existing dialogs (Esc closes, focus returns to the button that opened it).