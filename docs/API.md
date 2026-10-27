# API contract (draft v0, 12 Oct 2026)

Draft by Saad and Claude Code so screens and endpoints can be built in parallel. The staff screens in design/staff-app/ already follow it (fake data, clickable). **Monaim: change anything that does not fit.** Edit this file first, then the code.

All calls are JSON over HTTPS. Errors: `{ "error": "short message for a person" }` with the right status code. Staff and owner calls need a signed-in session (real logins, no shared PINs).

## Already built
| Call | In | Out |
|---|---|---|
| `POST /api/join` | `{ venue, name, contact, terms: true, news }` | `{ cardId }` |
| *proposed change* | The guest form now has **separate fields**: `{ venue, name, phone?, email?, terms: true, news }`. At least one of `phone` or `email` is required (the form says so). Monaim: the current route takes one `contact` field and guesses phone vs email from an `@`. | same |
| `GET /api/wallet/google/{cardId}` | none | redirect to Google "Save to Wallet" |
| `GET /card/{cardId}` (page) | none | the guest's card |

## Needed for the staff and owner app (proposal)
| Call | Who | In | Out |
|---|---|---|---|
| `POST /api/staff/login` | staff | `{ email, password }` | session + `{ name, role, venue }` |
| `GET /api/staff/card?code=4827` | staff | the card code from the QR or typed (step 1) | `{ cardId }` or 404 (nothing about the guest is returned yet) |
| `POST /api/staff/verify` | staff | `{ cardId, letter, code }`: first letter of the name + the changing code on the guest's phone (step 2) | `{ firstName, points, visits, goal, rewardReady }`, or 400 with tries left, or `{ locked: true }` after 5 wrong tries |
| `POST /api/staff/earn` | staff | `{ cardId, billBhd }` | `{ points, added }` |
| `POST /api/staff/redeem` | staff, manager | `{ cardId }` | `{ points, rewardsGiven }` |
| `POST /api/staff/undo` | staff | `{ ledgerId }` (within 10 minutes) | `{ points }` |
| `GET /api/staff/recent` | staff | none | last actions with staff name and time |
| `GET /api/owner/summary` | owner, manager | none | `{ members, visits7d, pointsHeld, rewardsGiven30d, perDay14: [..] }` |
| `GET /api/owner/guests` | owner | optional `?q=` | guest list (names and visit counts) |
| `GET /api/owner/export.csv` | owner | none | CSV of guests and points |
| `POST /api/owner/rules` | owner | `{ pointsPerBhd, rewardGoal, rewardText }` | the saved rules |
| `POST /api/owner/offer` | owner | `{ message, audience }` | `{ sent }` (pushed to Wallet cards of guests who agreed) |
| `POST /api/guest/delete` | guest | `{ cardId }` | `{ deleted: true }` (real erase of name, phone, email) |

## The till code
Server side only. The code is made per card, valid about 2 minutes, usable once. Open question for Monaim: how the guest sees it on Apple Wallet (see `docs/TEAM-WORKFLOW.md`).

## Rules for the screens
Never show another guest's phone or email to staff. Money is in BHD with 3 decimals. Points are whole numbers.


