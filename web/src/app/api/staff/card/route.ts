import { db } from "@/lib/supabase";
import { fail, guestView, withStaff } from "@/lib/staffApi";

/** Finds a guest by the 4-digit code, or by the QR text "LOYALTY:<venue>:<code>". */
export async function GET(request: Request) {
  return withStaff(async (staff) => {
    const raw = new URL(request.url).searchParams.get("code") ?? "";
    const qr = raw.match(/^LOYALTY:([a-z0-9-]+):(\d{4})$/);
    if (qr && qr[1] !== staff.venueSlug) return fail("This card belongs to another venue.", 404);
    const code = qr ? qr[2] : raw.replace(/\D/g, "");
    if (!/^\d{4}$/.test(code)) return fail("Card codes have 4 digits.");
    const { data, error } = await db().from("cards").select("id").eq("venue_id", staff.venueId).eq("code", code).maybeSingle();
    if (error) throw error;
    const guest = data ? await guestView(data.id, staff) : null;
    return guest ? Response.json(guest) : fail("No guest with that code. Check the 4 digits on the card.", 404);
  });
}
