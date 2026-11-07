// The till's bill box. Pure, so the rules can be tested without a screen.

/** Above this a bill needs one more tap to confirm: catches 1250 typed for 12.50. */
export const LARGE_BILL_BHD = 100;
/** The database refuses earns above this (0002_ledger.sql). */
export const MAX_BILL_BHD = 5000;

export type BillState = "empty" | "bad" | "ok" | "large" | "too_large";

/** Reads what staff typed ("12.5", "12,500", "8") and says whether points can be added for it. */
export function readBill(text: string): { value: number; state: BillState } {
  const t = text.trim().replace(",", ".");
  if (!t) return { value: 0, state: "empty" };
  if (!/^\d{1,5}(\.\d{1,3})?$/.test(t)) return { value: 0, state: "bad" };
  const value = Number(t);
  if (!(value > 0)) return { value: 0, state: "bad" };
  if (value > MAX_BILL_BHD) return { value, state: "too_large" };
  return { value, state: value > LARGE_BILL_BHD ? "large" : "ok" };
}

/** The points a bill will add, by the same rule as the database (floor of BHD times the rate). */
export const pointsFor = (bhd: number, perBhd: number) => (bhd > 0 && perBhd > 0 ? Math.floor(bhd * perBhd) : 0);
