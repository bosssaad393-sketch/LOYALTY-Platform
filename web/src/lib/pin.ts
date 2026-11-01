import "server-only";
import { createHmac, randomInt } from "node:crypto";
import { db } from "./supabase";
import { loadStaffById, type Staff } from "./staffAuth";

/**
 * PIN sign-in. A PIN is a short secret, so it is protected by three things:
 *   1. It is stored only as a keyed hash (HMAC with a server secret). Not reversible, not checkable without the secret.
 *   2. Guessing is locked out: too many wrong tries from one caller, or too many wrong tries overall, and sign-in pauses.
 *      The counters live in the database, so they work across all server instances.
 *   3. Longer PINs for owners and managers (6+ digits), and obvious ones (0000, 1234, 111111) are refused.
 */

const WINDOW_MS = 10 * 60_000;
const PER_CALLER = 5;
const OVERALL = 30;

function key(): string {
  const base = process.env.STAFF_SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("No secret available for PINs.");
  return createHmac("sha256", base).update("loyalty-pin-v1").digest("hex");
}
const mac = (s: string) => createHmac("sha256", key()).update(s).digest("hex");

export const pinLookup = (pin: string) => mac(`pin:${pin}`);

export function minPinLength(role: Staff["role"]): number {
  return role === "staff" ? 4 : 6;
}

/** null when the PIN is acceptable, otherwise the reason in plain words. */
export function pinProblem(pin: string, role: Staff["role"]): string | null {
  if (!/^\d+$/.test(pin)) return "A PIN is digits only.";
  if (pin.length !== minPinLength(role)) return `A PIN for this role is ${minPinLength(role)} digits.`;
  if (/^(\d)\1+$/.test(pin)) return "That PIN is too easy to guess (all the same digit).";
  const d = [...pin].map(Number);
  const step = d[1] - d[0];
  if ((step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === step)) return "That PIN is too easy to guess (a run of numbers).";
  return null;
}

/** A random PIN for a role, never an easy one. */
export function generatePin(role: Staff["role"]): string {
  for (;;) {
    const len = minPinLength(role);
    const pin = String(randomInt(0, 10 ** len)).padStart(len, "0");
    if (!pinProblem(pin, role)) return pin;
  }
}

export type PinResult = { ok: true; staff: Staff } | { ok: false; reason: "locked" | "wrong" };

/** Checks a PIN. Counts failures and refuses while locked. The caller is a stable string for the caller's address. */
export async function signInWithPin(pin: string, caller: string, now = Date.now()): Promise<PinResult> {
  const who = mac(`caller:${caller}`);
  const since = new Date(now - WINDOW_MS).toISOString();
  const mine = await db().from("pin_attempts").select("id").eq("who", who).gte("at", since);
  if (mine.error) throw mine.error;
  const all = await db().from("pin_attempts").select("id").gte("at", since);
  if (all.error) throw all.error;
  if ((mine.data ?? []).length >= PER_CALLER || (all.data ?? []).length >= OVERALL) return { ok: false, reason: "locked" };

  const { data, error } = await db().from("staff_users").select("id").eq("pin_lookup", pinLookup(pin)).eq("active", true).maybeSingle();
  if (error) throw error;
  const staff = data ? await loadStaffById(data.id as string) : null;
  if (!staff) {
    await db().from("pin_attempts").insert({ who, at: new Date(now).toISOString() });
    return { ok: false, reason: "wrong" };
  }
  return { ok: true, staff };
}

/** Sets the PIN of one person of THIS venue. Returns "taken" when someone already uses it, false when the person is not in this venue. */
export async function setPin(venueId: string, staffId: string, pin: string, actor: string): Promise<true | "taken" | false> {
  const { data: person, error } = await db().from("staff_users").select("id, role").eq("id", staffId).eq("venue_id", venueId).maybeSingle();
  if (error) throw error;
  if (!person) return false;
  const lookup = pinLookup(pin);
  const { data: clash, error: e2 } = await db().from("staff_users").select("id").eq("pin_lookup", lookup).neq("id", staffId).maybeSingle();
  if (e2) throw e2;
  if (clash) return "taken";
  const { error: e3 } = await db().from("staff_users").update({ pin_lookup: lookup, pin_set_at: new Date().toISOString() }).eq("id", staffId).eq("venue_id", venueId);
  if (e3) throw e3;
  await db().from("audit_log").insert({ venue_id: venueId, actor, action: "pin_set", detail: { staff: staffId } });
  return true;
}

export async function roleOf(venueId: string, staffId: string): Promise<Staff["role"] | null> {
  const { data, error } = await db().from("staff_users").select("role").eq("id", staffId).eq("venue_id", venueId).maybeSingle();
  if (error) throw error;
  return (data?.role as Staff["role"] | undefined) ?? null;
}
