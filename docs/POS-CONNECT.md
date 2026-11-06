# Connecting a real till (POS) to LOYALTY, step by step

Tested 30 Oct 2026 with the sample till against the live platform: sale (points added), refund (points taken back), the same refund pressed again (ignored). The event list in /dev > Till showed each one.

## How it works in one picture
```
Cashier rings up a sale in the POS  --->  POS (or a small bridge) sends one web message  --->  LOYALTY adds the points to the guest's card
                                            POST /api/pos/events  (Authorization: Bearer loy_pos_...)
```
Three message types, JSON:
- `{"type":"ping"}`  checks the connection.
- `{"type":"sale","receiptId":"R-1001","cardCode":"4821","billBhd":12.5}`  adds points (bill x the points-per-BHD rule, rounded down).
- `{"type":"refund","receiptId":"R-1001"}`  takes back exactly the points of that sale, once.

The same receipt twice never counts twice. A wrong card code is refused and logged as "rejected". The key belongs to one business; the business is found from the key.

## Steps to connect a real POS
1. **Find out the POS.** Name, plan, and whether it can send "order paid" and "refund" events (webhooks) or has an API. Ask the venue to open a support ticket if unsure.
2. **Decide how the guest is identified** (the sale must carry the 4-digit card code):
   - the cashier types the code in a POS field that the sale keeps (customer reference / note / table name), or
   - the cashier scans the guest's wallet QR into the customer field, or
   - no POS integration: the cashier enters the bill in the LOYALTY staff screen (works today).
3. **Make the key** in /dev > Till (POS). It is shown once. Store it in the bridge's secret settings, never in a page or a chat.
4. **Build the bridge** that turns the POS event into our message:
   - no code: a Make / n8n / Zapier flow: trigger = the POS event "order paid"; action = HTTP request to the address with the `Authorization: Bearer` header and the JSON above;
   - or a small adapter we write for that one POS (needs its API documents and a test account).
   Map: `receiptId` = the POS order id; `billBhd` = the order total in BHD; `cardCode` = the 4 digits from the field chosen in step 2. Skip orders with no code. Send a `refund` when the POS cancels or refunds the order.
5. **Test on a sample or test branch**, never on live takings: ping, a small sale (0.5 BHD), the same sale again (must be ignored), a refund, a wrong code (must be rejected).
6. **Go live** with one venue, watch /dev > Till for problems for the first week.

## Try it today without a real POS
`web/scripts/sample-pos.mjs` is a fake till (see docs/POS.md). Run it with `POS_URL` and `POS_KEY`, open http://localhost:8790.

## What we still need to decide with the venue
- Which POS, and who at the venue talks to the POS vendor.
- Whether the cashier types the code, scans the QR, or uses the staff screen.
- How refunds and voids reach the bridge.
