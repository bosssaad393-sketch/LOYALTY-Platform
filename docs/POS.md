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
