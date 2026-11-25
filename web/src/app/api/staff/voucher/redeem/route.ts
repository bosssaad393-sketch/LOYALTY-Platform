import { z } from "zod";
import { fail, guestView, refreshWalletCards, withStaff } from "@/lib/staffApi";
import { resolveBranch } from "@/lib/staffBranch";
import { redeemVoucher } from "@/lib/vouchersDb";

const Input = z.object({ cardId: z.uuid(), cardVoucherId: z.uuid(), branchId: z.uuid().nullable().optional() });

/** Uses a guest's voucher, once. The database refuses a second time, the wrong branch and an expired voucher. */
export async function POST(request: Request) {
  return withStaff(async (staff) => {
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Voucher missing.");
    const guest = await guestView(parsed.data.cardId, staff);
    if (!guest) return fail("Card not found.", 404);
    // The voucher must be on THIS card: staff redeem what the guest in front of them shows, nothing else.
    if (!guest.vouchers?.some((v) => v.id === parsed.data.cardVoucherId)) return fail("Voucher not found.", 404);
    const where = await resolveBranch(staff, parsed.data.branchId);
    if ("error" in where) return fail(where.error, where.status);
    const r = await redeemVoucher(parsed.data.cardVoucherId, staff.id, where.branchId);
    await refreshWalletCards(parsed.data.cardId, 0);
    return Response.json({ redeemedAt: r.redeemed_at, guest: await guestView(parsed.data.cardId, staff) });
  });
}
