import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./supabase";

/**
 * The team join link. The owner shares one link or QR code; a new person opens it and adds themselves.
 * They stay inactive, and cannot sign in, until the owner approves them in the Team tab.
 * The link is signed, so it needs no database table, and it can only ever add a person with the staff role.
 */
export const INVITE_DAYS = 7;
/** How many people may wait for approval at once, so a leaked link cannot fill the team list. */
export const MAX_WAITING = 10;

const JOINED = "staff_self_joined";

function key(): string {
  const base = process.env.STAFF_SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("No secret available to sign join links.");
  return createHmac("sha256", base).update("loyalty-team-invite-v1").digest("hex");
}

const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

export function makeInvite(venueId: string, now = Date.now()): { token: string; expiresAt: string } {
  const exp = now + INVITE_DAYS * 86_400_000;
  const payload = `${venueId}.${exp}`;
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(exp).toISOString() };
}

/** The venue a join link belongs to, or null when the link is forged, altered or out of date. */
export function readInvite(token: string, now = Date.now()): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [venueId, exp, mac] = parts;
  const expected = Buffer.from(sign(`${venueId}.${exp}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (!(Number(exp) > now)) return null;
  return venueId;
}

/** The people waiting for approval: inactive, and joining by link is the last thing that happened to them. */
export async function waitingIds(venueId: string): Promise<Set<string>> {
  const { data: inactive, error } = await db().from("staff_users").select("id").eq("venue_id", venueId).eq("active", false);
  if (error) throw error;
  if (!inactive?.length) return new Set();
  const { data: events, error: e2 } = await db().from("audit_log").select("action, detail").eq("venue_id", venueId)
    .in("action", [JOINED, "staff_activated", "staff_deactivated"]).order("id", { ascending: false }).limit(500);
  if (e2) throw e2;
  const off = new Set(inactive.map((s) => s.id as string));
  const seen = new Set<string>();
  const waiting = new Set<string>();
  for (const e of events ?? []) {
    const who = (e.detail as { staff?: string } | null)?.staff;
    if (!who || seen.has(who)) continue;
    seen.add(who);
    if (e.action === JOINED && off.has(who)) waiting.add(who);
  }
  return waiting;
}

export const joinedEvent = (venueId: string, staffId: string, name: string) => ({ venue_id: venueId, actor: "join-link", action: JOINED, detail: { staff: staffId, name } });
