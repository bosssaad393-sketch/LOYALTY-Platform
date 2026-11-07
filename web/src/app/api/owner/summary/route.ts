import { z } from "zod";
import { db } from "@/lib/supabase";
import { bahrainDayStart, withOwner } from "@/lib/ownerApi";

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
      db().from("venues").select("name, points_per_bhd, reward_goal, reward_text").eq("id", staff.venueId).single(),
    ]);
    if (summary.error || venue.error) throw summary.error ?? venue.error;
    // Postgres bigint counts can arrive as strings; the screen expects numbers.
    const raw = summary.data as Record<string, unknown>;
    const numbers = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, k === "perDay14" ? v : Number(v)]));
    const s = Summary.parse({ ...numbers, perDay14: (raw.perDay14 as { day: string; visits: unknown }[]).map((d) => ({ day: d.day, visits: Number(d.visits) })) });
    return Response.json({ venue: venue.data, ...s });
  });
}
