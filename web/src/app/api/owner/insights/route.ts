import { db } from "@/lib/supabase";
import { DAY, withOwner } from "@/lib/ownerApi";
import { BUSY_WINDOW_DAYS, insights, liveVisitTimes, type InsightCard } from "@/lib/ownerInsights";

const PAGE = 1000;
const MAX_PAGES = 20;

/** Reads every row of a query in pages (Supabase returns at most 1000 rows a request). `full` is false when the cap was reached. */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<{ rows: T[]; full: boolean }> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * PAGE, i * PAGE + PAGE - 1);
    if (error) throw error;
    const part = (data ?? []) as T[];
    rows.push(...part);
    if (part.length < PAGE) return { rows, full: true };
  }
  return { rows, full: false };
}

type CardRow = { points: number; visits: number; last_visit: string | null };
type LedgerRow = { id: number; kind: string; undoes: number | null; created_at: string };

/** Guest insights for the Overview: returning rate, guests not seen lately, near a reward, reward ready, busiest weekday. */
export async function GET() {
  return withOwner(async (staff) => {
    const since = new Date(Date.now() - BUSY_WINDOW_DAYS * DAY).toISOString();
    const [venue, cards, ledger] = await Promise.all([
      db().from("venues").select("reward_goal").eq("id", staff.venueId).single(),
      allRows<CardRow>((from, to) => db().from("cards").select("points, visits, last_visit").eq("venue_id", staff.venueId).order("id", { ascending: true }).range(from, to)),
      allRows<LedgerRow>((from, to) => db().from("ledger").select("id, kind, undoes, created_at").eq("venue_id", staff.venueId).in("kind", ["earn", "undo"]).gte("created_at", since).order("id", { ascending: true }).range(from, to)),
    ]);
    if (venue.error) throw venue.error;
    const list: InsightCard[] = cards.rows.map((c) => ({ points: Number(c.points ?? 0), visits: Number(c.visits ?? 0), lastVisit: c.last_visit ?? null }));
    const goal = Number((venue.data as { reward_goal: number }).reward_goal);
    return Response.json({ ...insights(list, liveVisitTimes(ledger.rows), goal), rewardGoal: goal, complete: cards.full && ledger.full });
  });
}
