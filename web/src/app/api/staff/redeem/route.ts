import { z } from "zod";
import { redeemReward } from "@/lib/ledgerDb";
import { fail, guestView, refreshWalletCards, withStaff } from "@/lib/staffApi";

const Input = z.object({ cardId: z.uuid() });

export async function POST(request: Request) {
  return withStaff(async (staff) => {
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Card missing.");
    if (!(await guestView(parsed.data.cardId, staff))) return fail("Card not found.", 404);
    const r = await redeemReward(parsed.data.cardId, staff.id);
    await refreshWalletCards(parsed.data.cardId, r.new_balance);
    return Response.json({ ledgerId: r.ledger_id, guest: await guestView(parsed.data.cardId, staff) });
  });
}
