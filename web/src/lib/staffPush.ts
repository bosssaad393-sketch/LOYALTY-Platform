import "server-only";
import { createECDH, createPrivateKey } from "node:crypto";
import jwt from "jsonwebtoken";
import { db } from "./supabase";
import type { Staff } from "./staffAuth";
import { alertText, pushHostOk, type AlertText, type Waiting } from "./staffAlerts";

// Alerts on staff phones (migration 0031), by the Web Push standard. The push carries NO text: it only wakes the
// device, whose own sign-in then reads what is waiting (GET /api/staff/alerts). So nothing about a guest ever passes
// through a phone maker's push service, and no message needs encrypting.

type Keys = { publicKey: string; privateKey: string };
let cached: Keys | null = null;

/** A new P-256 key pair in the format browsers expect (the public point and the private number, base64url). */
export function newPushKeys(): Keys {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const d = ecdh.getPrivateKey();
  return { publicKey: ecdh.getPublicKey().toString("base64url"), privateKey: Buffer.concat([Buffer.alloc(32 - d.length), d]).toString("base64url") };
}

const wellFormed = (k: Keys) => Buffer.from(k.publicKey, "base64url").length === 65 && Buffer.from(k.privateKey, "base64url").length === 32;

/**
 * The key pair alerts are signed with: the server's settings (PUSH_VAPID_PUBLIC / PUSH_VAPID_PRIVATE) when set,
 * otherwise one kept in the database, made the first time it is needed. Null when neither works.
 */
export async function pushKeys(): Promise<Keys | null> {
  if (cached) return cached;
  const env = { publicKey: (process.env.PUSH_VAPID_PUBLIC ?? "").trim(), privateKey: (process.env.PUSH_VAPID_PRIVATE ?? "").trim() };
  if (env.publicKey && env.privateKey) return wellFormed(env) ? (cached = env) : null;
  try {
    const read = async () => {
      const { data, error } = await db().from("push_keys").select("public_key, private_key").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data ? { publicKey: String(data.public_key), privateKey: String(data.private_key) } : null;
    };
    let keys = await read();
    if (!keys) {
      const made = newPushKeys();
      await db().from("push_keys").insert({ id: 1, public_key: made.publicKey, private_key: made.privateKey });
      keys = (await read()) ?? made; // another server may have made it first: use the one that is stored
    }
    return wellFormed(keys) ? (cached = keys) : null;
  } catch {
    return null;
  }
}

/** For tests. */
export const forgetPushKeys = () => { cached = null; };

/** The Authorization header a push service checks: a short-lived token for that service, signed with our key. */
export function vapidHeader(endpoint: string, keys: Keys, now: number = Date.now()): string {
  const pub = Buffer.from(keys.publicKey, "base64url");
  const key = createPrivateKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33, 65).toString("base64url"), d: keys.privateKey } });
  const subject = process.env.PUSH_SUBJECT || process.env.PUBLIC_BASE_URL || "https://orbyn.co";
  const token = jwt.sign({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }, key, { algorithm: "ES256", noTimestamp: true });
  return `vapid t=${token}, k=${keys.publicKey}`;
}

export type PushInput = { endpoint: string; keys?: { p256dh?: string; auth?: string } };

/** Remembers this staff member's device. One row per device address; a device that signs in elsewhere moves with it. */
export async function subscribe(staff: Staff, input: PushInput): Promise<boolean> {
  if (!pushHostOk(input.endpoint)) return false;
  await db().from("push_subscriptions").delete().eq("endpoint", input.endpoint);
  const { error } = await db().from("push_subscriptions").insert({ venue_id: staff.venueId, staff_id: staff.id, endpoint: input.endpoint, p256dh: input.keys?.p256dh ?? null, auth: input.keys?.auth ?? null });
  if (error) throw error;
  return true;
}

export async function unsubscribe(staff: Staff, endpoint: string): Promise<void> {
  await db().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("venue_id", staff.venueId);
}

export async function isSubscribed(staff: Staff, endpoint: string): Promise<boolean> {
  const { data } = await db().from("push_subscriptions").select("id").eq("endpoint", endpoint).eq("venue_id", staff.venueId).limit(1);
  return ((data ?? []) as unknown[]).length > 0;
}

/**
 * Wakes every staff device of the venue that asked for alerts. Best effort and short: it never throws and never holds
 * a guest's request for more than a few seconds. A device whose address is gone (the app was removed) is forgotten.
 */
export async function notifyStaff(venueId: string): Promise<{ sent: number; gone: number }> {
  const out = { sent: 0, gone: 0 };
  try {
    const keys = await pushKeys();
    if (!keys) return out;
    const { data, error } = await db().from("push_subscriptions").select("id, endpoint").eq("venue_id", venueId).limit(60);
    if (error) return out;
    await Promise.allSettled(((data ?? []) as { id: string; endpoint: string }[]).map(async (s) => {
      if (!pushHostOk(s.endpoint)) return;
      const res = await fetch(s.endpoint, { method: "POST", headers: { authorization: vapidHeader(s.endpoint, keys), ttl: "120", urgency: "high", "content-length": "0" }, signal: AbortSignal.timeout(4000) });
      if (res.status === 404 || res.status === 410) {
        await db().from("push_subscriptions").delete().eq("id", s.id);
        out.gone++;
      } else if (res.status < 300) out.sent++;
    }));
  } catch { /* best effort */ }
  return out;
}

/** What is waiting at the venue right now, for the alert a device shows when it is woken. */
export async function waitingNow(venueId: string): Promise<Waiting> {
  const out: Waiting = { calls: [], newOrders: [], bookings: 0 };
  try {
    const [tables, calls, orders, bookings] = await Promise.all([
      db().from("venue_tables").select("id, label").eq("venue_id", venueId),
      db().from("table_requests").select("table_id, kind, created_at").eq("venue_id", venueId).is("handled_at", null).order("created_at", { ascending: true }).limit(20),
      db().from("orders").select("table_id, created_at").eq("venue_id", venueId).eq("status", "new").order("created_at", { ascending: true }).limit(20),
      db().from("bookings").select("id").eq("venue_id", venueId).eq("status", "pending").gte("at", new Date().toISOString()).limit(50),
    ]);
    const label = new Map(((tables.data ?? []) as { id: string; label: string }[]).map((t) => [t.id, t.label]));
    out.calls = ((calls.data ?? []) as { table_id: string; kind: string }[]).map((c) => ({ table: label.get(c.table_id) ?? "?", kind: c.kind }));
    out.newOrders = [...new Set(((orders.data ?? []) as { table_id: string }[]).map((o) => label.get(o.table_id) ?? "?"))];
    out.bookings = ((bookings.data ?? []) as unknown[]).length;
  } catch { /* an older database: nothing to list */ }
  return out;
}

export async function alertFor(staff: Staff): Promise<AlertText> {
  return alertText(staff.venueName, await waitingNow(staff.venueId));
}
