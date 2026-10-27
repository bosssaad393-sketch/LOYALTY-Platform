// Points summary for the owner app (GET /api/owner/points). Pure: no database, no framework, easy to test.
// The route and pointsSummaryDb.ts only fetch the rows; every rule is here.
import { z } from "zod";

export const POINTS_RANGES = ["today", "7d", "30d", "all"] as const;
export type PointsRange = (typeof POINTS_RANGES)[number];

/** The `range` query value. Missing means 7d; anything that is not in the list is rejected. */
export const PointsRangeInput = z.enum(POINTS_RANGES).default("7d");

/** With range=all the per-day list covers at most this many days (the totals still cover everything). */
export const PER_DAY_CAP = 90;

const DAY = 86_400_000;
const BAHRAIN_OFFSET = 3 * 3_600_000; // UTC+3, no daylight saving
const RANGE_DAYS = { today: 1, "7d": 7, "30d": 30 } as const;

/**
 * Start of the Bahrain calendar day that contains t, as epoch ms.
 * Same formula as bahrainDayStart() in ownerApi.ts, copied here because that file is server-only
 * and this one must stay importable from unit tests.
 */
function dayStart(t: number): number {
  const shifted = t + BAHRAIN_OFFSET;
  return shifted - (((shifted % DAY) + DAY) % DAY) - BAHRAIN_OFFSET;
}

/** "2026-10-15" for the Bahrain day that starts at the given epoch ms. */
function dayKey(start: number): string {
  return new Date(start + BAHRAIN_OFFSET).toISOString().slice(0, 10);
}

/** Bills are summed in fils (1 BHD = 1000 fils) so 0.1 + 0.2 style float noise cannot leak into the total. */
function toFils(bill: number | string | null): number {
  const n = Number(bill);
  return bill === null || !Number.isFinite(n) ? 0 : Math.round(n * 1000);
}

export type PointsLedgerRow = {
  id: number | string;
  /** ledger_kind enum: earn, redeem, undo, adjust, welcome. Typed as string so a future kind cannot break the page. */
  kind: string;
  points: number;
  bill_bhd: number | string | null;
  created_at: string;
  undoes: number | string | null;
};

export type PointsDay = { day: string; issued: number; redeemed: number };

export type PointsSummary = {
  range: PointsRange;
  /** First Bahrain day of the range (range=all: the day of the first ledger entry, or today when there is none). */
  from: string;
  /** Last Bahrain day of the range: today. */
  to: string;
  issued: number;
  /** Points spent on rewards, as a positive number. */
  redeemed: number;
  /** Number of rewards given. */
  rewards: number;
  /** Number of earn entries. */
  visits: number;
  billBhd: number;
  /** Points held by guests right now (sum of cards.points). Not range dependent. */
  held: number;
  perDay: PointsDay[];
};

/**
 * First instant (epoch ms) that a ledger row can have and still be inside the range, or null for "all".
 * The route uses it to avoid reading the whole table for short ranges. An undo is always created after the
 * entry it undoes, so every undo that matters for the range is also on or after this instant.
 */
export function rangeStartMs(range: PointsRange, now: number | Date = Date.now()): number | null {
  if (range === "all") return null;
  const t = typeof now === "number" ? now : now.getTime();
  return dayStart(t) - (RANGE_DAYS[range] - 1) * DAY;
}

/**
 * How each ledger kind is treated (decision, read from supabase/migrations 0001 and 0002):
 *  - earn:    live ones count in issued, visits and billBhd.
 *  - redeem:  live ones count in redeemed (stored negative, shown positive) and rewards.
 *  - undo:    never counted. It only cancels the entry it points at (`undoes`), which then counts for nothing.
 *  - welcome: a welcome bonus is points handed to a guest with no bill and no visit. It counts in issued
 *             (so that issued minus redeemed follows what guests hold) but not in visits or billBhd.
 *             No code writes this kind yet.
 *  - adjust:  a manual correction, positive or negative. Not guest activity, so it is left out of issued
 *             and redeemed. It still moves `held`, which is read from the cards.
 *  - any other (future) kind is ignored until someone decides what it means.
 * "Live" means no other row has `undoes` pointing at it. Days are Bahrain calendar days.
 */
export function summarisePoints(
  rows: readonly PointsLedgerRow[],
  range: PointsRange,
  now: number | Date,
  held: number,
): PointsSummary {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const today = dayStart(nowMs);
  const end = today + DAY; // exclusive: nothing after today belongs in a summary

  // The undone set comes from every row we were given, whatever the dates are.
  const undone = new Set<string>();
  for (const r of rows) if (r.undoes !== null && r.undoes !== undefined) undone.add(String(r.undoes));

  // Rows with an unreadable date or a date after today are ignored.
  const dated: { row: PointsLedgerRow; t: number }[] = [];
  for (const row of rows) {
    const t = Date.parse(row.created_at);
    if (Number.isFinite(t) && t < end) dated.push({ row, t });
  }

  let first: number;
  if (range === "all") {
    let earliest = Infinity;
    for (const { t } of dated) if (t < earliest) earliest = t;
    first = earliest === Infinity ? today : dayStart(earliest);
  } else {
    first = today - (RANGE_DAYS[range] - 1) * DAY;
  }

  const perDayStart = range === "all" ? Math.max(first, today - (PER_DAY_CAP - 1) * DAY) : first;
  const dayCount = Math.round((today - perDayStart) / DAY) + 1;
  const perDay: PointsDay[] = Array.from({ length: dayCount }, (_, i) => ({ day: dayKey(perDayStart + i * DAY), issued: 0, redeemed: 0 }));

  let issued = 0;
  let redeemed = 0;
  let rewards = 0;
  let visits = 0;
  let fils = 0;

  for (const { row, t } of dated) {
    if (t < first) continue;
    if (row.kind === "undo" || undone.has(String(row.id))) continue;
    const pts = Number(row.points);
    if (!Number.isFinite(pts)) continue;
    const bucket = t >= perDayStart ? perDay[Math.floor((t - perDayStart) / DAY)] : undefined;

    if (row.kind === "earn") {
      issued += pts;
      visits += 1;
      fils += toFils(row.bill_bhd);
      if (bucket) bucket.issued += pts;
    } else if (row.kind === "welcome") {
      if (pts > 0) {
        issued += pts;
        if (bucket) bucket.issued += pts;
      }
    } else if (row.kind === "redeem") {
      const spent = Math.abs(pts);
      redeemed += spent;
      rewards += 1;
      if (bucket) bucket.redeemed += spent;
    }
    // adjust and unknown kinds: see the table above.
  }

  return {
    range,
    from: dayKey(first),
    to: dayKey(today),
    issued,
    redeemed,
    rewards,
    visits,
    billBhd: fils / 1000,
    held: Number.isFinite(held) ? held : 0,
    perDay,
  };
}
