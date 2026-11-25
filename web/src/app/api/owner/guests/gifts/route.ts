import { z } from "zod";
import { db } from "@/lib/supabase";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { cardVouchers, giveVoucher, listVouchers } from "@/lib/vouchersDb";
import { notifyAppleDevices } from "@/lib/apns";
import { voucherState, type CardVoucher } from "@/lib/vouchers";

/** Each gift with its state worked out here (ready, used, expired, cancelled), so the screen does not read the clock. */
const withState = (gifts: CardVoucher[]) => gifts.map((g) => ({ ...g, state: voucherState(g) }));

/** The gifts on one guest's card, and the gifts that can still be given to them. Owner and manager. */
export async function GET(request: Request) {
  return withOwner(async (staff) => {
    const cardId = new URL(request.url).searchParams.get("cardId") ?? "";
    if (!z.uuid().safeParse(cardId).success) return fail("Guest missing.");
    const { data: card } = await db().from("cards").select("id").eq("id", cardId).eq("venue_id", staff.venueId).maybeSingle();
    if (!card) return fail("Guest not found.", 404);
    const [gifts, all] = await Promise.all([cardVouchers(cardId, staff.venueId), listVouchers(staff.venueId)]);
    const held = new Set(gifts.map((g) => g.voucherId));
    return Response.json({ gifts: withState(gifts), canGive: all.filter((v) => v.active && !held.has(v.id)).map((v) => ({ id: v.id, title: v.title, titleAr: v.titleAr })) });
  });
}

const Give = z.object({ cardId: z.uuid(), voucherId: z.uuid() });

/** Puts a gift on one guest's card by hand. Owner and manager; named in the activity log. */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Give.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Choose a guest and a gift.");
    const r = await giveVoucher(staff, parsed.data.cardId, parsed.data.voucherId);
    if (r === "no_card") return fail("Guest not found.", 404);
    if (r === "no_gift") return fail("That gift is not available.", 404);
    if (r === "has_it") return fail("This guest already had that gift. A guest gets each gift once.", 409);
    await notifyAppleDevices(parsed.data.cardId);
    return Response.json({ gifts: withState(await cardVouchers(parsed.data.cardId, staff.venueId)) });
  });
}
