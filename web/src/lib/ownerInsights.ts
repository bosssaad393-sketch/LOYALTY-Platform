// What the owner's Overview says about the guests, worked out from the cards and the visit times. Pure, so it can be tested on its own.

const DAY = 86_400_000;
const BAHRAIN = 3 * 3600_000;

/** A guest counts as "not seen" after this many days without a visit. */
export const LAPSED_DAYS = 30;
/** "Near a reward" means this share of the goal or more, but not there yet. */
export const NEAR_SHARE = 0.8;
/** The busiest weekday is counted over this many days back. */
export const BUSY_WINDOW_DAYS = 90;

export type InsightCard = { points: number; visits: number; lastVisit: string | null };

export type Insights = {
  /** Guests with at least one visit. */
  visited: number;
  /** Of those, guests who came back at least once. */
  returning: number;
  /** returning / visited as a whole percent. Null when nobody has visited yet. */
  returningRate: number | null;
  /** Visited before, but not in the last LAPSED_DAYS days. */
  lapsed: number;
  nearReward: number;
  rewardReady: number;
  /** 0 = Sunday ... 6 = Saturday, in Bahrain time. Null when there are no visits in the window. */
  busiest: { weekday: number; visits: number; share: number } | null;
};

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function insights(cards: InsightCard[], visitTimes: string[], rewardGoal: number, now = Date.now()): Insights {
  const seen = cards.filter((c) => c.visits > 0);
  const returning = seen.filter((c) => c.visits >= 2).length;
  const cutoff = now - LAPSED_DAYS * DAY;
  const goal = rewardGoal > 0 ? rewardGoal : null;

  const perDay = [0, 0, 0, 0, 0, 0, 0];
  let total = 0;
  for (const at of visitTimes) {
    const t = new Date(at).getTime();
    if (Number.isNaN(t) || t > now || t < now - BUSY_WINDOW_DAYS * DAY) continue;
    perDay[new Date(t + BAHRAIN).getUTCDay()] += 1;
    total += 1;
  }
  const top = Math.max(...perDay);

  return {
    visited: seen.length,
    returning,
    returningRate: seen.length ? Math.round((returning / seen.length) * 100) : null,
    lapsed: seen.filter((c) => c.lastVisit !== null && new Date(c.lastVisit).getTime() < cutoff).length,
    nearReward: goal ? cards.filter((c) => c.points >= goal * NEAR_SHARE && c.points < goal).length : 0,
    rewardReady: goal ? cards.filter((c) => c.points >= goal).length : 0,
    busiest: total > 0 ? { weekday: perDay.indexOf(top), visits: top, share: Math.round((top / total) * 100) } : null,
  };
}

type LedgerRow = { id: number | string; kind: string; undoes: number | string | null; created_at: string };

/** The times of the visits that still stand: earn rows that no undo row cancels. */
export function liveVisitTimes(rows: LedgerRow[]): string[] {
  const undone = new Set(rows.filter((r) => r.kind === "undo" && r.undoes !== null).map((r) => String(r.undoes)));
  return rows.filter((r) => r.kind === "earn" && !undone.has(String(r.id))).map((r) => r.created_at);
}
