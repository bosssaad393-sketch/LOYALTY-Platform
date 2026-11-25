import { z } from "zod";
import { fail, guestView, refreshWalletCards, withStaff } from "@/lib/staffApi";
import { resolveBranch } from "@/lib/staffBranch";
import { recordVisit } from "@/lib/vouchersDb";

const Input = z.object({ cardId: z.uuid(), branchId: z.uuid().nullable().optional() });

/** Visit cards (0022): one paid visit at this branch. Unlocks the vouchers the visit earns. */
export async function POST(request: Request) {
  return withStaff(async (staff) => {
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Card missing.");
    const before = await guestView(parsed.data.cardId, staff);
    if (!before) return fail("Card not found.", 404);
    if (!before.visitMode) return fail("This venue does not use visit cards.");
    const where = await resolveBranch(staff, parsed.data.branchId);
    if ("error" in where) return fail(where.error, where.status);
    const r = await recordVisit(parsed.data.cardId, staff.id, where.branchId);
    await refreshWalletCards(parsed.data.cardId, 0);
    return Response.json({ ledgerId: r.ledger_id, visits: r.visits, vouchersIssued: r.vouchers_issued, guest: await guestView(parsed.data.cardId, staff) });
  });
}
