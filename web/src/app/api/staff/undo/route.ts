import { z } from "zod";
import { db } from "@/lib/supabase";
import { undoEntry } from "@/lib/ledgerDb";
import { fail, guestView, refreshWalletCards, withStaff } from "@/lib/staffApi";

const Input = z.object({ ledgerId: z.number().int().positive() });

export async function POST(request: Request) {
  return withStaff(async (staff) => {
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Nothing to undo.");
    // Staff may undo their own entries; managers and owners may undo anyone's.
    const { data: entry, error } = await db().from("ledger").select("card_id, staff_id").eq("id", parsed.data.ledgerId).eq("venue_id", staff.venueId).maybeSingle();
    if (error) throw error;
    if (!entry) return fail("Entry not found.", 404);
    if (staff.role === "staff" && entry.staff_id !== staff.id) return fail("You can only undo your own entries.", 403);
    const r = await undoEntry(parsed.data.ledgerId, staff.id);
    await refreshWalletCards(entry.card_id, r.new_balance);
    return Response.json({ guest: await guestView(entry.card_id, staff) });
  });
}
