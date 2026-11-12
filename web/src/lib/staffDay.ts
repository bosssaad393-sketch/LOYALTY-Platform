const DAY = 86_400_000, BAHRAIN = 3 * 3_600_000;

/** Midnight in Bahrain (UTC+3, no clock changes) for the day that holds `now`, as an ISO time. */
export const bahrainDayStartIso = (now: number) => new Date(Math.floor((now + BAHRAIN) / DAY) * DAY - BAHRAIN).toISOString();

export type DayRow = { id: number; kind: string; card_id: string; bill_bhd: number | string | null; undoes: number | null };

/** One waiter's own day: entries that still stand (undone ones are left out), guests counted by card, and the bills entered. */
export function myDay(rows: DayRow[]) {
  const undone = new Set(rows.filter((r) => r.kind === "undo").map((r) => r.undoes));
  const kept = rows.filter((r) => r.kind !== "undo" && !undone.has(r.id));
  return {
    entries: kept.length,
    guests: new Set(kept.map((r) => r.card_id)).size,
    bhd: kept.reduce((s, r) => s + (r.kind === "earn" && r.bill_bhd ? Number(r.bill_bhd) : 0), 0),
  };
}
