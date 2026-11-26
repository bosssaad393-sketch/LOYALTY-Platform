import { z } from "zod";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import type { Staff } from "@/lib/staffAuth";
import { listVouchers, setVoucherPhoto, voucherCounts } from "@/lib/vouchersDb";
import { parsePhoto, storePhoto } from "@/lib/table/photo";
import { sendCardDesign } from "@/lib/cardDesign";

const Post = z.object({ id: z.uuid(), image: z.string().max(1_000_000) });
const Delete = z.object({ id: z.uuid() });

const gifts = async (venueId: string) => {
  const [vouchers, counts] = await Promise.all([listVouchers(venueId), voucherCounts(venueId)]);
  return { vouchers: vouchers.map((v) => ({ ...v, counts: counts[v.id] ?? { issued: 0, redeemed: 0, waiting: 0 } })) };
};

/** Guests already holding this gift see the new picture: their saved Wallet cards are told to fetch the card again. */
async function refreshHolders(staff: Staff, waiting: number) {
  if (waiting > 0) await sendCardDesign(staff.venueId, staff.id).catch((e) => console.error("gift photo refresh failed", e instanceof Error ? e.message : e));
}

/** Owner only: adds or replaces the photo of one gift (0033). It shows in the card's niche while the gift waits. */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Post.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("That photo is too large. Please choose a smaller one.");
    const photo = parsePhoto(parsed.data.image);
    if (!photo) return fail("Please choose a JPEG, PNG or WebP photo.");
    if (!(await listVouchers(staff.venueId)).some((v) => v.id === parsed.data.id)) return fail("Voucher not found.", 404);
    const saved = await setVoucherPhoto(staff, parsed.data.id, await storePhoto(staff.venueId, `gift-${parsed.data.id}`, photo));
    if (saved === "not_found") return fail("Voucher not found.", 404);
    await refreshHolders(staff, saved.waiting);
    return Response.json(await gifts(staff.venueId));
  }, true);
}

export async function DELETE(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Delete.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Check the voucher.");
    const saved = await setVoucherPhoto(staff, parsed.data.id, null);
    if (saved === "not_found") return fail("Voucher not found.", 404);
    await refreshHolders(staff, saved.waiting);
    return Response.json(await gifts(staff.venueId));
  }, true);
}
