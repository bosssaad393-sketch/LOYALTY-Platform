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

export const undoEntry = (ledgerId: number, staffId: string) =>
  call<SpendResult>("ledger_undo", { p_entry: ledgerId, p_staff: staffId });
