import "server-only";
import { db } from "./supabase";

// Thin wrappers over the database functions in 0002_ledger.sql.
// All rules live in the database, so a bug here cannot create or lose points.

export type EarnResult = { ledger_id: number; points_added: number; new_balance: number };
export type SpendResult = { ledger_id: number; new_balance: number };

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error(`${fn} returned nothing`);
  return row as T;
}

export const earnPoints = (cardId: string, staffId: string, billBhd: number) =>
  call<EarnResult>("ledger_earn", { p_card: cardId, p_staff: staffId, p_bill: billBhd });

export const redeemReward = (cardId: string, staffId: string) =>
  call<SpendResult>("ledger_redeem", { p_card: cardId, p_staff: staffId });

/** The guest spends their own points from their table page: no staff member on the entry. The database checks the balance. */
export const redeemByGuest = (cardId: string) => call<SpendResult>("ledger_redeem_guest", { p_card: cardId });

export const undoEntry = (ledgerId: number, staffId: string) =>
  call<SpendResult>("ledger_undo", { p_entry: ledgerId, p_staff: staffId });

export type PosSaleResult = { ledger_id: number; points_added: number; new_balance: number; duplicate: boolean };
export type PosRefundResult = { ledger_id: number; points_removed: number; new_balance: number; duplicate: boolean };

/** A sale from the POS: points for that receipt, once (a repeated receipt answers `duplicate`). The card is found by its code inside the venue. */
export const posSale = (venueId: string, code: string, billBhd: number, receipt: string) =>
  call<PosSaleResult>("ledger_pos_sale", { p_venue: venueId, p_code: code, p_bill: billBhd, p_receipt: receipt });

/** A refund from the POS: takes back that receipt's points, once. */
export const posRefund = (venueId: string, receipt: string) => call<PosRefundResult>("ledger_pos_refund", { p_venue: venueId, p_receipt: receipt });

/** Owner adds (delta > 0) or removes (delta < 0) points on one card, with a reason. The database checks the owner, the venue, the limits and the balance. */
export const adjustPoints = (cardId: string, staffId: string, delta: number, reason: string) =>
  call<SpendResult>("ledger_adjust", { p_card: cardId, p_staff: staffId, p_delta: delta, p_reason: reason });
