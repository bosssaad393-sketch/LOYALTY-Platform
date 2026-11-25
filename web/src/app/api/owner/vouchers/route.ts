import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { VoucherInput, listVouchers, saveVoucher, voucherCounts } from "@/lib/vouchersDb";

/** The venue's vouchers with how many were unlocked, used and are still waiting. */
export async function GET() {
  return withOwner(async (staff) => {
    const [vouchers, counts] = await Promise.all([listVouchers(staff.venueId), voucherCounts(staff.venueId)]);
    return Response.json({ vouchers: vouchers.map((v) => ({ ...v, counts: counts[v.id] ?? { issued: 0, redeemed: 0, waiting: 0 } })) });
  });
}

/** Owner only: add a voucher, or change one (send its id). */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = VoucherInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Check the voucher: a title (up to 80 characters) and, if it expires, a number of days.");
    const saved = await saveVoucher(staff, parsed.data);
    if (saved === "not_found") return fail("Voucher not found.", 404);
    if (saved === "bad_branch") return fail("That branch is not one of yours.");
    return Response.json({ voucher: saved });
  }, true);
}
