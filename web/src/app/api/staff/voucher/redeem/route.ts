import { z } from "zod";
import { fail, guestView, refreshWalletCards, withStaff } from "@/lib/staffApi";
import { resolveBranch } from "@/lib/staffBranch";
import { redeemVoucher } from "@/lib/vouchersDb";
import { qrProvesCard } from "@/lib/cardQr";

// qr: the text of the guest's QR exactly as scanned. It proves the guest holds this card (lib/cardQr.ts).
const Input = z.object({ cardId: z.uuid(), cardVoucherId: z.uuid(), branchId: z.uuid().nullable().optional(), qr: z.string().max(200).optional() });

/** Uses a guest's voucher, once. The database refuses a second time, the wrong branch and an expired voucher. */
export async function POST(request: Request) {
  return withStaff(async (staff) => {
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Voucher missing.");
    const guest = await guestView(parsed.data.cardId, staff);
    if (!guest) return fail("Card not found.", 404);
    // The voucher must be on THIS card: staff redeem what the guest in front of them shows, nothing else.
    if (!guest.vouchers?.some((v) => v.id === parsed.data.cardVoucherId)) return fail("Voucher not found.", 404);
    // A typed 4-digit code can be guessed, so it never spends a voucher at the till. A manager or the owner may
    // (the guest's phone is broken, the camera fails): they are named in the audit log.
    const trusted = staff.role === "owner" || staff.role === "manager";
    if (!trusted && !qrProvesCard(parsed.data.qr, { id: guest.cardId, code: guest.code }, staff.venueSlug)) {
      return fail("Scan the guest's card to use a voucher. A typed code is not enough; a manager can approve it.", 403);
    }
    const where = await resolveBranch(staff, parsed.data.branchId);
    if ("error" in where) return fail(where.error, where.status);
    const r = await redeemVoucher(parsed.data.cardVoucherId, staff.id, where.branchId);
    await refreshWalletCards(parsed.data.cardId, 0);
    return Response.json({ redeemedAt: r.redeemed_at, guest: await guestView(parsed.data.cardId, staff) });
  });
}
