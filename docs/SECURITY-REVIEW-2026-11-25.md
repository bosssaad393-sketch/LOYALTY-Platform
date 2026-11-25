# Security review, 2026-11-25 (branch `agent/roshinah`)

Reviewed by Claude Code for Saad, following the `security-review` playbook in `skills/ecc` (secrets, input checks, queries, sign-in and permissions, rate limits, data exposure). Scope: everything added for branches, visit cards and vouchers, plus a pass over the public and signed-in routes that were already there. Code review and automated tests only: no penetration test against a live deployment, because nothing is deployed yet.

## Fixed in this pass
| # | Risk | What could happen | Fix |
|---|---|---|---|
| 1 | High | A card's QR was only venue + a 4-digit code. Anyone could build a QR from a guessed code and spend another guest's 50% voucher at the counter. | Every QR now carries a proof only the server can make (`lib/cardQr.ts`). A voucher is used only against a scanned QR with a valid proof. A typed code never spends a voucher at a till; a manager or the owner can approve one, and is named in the log. Old cards keep scanning for everything else. |
| 2 | Medium | A signed-in till could walk through all 9,000 card codes and read first names or record visits. | Card lookups are limited per person (240 in 10 minutes, counted in the database). Visits are capped per person per day, and now vouchers used per person per day too. |
| 3 | Medium | A manager could download every guest's phone and email (the code said "owner only" but did not enforce it). | The guest list download is owner only. A test proves a manager gets refused. |
| 4 | Low | A branch address or link typed by the owner went into the Wallet pass as HTML without escaping. | Escaped, and only http/https links are written. |
| 5 | Low | Past 1,000 guests, gift counts would be wrong and guests after the first 1,000 would never get a birthday notice (the database returns 1,000 rows per read). | Counts are done inside the database; the daily job pages through every guest. |
| 6 | Low | Nobody would know someone was guessing PINs. | When wrong PINs pause sign-in, one line goes into the owner's activity log. |

## Checked and found sound (already in the platform)
- **Secrets**: none in the code or in git; `.env*` is ignored; the database key and Apple keys are server-only; nothing secret is sent to the browser.
- **Tenant safety**: every read and write for a venue is filtered by the signed-in person's venue on the server. New routes follow it; tests prove an owner of another venue sees and changes nothing.
- **Database rules**: visits, unlocks and redemptions run inside database functions with a row lock, so a double tap cannot use a voucher twice. Row level security is on for every new table; only the server key can call the functions.
- **Sign-in**: PINs are stored as keyed hashes, never readable; wrong tries are counted in the database; sessions are signed, HttpOnly, per screen, 12 hours.
- **Input**: every route validates its body with a schema; no SQL is built from text; review links accept Google addresses only.
- **Browser protections**: Content Security Policy, no framing, no MIME sniffing, camera only on our own pages. No `dangerouslySetInnerHTML` anywhere.
- **Privacy**: staff see a guest's first name only; contact details leave the system only through the owner's logged download; "delete my data" removes the guest, the card, the visits, the vouchers and the notices.
- **Daily job**: closed (404) unless `CRON_SECRET` is set; the secret is compared in constant time; running it twice sends nothing twice.

## Left open: your decision
| # | Risk | What | Options |
|---|---|---|---|
| A | Medium | **Staff PINs are 4 digits.** With 30 wrong tries allowed per 10 minutes for the whole venue, a patient attacker who changes address could find a staff PIN in a few days. A stolen staff PIN can record visits and see first names; since fix 1 it can no longer spend vouchers. An owner PIN (6 digits) would take most of a year. | (1) Leave it and watch the activity log. (2) Trusted tills: a till must be paired once by the owner before a PIN works on it. About two days of work; stops PIN guessing from outside completely. I recommend (2) before a busy venue goes live. |
| B | Medium | **One person, many cards.** A guest can join with several phone numbers to collect several 50% vouchers. The voucher still needs a staff scan after a paid visit, which is the real guard. | A one-time code to the phone at join (cost per message), or the bill number typed at unlock. Decide with the owner once the voucher is public. |
| C | Low | **Join consent**: the offers box is ticked by default. Bahrain's data law asks for clear consent to marketing. | Untick it by default for Roshinah. Your call (you chose ticked for Spaloon on 22 Nov). |
| D | Low | **Wrong-PIN lockout can be abused**: anyone can pause sign-in for 10 minutes by typing 30 wrong PINs. | Option A(2) removes this too. |
| E | Low | **Undo of a visit** does not lower the visit count. | Small database change; do it with the next migration. |

## Not covered
A live test on the real deployment (rate limits behind Vercel, Apple Wallet updates on a phone, the Tap payment pages), a dependency audit (`npm audit` needs network and your yes), and Supabase project settings (backups, who has dashboard access, 2-step sign-in on the Supabase, Vercel and Apple accounts). Do these at go-live.
