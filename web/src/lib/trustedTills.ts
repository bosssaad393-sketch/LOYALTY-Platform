import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./supabase";
import type { Staff } from "./staffAuth";

// Trusted tills (migration 0029). A device the owner added keeps a long random key in an HttpOnly cookie; the
// database holds only its hash. With the venue's switch on, a staff PIN signs in only where that cookie is present.

export const TILL_COOKIE = "loyalty_till";
/** Browsers keep a cookie for 400 days at most; every staff sign-in on the device renews it. */
const TILL_MAX_AGE = 400 * 86_400;
const hashOf = (key: string) => createHash("sha256").update(key).digest("hex");

export function tillCookie(key: string): string {
  return `${TILL_COOKIE}=${key}; Path=/; Max-Age=${TILL_MAX_AGE}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export const clearTillCookie = () => `${TILL_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;

/** The device key in a Cookie header, or null. */
export function tillKeyFrom(cookieHeader: string | null): string | null {
  const m = (cookieHeader ?? "").match(new RegExp(`(?:^|;\\s*)${TILL_COOKIE}=([A-Za-z0-9_-]{32,64})(?:;|$)`));
  return m ? m[1] : null;
}

/** Is the venue's switch on? False on a database without 0029. Never throws. */
export async function tillsLocked(venueId: string): Promise<boolean> {
  try {
    const { data, error } = await db().from("venues").select("tills_locked").eq("id", venueId).maybeSingle();
    return !error && (data as { tills_locked?: boolean } | null)?.tills_locked === true;
  } catch {
    return false;
  }
}

/** The trusted device of THIS venue behind a key, or null. Notes that it was seen. */
export async function trustedDevice(venueId: string, key: string | null): Promise<{ id: string; name: string } | null> {
  if (!key) return null;
  const { data, error } = await db().from("trusted_devices").select("id, name, revoked_at").eq("venue_id", venueId).eq("key_hash", hashOf(key)).maybeSingle();
  if (error || !data || data.revoked_at) return null;
  await db().from("trusted_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  return { id: String(data.id), name: String(data.name) };
}

/** May a staff PIN sign in here? Yes when the switch is off, or when this device is one of the venue's tills. */
export async function staffPinAllowed(venueId: string, cookieHeader: string | null): Promise<boolean> {
  if (!(await tillsLocked(venueId))) return true;
  return (await trustedDevice(venueId, tillKeyFrom(cookieHeader)).catch(() => null)) !== null;
}

export type TillDevice = { id: string; name: string; createdAt: string; lastSeenAt: string | null; thisDevice: boolean };

export async function listTills(venueId: string, cookieHeader: string | null): Promise<TillDevice[]> {
  const { data, error } = await db().from("trusted_devices").select("id, name, key_hash, created_at, last_seen_at, revoked_at").eq("venue_id", venueId).is("revoked_at", null).order("created_at", { ascending: true });
  if (error) return [];
  const key = tillKeyFrom(cookieHeader);
  const mine = key ? hashOf(key) : null;
  return ((data ?? []) as { id: string; name: string; key_hash: string; created_at: string; last_seen_at: string | null }[]).map((d) => ({ id: d.id, name: d.name, createdAt: d.created_at, lastSeenAt: d.last_seen_at, thisDevice: d.key_hash === mine }));
}

/** Adds the device the owner is holding as a till. Returns the key for its cookie; the key is never stored. */
export async function trustThisDevice(staff: Staff, name: string): Promise<string> {
  const key = randomBytes(32).toString("base64url");
  const { error } = await db().from("trusted_devices").insert({ venue_id: staff.venueId, name, key_hash: hashOf(key), created_by: staff.id });
  if (error) throw error;
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "till_added", detail: { name } });
  return key;
}

/** Removes a till. If it was the last one, the switch goes off too, so staff are not locked out by mistake. */
export async function removeTill(staff: Staff, id: string): Promise<boolean> {
  const { data, error } = await db().from("trusted_devices").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("venue_id", staff.venueId).is("revoked_at", null).select("name");
  if (error) throw error;
  const gone = (data ?? [])[0] as { name?: string } | undefined;
  if (!gone) return false;
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "till_removed", detail: { name: gone.name } });
  const { data: left } = await db().from("trusted_devices").select("id").eq("venue_id", staff.venueId).is("revoked_at", null).limit(1);
  if (!(left ?? []).length) await db().from("venues").update({ tills_locked: false }).eq("id", staff.venueId);
  return true;
}

/** The owner's switch. It cannot go on while the venue has no till, or no staff member could sign in. */
export async function setTillsLocked(staff: Staff, on: boolean): Promise<"ok" | "no_tills"> {
  if (on) {
    const { data } = await db().from("trusted_devices").select("id").eq("venue_id", staff.venueId).is("revoked_at", null).limit(1);
    if (!(data ?? []).length) return "no_tills";
  }
  const { error } = await db().from("venues").update({ tills_locked: on }).eq("id", staff.venueId);
  if (error) throw error;
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "tills_switch", detail: { on } });
  return "ok";
}
