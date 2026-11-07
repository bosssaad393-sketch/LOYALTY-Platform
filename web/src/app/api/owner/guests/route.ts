import { z } from "zod";
import { db } from "@/lib/supabase";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { ACCESS } from "@/lib/roles";
import { eraseCard } from "@/lib/privacyDb";

type CardRow = { id: string; code: string; points: number; visits: number; last_visit: string | null; created_at: string; members: unknown };
const shape = (c: CardRow) => ({ cardId: c.id, code: c.code, points: c.points, visits: c.visits, lastVisit: c.last_visit, joined: c.created_at, name: (c.members as { name: string } | null)?.name ?? "" });

/** Guest list: names, points and visits only. Contact details stay out of the list (CSV export only). */
export async function GET(request: Request) {
  return withOwner(async (staff) => {
    const params = new URL(request.url).searchParams;
    // ?top=3: the most loyal guests, ranked by the database across every guest (not only the latest 500).
    const top = Number(params.get("top"));
    if (Number.isInteger(top) && top > 0) {
      const { data, error } = await db()
        .from("cards")
        .select("id, code, points, visits, last_visit, created_at, members(name, deleted_at)")
        .eq("venue_id", staff.venueId)
        .gt("visits", 0)
        .order("visits", { ascending: false })
        .order("points", { ascending: false })
        .limit(Math.min(top, 10));
      if (error) throw error;
      return Response.json({ guests: ((data ?? []) as CardRow[]).map(shape).filter((g) => g.name) });
    }
    const q = (params.get("q") ?? "").trim().toLowerCase();
    const { data, error } = await db()
      .from("cards")
      .select("id, code, points, visits, last_visit, created_at, members(name, deleted_at)")
      .eq("venue_id", staff.venueId)
      .order("last_visit", { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) throw error;
    const guests = (data ?? [])
      .map((c) => ({ cardId: c.id, code: c.code, points: c.points, visits: c.visits, lastVisit: c.last_visit, joined: c.created_at, name: (c.members as unknown as { name: string } | null)?.name ?? "" }))
      .filter((g) => g.name && (!q || g.name.toLowerCase().includes(q) || g.code.includes(q)));
    return Response.json({ guests });
  });
}

const Del = z.object({ cardId: z.uuid() });

/** Erases a guest for good (PDPL): their details, card and points history. Owner only. */
export async function DELETE(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Del.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Guest missing.");
    if (!(await eraseCard(staff.venueId, parsed.data.cardId))) return fail("Guest not found.", 404);
    await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "guest_erased", detail: { card: parsed.data.cardId } });
    return Response.json({ deleted: true });
  }, ACCESS.guestErase);
}
