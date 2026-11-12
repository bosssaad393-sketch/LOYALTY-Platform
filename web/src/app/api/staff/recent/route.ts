import { db } from "@/lib/supabase";
import { withStaff } from "@/lib/staffApi";
import { bahrainDayStartIso, myDay, type DayRow } from "@/lib/staffDay";

/** The venue's last actions (first names only) and this staff member's own tally for today. */
export async function GET() {
  return withStaff(async (staff) => {
    const { data, error } = await db()
      .from("ledger")
      .select("id, kind, points, bill_bhd, created_at, staff_users(name), cards(members(name))")
      .eq("venue_id", staff.venueId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    const mine = await db()
      .from("ledger")
      .select("id, kind, card_id, bill_bhd, undoes")
      .eq("venue_id", staff.venueId)
      .eq("staff_id", staff.id)
      .gte("created_at", bahrainDayStartIso(Date.now()));
    if (mine.error) throw mine.error;
    const items = (data ?? []).map((e) => {
      const guest = (e.cards as unknown as { members: { name: string } | null } | null)?.members?.name ?? "Guest";
      return {
        id: e.id,
        kind: e.kind,
        points: e.points,
        billBhd: e.bill_bhd,
        at: e.created_at,
        by: (e.staff_users as unknown as { name: string } | null)?.name ?? "",
        guest: guest.trim().split(/\s+/)[0],
      };
    });
    return Response.json({ items, mine: myDay((mine.data ?? []) as DayRow[]) });
  });
}
