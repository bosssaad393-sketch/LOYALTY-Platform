import { z } from "zod";
import { earnPoints } from "@/lib/ledgerDb";
import { fail, guestView, refreshWalletCards, withStaff } from "@/lib/staffApi";

const Input = z.object({ cardId: z.uuid(), billBhd: z.number().positive().max(5000) });

export async function POST(request: Request) {
  return withStaff(async (staff) => {
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Enter the bill total in BHD.");
    if (!(await guestView(parsed.data.cardId, staff))) return fail("Card not found.", 404);
    const bill = Math.round(parsed.data.billBhd * 1000) / 1000;
    const r = await earnPoints(parsed.data.cardId, staff.id, bill);
    await refreshWalletCards(parsed.data.cardId, r.new_balance);
    return Response.json({ ledgerId: r.ledger_id, added: r.points_added, guest: await guestView(parsed.data.cardId, staff) });
  });
}
