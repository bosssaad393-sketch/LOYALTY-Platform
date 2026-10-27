// Pure points rules. No database, no framework: easy to test and to read.
// The same rules are enforced in the database by supabase/migrations/0002_ledger.sql.

export const UNDO_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_BILL_BHD = 5000;

export type LedgerKind = "earn" | "redeem" | "undo" | "adjust" | "welcome";

/** Points earned for a bill: bill (BHD) x points_per_bhd, rounded down. */
export function pointsForBill(billBhd: number, pointsPerBhd: number): number {
  if (!Number.isFinite(billBhd) || billBhd <= 0 || billBhd > MAX_BILL_BHD) {
    throw new Error("invalid bill amount");
  }
  if (!Number.isInteger(pointsPerBhd) || pointsPerBhd < 1) {
    throw new Error("invalid points rate");
  }
  // Work in fils (1 BHD = 1000 fils) so 0.1 + 0.2 style float errors cannot leak in.
  const fils = Math.round(billBhd * 1000);
  return Math.floor((fils * pointsPerBhd) / 1000);
}

/** A guest can redeem once they have at least the reward goal. */
export function canRedeem(points: number, rewardGoal: number): boolean {
  return Number.isInteger(points) && points >= rewardGoal && rewardGoal > 0;
}

export type UndoCheck = { ok: true } | { ok: false; reason: string };

/** Only an earn or a redeem, not already undone, and within 10 minutes. */
export function canUndo(
  entry: { kind: LedgerKind; created_at: string | Date; alreadyUndone: boolean },
  now: Date = new Date(),
): UndoCheck {
  if (entry.kind !== "earn" && entry.kind !== "redeem") {
    return { ok: false, reason: "only earn and redeem entries can be undone" };
  }
  if (entry.alreadyUndone) return { ok: false, reason: "this entry was already undone" };
  const age = now.getTime() - new Date(entry.created_at).getTime();
  if (age > UNDO_WINDOW_MS) return { ok: false, reason: "the 10 minute undo window has passed" };
  return { ok: true };
}

/** A balance is always the sum of the ledger. It is never stored by hand. */
export function balanceFromEntries(entries: { points: number }[]): number {
  return entries.reduce((sum, e) => sum + e.points, 0);
}
