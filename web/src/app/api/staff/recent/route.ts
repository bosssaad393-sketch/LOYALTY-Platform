import { db } from "@/lib/supabase";
import { withStaff } from "@/lib/staffApi";
import { bahrainDayStartIso, myDay, type DayRow } from "@/lib/staffDay";

/** The venue's actions today, newest first (first names only), and this staff member's own tally for today. */
export async function GET() {
  return withStaff(async (staff) => {
    const { data, error } = await db()
      .from("ledger")
      .select("id, kind, points, bill_bhd, created_at, staff_users(name), cards(members(name))")
      .eq("venue_id", staff.venueId)
      // The screen is titled "Today": yesterday's entries shown with only a time would read as today's.
      .gte("created_at", bahrainDayStartIso(Date.now()))
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
    // Gifts used today (migration 0022) are not ledger entries: a partner counter that only takes gifts would
    // otherwise always read "0 entries". Best effort: a venue without vouchers simply has none.
    const since = bahrainDayStartIso(Date.now());
    const used = await db().from("card_vouchers").select("id, card_id, redeemed_at, redeemed_by").eq("venue_id", staff.venueId).eq("status", "redeemed").gte("redeemed_at", since);
    const gifts = used.error ? [] : ((used.data ?? []) as { id: string; card_id: string; redeemed_at: string; redeemed_by: string | null }[]);
    const day = myDay((mine.data ?? []) as DayRow[]);
    const myGifts = gifts.filter((g) => g.redeemed_by === staff.id);
    const kept = ((mine.data ?? []) as DayRow[]).filter((r) => r.kind !== "undo");
    const guests = new Set([...kept.map((r) => r.card_id), ...myGifts.map((g) => g.card_id)]);
    const giftItems = gifts.map((g) => ({ id: `g-${g.id}`, kind: "gift", points: 0, billBhd: null, at: g.redeemed_at, by: "", guest: "" }));
    const all = [...items, ...giftItems].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 20);
    return Response.json({ items: all, mine: { ...day, entries: day.entries + myGifts.length, guests: Math.max(day.guests, guests.size) } });
  });
}
