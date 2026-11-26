# Connecting a till (POS)

One generic adapter works with any till that can send an HTTPS request after a sale or refund. Named systems (Foodics, Square, Lightspeed, Oracle Simphony) are **planned, not verified**: nothing is promised for them until their real API has been checked.

## Set up (developer login, `/dev`)

1. Sign in at `/dev` with a developer account of the client's business.
2. Press **Make a key**. The key (`loy_pos_...`) is shown once. Only its SHA-256 hash is stored. Making a new key stops the old one at once.
3. Give the till the address `https://<client-site>/api/pos/events` and the header `Authorization: Bearer <key>`.
4. Send a `ping`. It appears under **Last events**.

## Messages (POST, JSON)

```json
{"type":"ping"}
{"type":"sale","receiptId":"R-1001","cardCode":"1234","billBhd":12.5}
{"type":"refund","receiptId":"R-1001"}
```

- `receiptId`: up to 64 characters (letters, digits, `. - _ : / #`). Sending the same sale or refund twice is safe: the second answer says `"duplicate": true` and changes nothing.
- `cardCode`: the guest's 4-digit code. `billBhd`: more than 0, up to 5000.
- Points = floor(bill x the business's points per BHD). A refund takes back exactly the points that sale gave.

### What was ordered (optional, needs migration 0024)

```json
{"type":"sale","receiptId":"R-1001","cardCode":"1234","billBhd":11.4,"branch":"sanad",
 "items":[{"name":"Chicken Machboos","qty":2,"priceBhd":3.9},{"name":"Karak tea","qty":2,"priceBhd":0.8}]}
```

- `items`: up to 100 lines; `name` up to 120 characters, `qty` 1 to 99 (1 when left out), `priceBhd` the price of one (may be left out). The bill and its lines are kept against the guest: the owner sees them in **Guests > Orders**, with what the guest orders most.
- `branch`: the branch's short name as in the owner's Branches list (lower case, for example `sanad`). Needed only when the business has more than one branch.
- **A visit-card business (no points, for example Al Roshinah):** the sale keeps the bill and **counts the visit**, with the same rules as a staff scan (one visit per sitting, gifts unlock), so the cashier does not scan the card a second time. The answer is `{"ok":true,"duplicate":false,"visitCounted":true,"visits":4,"giftsUnlocked":0,"itemsSaved":2}`. A bill at a partner counter, or with no branch named at a business with several branches, is kept without counting a visit. A refund marks the bill refunded; the visit stays.
- A points business: unchanged, and the bill is kept too.

## Answers

| Status | Meaning |
|---|---|
| 200 | Done (or duplicate) |
| 400 | Bad message (the answer shows the expected shape) |
| 401 | Missing, wrong or switched-off key |
| 422 | Rejected in plain words: unknown card code, bill cannot earn points, guest already used the points, no sale with that receipt |
| 429 | More than 120 requests a minute |
| 500 | Try again |

## Safety

- The business is found from the key, never from the message body, so a key can only touch its own business.
- Needs migration `0006_pos_connector.sql` (apply to the client's own database after a backup, after `0005`).
- Not yet run against a real Postgres or a real till.

## Try it with the sample till (no real POS needed)
`web/scripts/sample-pos.mjs` is a small fake till that runs on your PC and sends real messages to the platform.
```powershell
cd C:\Users\3amka\Documents\CALABOS\workspace\loyalty-whitelabel\web
$env:POS_URL = "https://loyalty-platform-steel.vercel.app"
$env:POS_KEY = "loy_pos_..."        # the key from /dev > Till (shown once)
node scripts/sample-pos.mjs
```
Open http://localhost:8790. Pick items, type a guest's 4-digit card code, press **Pay**: the platform adds the points. **Refund last sale** takes them back. The key stays in this program, never in the page.
