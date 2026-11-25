import { z } from "zod";
import { db } from "@/lib/supabase";
import { bahrainDayStart, DAY, withOwner } from "@/lib/ownerApi";
import { listBranches } from "@/lib/branchesDb";
import { countOf, voucherCounts } from "@/lib/vouchersDb";

// The owner's home numbers, counted inside Postgres (migration 0015, owner_summary). Before, every card and 30 days of ledger
// rows were fetched and counted here, which stopped at Supabase's 1000-row page and moved all those rows on every load.

const Summary = z.object({
  members: z.number(),
  newThisWeek: z.number(),
  visits7d: z.number(),
  visitsPrev7d: z.number(),
  pointsHeld: z.number(),
  rewards30d: z.number(),
  perDay14: z.array(z.object({ day: z.string(), visits: z.number() })).length(14),
});

export async function GET() {
  return withOwner(async (staff) => {
    const today = new Date(bahrainDayStart()).toISOString();
    const [summary, venue] = await Promise.all([
      db().rpc("owner_summary", { p_venue: staff.venueId, p_today: today }),
      db().from("venues").select("name, points_per_bhd, reward_goal, reward_text, card_mode").eq("id", staff.venueId).single(),
    ]);
    if (summary.error || venue.error) throw summary.error ?? venue.error;
    // Postgres bigint counts can arrive as strings; the screen expects numbers.
    const raw = summary.data as Record<string, unknown>;
    const numbers = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, k === "perDay14" ? v : Number(v)]));
    const s = Summary.parse({ ...numbers, perDay14: (raw.perDay14 as { day: string; visits: unknown }[]).map((d) => ({ day: d.day, visits: Number(d.visits) })) });
    // Visit-card venues (0022) have no points: the home screen shows gifts and visits per branch instead.
    if ((venue.data as { card_mode?: string | null }).card_mode !== "visits") return Response.json({ venue: venue.data, ...s });
    const weekAgo = new Date(bahrainDayStart() - 6 * DAY).toISOString();
    const monthAgo = new Date(bahrainDayStart() - 29 * DAY).toISOString();
    const [branches, counts, used30d] = await Promise.all([
      listBranches(staff.venueId),
      voucherCounts(staff.venueId),
      countOf(db().from("card_vouchers").select("id", { count: "exact", head: true }).eq("venue_id", staff.venueId).eq("status", "redeemed").gte("redeemed_at", monthAgo)),
    ]);
    const perBranch7d = await Promise.all(branches.filter((b) => b.kind === "branch").map(async (b) => ({
      branchId: b.id,
      name: b.name,
      visits: await countOf(db().from("ledger").select("id", { count: "exact", head: true }).eq("venue_id", staff.venueId).eq("branch_id", b.id).eq("kind", "earn").gte("created_at", weekAgo)),
    })));
    const totals = Object.values(counts).reduce((t, c) => ({ unlocked: t.unlocked + c.issued, used: t.used + c.redeemed, waiting: t.waiting + c.waiting }), { unlocked: 0, used: 0, waiting: 0 });
    return Response.json({ venue: venue.data, ...s, visitCard: { giftsUnlocked: totals.unlocked, giftsUsed: totals.used, giftsWaiting: totals.waiting, giftsUsed30d: used30d, perBranch7d } });
  });
}
