import { z } from "zod";
import { addStamp } from "@/lib/ledgerDb";
import { fail, guestView, refreshWalletCards, withStaff } from "@/lib/staffApi";

const Input = z.object({ cardId: z.uuid() });

/** Stamp venues: one stamp for this visit. */
export async function POST(request: Request) {
  return withStaff(async (staff) => {
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Card missing.");
    const before = await guestView(parsed.data.cardId, staff);
    if (!before) return fail("Card not found.", 404);
    if (!before.stampMode) return fail("This venue uses points, not stamps.");
    const r = await addStamp(parsed.data.cardId, staff.id);
    await refreshWalletCards(parsed.data.cardId, r.new_balance);
    return Response.json({ ledgerId: r.ledger_id, added: 1, guest: await guestView(parsed.data.cardId, staff) });
  });
}
