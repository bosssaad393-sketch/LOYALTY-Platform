import { db } from "@/lib/supabase";
import { bahrainDayStart, DAY, withOwner } from "@/lib/ownerApi";

export async function GET() {
  return withOwner(async (staff) => {
    const v = staff.venueId;
    const today = bahrainDayStart();
    const [cards, ledger, venue] = await Promise.all([
      db().from("cards").select("points, created_at, rewards_given").eq("venue_id", v),
      db().from("ledger").select("id, kind, created_at, undoes").eq("venue_id", v).gte("created_at", new Date(today - 29 * DAY).toISOString()),
      db().from("venues").select("name, points_per_bhd, reward_goal, reward_text").eq("id", v).single(),
    ]);
    if (cards.error || ledger.error || venue.error) throw cards.error ?? ledger.error ?? venue.error;
    const c = cards.data ?? [];
    const entries = ledger.data ?? [];
    const undone = new Set(entries.filter((e) => e.kind === "undo").map((e) => e.undoes));
    const live = entries.filter((e) => !undone.has(e.id) && e.kind !== "undo");
    const visits = live.filter((e) => e.kind === "earn");
    const perDay14 = Array.from({ length: 14 }, (_, i) => {
      const start = today - (13 - i) * DAY;
      return { day: new Date(start + 3 * 3600_000).toISOString().slice(0, 10), visits: visits.filter((e) => { const t = new Date(e.created_at).getTime(); return t >= start && t < start + DAY; }).length };
    });
    const weekAgo = today - 6 * DAY;
    return Response.json({
      venue: venue.data,
      members: c.length,
      newThisWeek: c.filter((x) => new Date(x.created_at).getTime() >= weekAgo).length,
      visits7d: visits.filter((e) => new Date(e.created_at).getTime() >= weekAgo).length,
      visitsPrev7d: visits.filter((e) => { const t = new Date(e.created_at).getTime(); return t >= weekAgo - 7 * DAY && t < weekAgo; }).length,
      pointsHeld: c.reduce((s, x) => s + x.points, 0),
      rewards30d: live.filter((e) => e.kind === "redeem").length,
      perDay14,
    });
  });
}
