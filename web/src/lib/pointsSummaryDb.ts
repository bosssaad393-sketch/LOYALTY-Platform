import "server-only";
import { db } from "./supabase";
import { rangeStartMs, summarisePoints, type PointsLedgerRow, type PointsRange, type PointsSummary } from "./pointsSummary";

/** Supabase answers at most this many rows per request, so longer tables are read page by page. */
const PAGE = 1000;
/** Hard stop: 100 pages = 100,000 rows. Past that a summary built in memory would be slow, so it fails loudly instead of showing wrong totals. */
const MAX_PAGES = 100;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function fetchAll<T>(what: string, page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const out: T[] = [];
  for (let n = 0; n < MAX_PAGES; n++) {
    const { data, error } = await page(n * PAGE, n * PAGE + PAGE - 1);
    if (error) throw new Error(`${what}: ${error.message}`);
    const got = data ?? [];
    out.push(...got);
    if (got.length < PAGE) return out;
  }
  throw new Error(`${what}: more than ${MAX_PAGES * PAGE} rows, the summary needs a database-side total`);
}

/** Reads the venue's ledger (only the range for short ranges) and its cards, then builds the summary. No writes. */
export async function pointsSummaryFor(venueId: string, range: PointsRange, now = Date.now()): Promise<PointsSummary> {
  const since = rangeStartMs(range, now);
  const [rows, cards] = await Promise.all([
    fetchAll<PointsLedgerRow>("ledger", (from, to) => {
      let q = db().from("ledger").select("id, kind, points, bill_bhd, created_at, undoes").eq("venue_id", venueId);
      if (since !== null) q = q.gte("created_at", new Date(since).toISOString());
      return q.order("id", { ascending: true }).range(from, to);
    }),
    fetchAll<{ points: number }>("cards", (from, to) => db().from("cards").select("points").eq("venue_id", venueId).order("id", { ascending: true }).range(from, to)),
  ]);
  const held = cards.reduce((sum, c) => sum + (Number(c.points) || 0), 0);
  return summarisePoints(rows, range, now, held);
}
