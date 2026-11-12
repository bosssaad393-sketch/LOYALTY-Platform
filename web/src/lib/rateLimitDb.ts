import "server-only";
import { createHmac } from "node:crypto";
import { db } from "./supabase";
import { clientKey } from "./rateLimit";

// Rate limits counted in the database (migration 0014, function rate_hit), so they hold across every server instance.
// rateLimit.ts (in memory) stays for cheap per-instance smoothing; this is the one that actually stops a script.
//
// Fail open: if the database cannot answer, the request goes through and the problem is logged. A limiter outage must not
// lock guests out of joining or staff out of the till; the request itself still needs the database anyway.

export type Limit = { bucket: string; max: number; windowSeconds: number };

/** A keyed hash, so addresses and emails are never stored in the clear. Same input, same bucket, across instances. */
export function hashed(kind: string, value: string): string {
  const base = process.env.STAFF_SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const key = createHmac("sha256", base).update("orbyn-rate-v1").digest();
  return `${kind}:${createHmac("sha256", key).update(value.trim().toLowerCase()).digest("base64url").slice(0, 32)}`;
}

/** The caller's address as a bucket part (hashed). */
export const callerBucket = (headers: Headers) => hashed("ip", clientKey(headers));

/** True when this request is allowed. Every limit is checked in order and counted; the first one over its limit refuses. */
export async function allowed(...limits: Limit[]): Promise<boolean> {
  for (const l of limits) {
    try {
      const { data, error } = await db().rpc("rate_hit", { p_bucket: l.bucket, p_limit: l.max, p_window_seconds: l.windowSeconds });
      if (error) throw new Error(error.message);
      if (data === false) return false;
    } catch (e) {
      console.error("rate limit check failed (allowing)", l.bucket.split(":")[0], e instanceof Error ? e.message : e);
    }
  }
  return true;
}

/** The limits used by the public routes, in one place so they can be read and tuned together. */
export const LIMITS = {
  /** Guest sign-up: a person joins once; a family on one Wi-Fi a few times. */
  joinPerCaller: (headers: Headers): Limit => ({ bucket: `join:${callerBucket(headers)}`, max: 5, windowSeconds: 10 * 60 }),
  /** All sign-ups at one venue. A busy night is far below this; a script filling the 9000 card codes is not. */
  joinPerVenue: (venueId: string): Limit => ({ bucket: `join:venue:${venueId}`, max: 300, windowSeconds: 60 * 60 }),
  /** Email + password tries for one account (the developer signs in this way). */
  loginPerEmail: (email: string): Limit => ({ bucket: `login:${hashed("email", email)}`, max: 5, windowSeconds: 15 * 60 }),
  /** Email + password tries from one address, across accounts. */
  loginPerCaller: (headers: Headers): Limit => ({ bucket: `login:${callerBucket(headers)}`, max: 20, windowSeconds: 15 * 60 }),
  /** Feedback from one loyalty card: a guest rates a visit, not every minute. */
  feedbackPerCard: (cardId: string): Limit => ({ bucket: `feedback:${cardId}`, max: 3, windowSeconds: 24 * 60 * 60 }),
  /** Feedback from one address, across cards. */
  feedbackPerCaller: (headers: Headers): Limit => ({ bucket: `feedback:${callerBucket(headers)}`, max: 10, windowSeconds: 60 * 60 }),
} as const;
