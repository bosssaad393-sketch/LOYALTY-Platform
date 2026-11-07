import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// The rounds this phone sent, so only that phone can cancel one (and only before staff accept it). Everyone at a table
// sees the table's rounds and their ids, so the list is signed: a phone cannot add someone else's round to it.
// Cookie value: "<orderId>.<sig>,<orderId>.<sig>", newest last, at most MAX entries, for one evening.

export const SENT_COOKIE = "orbyn_sent";
const MAX = 12;
const HOURS = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Null when the site has no secret: then nothing is remembered and guests simply cannot cancel (ordering still works). */
function key(): string | null {
  const base = process.env.STAFF_SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  return base ? createHmac("sha256", base).update("orbyn-guest-round-v1").digest("hex") : null;
}

const sig = (k: string, orderId: string) => createHmac("sha256", k).update(orderId).digest("base64url").slice(0, 22);

function entries(cookieHeader: string | null): string[] {
  const m = new RegExp(`(?:^|;\\s*)${SENT_COOKIE}=([^;]*)`).exec(cookieHeader ?? "");
  if (!m) return [];
  return decodeURIComponent(m[1]).split(",").filter(Boolean).slice(-MAX);
}

function verified(k: string, entry: string): string | null {
  const [id, s] = entry.split(".");
  if (!id || !s || !UUID.test(id)) return null;
  const want = Buffer.from(sig(k, id));
  const got = Buffer.from(s);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

/** The order ids this phone sent, read from a raw Cookie header. Anything unsigned or tampered with is ignored. */
export function sentOrdersFrom(cookieHeader: string | null): Set<string> {
  const k = key();
  if (!k) return new Set();
  return new Set(entries(cookieHeader).map((e) => verified(k, e)).filter((id): id is string => id !== null));
}

/** The Set-Cookie header that adds one round to this phone's list (oldest dropped past MAX). Null without a secret. */
export function rememberSentOrder(cookieHeader: string | null, orderId: string): string | null {
  const k = key();
  if (!k) return null;
  const kept = entries(cookieHeader).filter((e) => verified(k, e) !== null && !e.startsWith(`${orderId}.`));
  const value = [...kept, `${orderId}.${sig(k, orderId)}`].slice(-MAX).join(",");
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SENT_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${HOURS * 3600}; HttpOnly; SameSite=Lax${secure}`;
}
