import { db } from "@/lib/supabase";
import { fail, guestView, withStaff } from "@/lib/staffApi";
import { parseQr, proofOk } from "@/lib/cardQr";
import { allowed, LIMITS } from "@/lib/rateLimitDb";

/**
 * Finds a guest by the 4-digit code, or by the QR text "LOYALTY:<venue>:<code>[:<proof>]".
 * `verified` = the QR carried a valid proof, so this is the guest's own card and not a guessed code (lib/cardQr.ts).
 */
export async function GET(request: Request) {
  return withStaff(async (staff) => {
    // A till looks up a few cards a minute. Hundreds in ten minutes is someone walking through the codes.
    if (!(await allowed(LIMITS.cardLookupPerStaff(staff.id)))) return fail("Too many lookups. Please wait a few minutes.", 429);
    const raw = new URL(request.url).searchParams.get("code") ?? "";
    const qr = parseQr(raw);
    if (qr && qr.venueSlug !== staff.venueSlug) return fail("This card belongs to another venue.", 404);
    const code = qr ? qr.code : raw.replace(/\D/g, "");
    if (!/^\d{4}$/.test(code)) return fail("Card codes have 4 digits.");
    const { data, error } = await db().from("cards").select("id").eq("venue_id", staff.venueId).eq("code", code).maybeSingle();
    if (error) throw error;
    // A QR with a proof that does not match is a made-up QR: answer as if there were no such card.
    if (data && qr?.proof && !proofOk(String(data.id), qr.proof)) return fail("This card could not be verified. Ask the guest to open their own card.", 404);
    const guest = data ? await guestView(data.id, staff) : null;
    return guest ? Response.json({ ...guest, verified: Boolean(qr?.proof) }) : fail("No guest with that code. Check the 4 digits on the card.", 404);
  });
}
