import { z } from "zod";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { db } from "@/lib/supabase";
import { voidVoucher } from "@/lib/vouchersDb";
import { notifyAppleDevices } from "@/lib/apns";

const Input = z.object({ cardVoucherId: z.uuid() });

/** Owner or manager: cancel a voucher that was unlocked by mistake. A used voucher cannot be cancelled. */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Voucher missing.");
    const { data } = await db().from("card_vouchers").select("id, card_id, status").eq("id", parsed.data.cardVoucherId).eq("venue_id", staff.venueId).maybeSingle();
    if (!data) return fail("Voucher not found.", 404);
    if (data.status !== "issued") return fail("Only a voucher that has not been used can be cancelled.");
    await voidVoucher(parsed.data.cardVoucherId, staff.id);
    await notifyAppleDevices(String(data.card_id));
    return Response.json({ ok: true });
  });
}
