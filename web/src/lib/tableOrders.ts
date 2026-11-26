import "server-only";
import { db } from "./supabase";
import type { Staff } from "./staffAuth";

/** Visit-card venues (migration 0030): may guests order from the table's code? False on an older database. Never throws. */
export async function tableOrdersOn(venueId: string): Promise<boolean> {
  try {
    const { data, error } = await db().from("venues").select("table_orders_on").eq("id", venueId).maybeSingle();
    return !error && (data as { table_orders_on?: boolean } | null)?.table_orders_on === true;
  } catch {
    return false;
  }
}

export async function setTableOrdersOn(staff: Staff, on: boolean): Promise<void> {
  const { error } = await db().from("venues").update({ table_orders_on: on }).eq("id", staff.venueId);
  if (error) throw error;
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "table_orders_switch", detail: { on } });
}

/** Visit-card venues (migration 0031): does the table page offer "Call the waiter" and "Ask for the bill"? Never throws. */
export async function tableCallsOn(venueId: string): Promise<boolean> {
  try {
    const { data, error } = await db().from("venues").select("table_calls_on").eq("id", venueId).maybeSingle();
    return !error && (data as { table_calls_on?: boolean } | null)?.table_calls_on === true;
  } catch {
    return false;
  }
}

export async function setTableCallsOn(staff: Staff, on: boolean): Promise<void> {
  const { error } = await db().from("venues").update({ table_calls_on: on }).eq("id", staff.venueId);
  if (error) throw error;
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "table_calls_switch", detail: { on } });
}

/** Does anything reach the staff's table board at this visit-card venue (orders or calls)? */
export async function tableFloorOn(venueId: string): Promise<boolean> {
  return (await tableOrdersOn(venueId)) || (await tableCallsOn(venueId));
}
