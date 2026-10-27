import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { db } from "./supabase";

/**
 * Staff sessions.
 * Passwords are checked by Supabase Auth once, at sign-in. After that the staff member carries
 * our own signed cookie (staff id + expiry), checked on every request against staff_users.active.
 */

export const STAFF_COOKIE = "loyalty_staff";
const SESSION_HOURS = 12;

export type Staff = { id: string; name: string; role: "staff" | "manager" | "owner" | "developer"; venueId: string; venueSlug: string; venueName: string };

function secret(): string {
  const base = process.env.STAFF_SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("No secret available to sign staff sessions.");
  return createHmac("sha256", base).update("loyalty-staff-session-v1").digest("hex");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function makeSessionValue(staffId: string): { value: string; maxAge: number } {
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  const payload = `${staffId}.${exp}`;
  return { value: `${payload}.${sign(payload)}`, maxAge: SESSION_HOURS * 3600 };
}

function readSession(value: string | undefined): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [staffId, exp, mac] = parts;
  const expected = Buffer.from(sign(`${staffId}.${exp}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (!(Number(exp) > Date.now())) return null;
  return staffId;
}

async function loadStaff(where: { id?: string; authUser?: string }): Promise<Staff | null> {
  let q = db().from("staff_users").select("id, name, role, active, venue_id, venues(slug, name)").eq("active", true);
  q = where.id ? q.eq("id", where.id) : q.eq("auth_user", where.authUser!);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const venue = data.venues as unknown as { slug: string; name: string } | null;
  if (!venue) return null;
  return { id: data.id, name: data.name, role: data.role, venueId: data.venue_id, venueSlug: venue.slug, venueName: venue.name };
}

/** Checks email + password with Supabase Auth, then finds the active staff record. */
export async function signIn(email: string, password: string): Promise<Staff | null> {
  // A throwaway client, so the signed-in user's token never replaces the service key elsewhere.
  const auth = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  await auth.auth.signOut().catch(() => {});
  return loadStaff({ authUser: data.user.id });
}

/** The signed-in staff member for this request, or null. */
export async function currentStaff(): Promise<Staff | null> {
  const staffId = readSession((await cookies()).get(STAFF_COOKIE)?.value);
  return staffId ? loadStaff({ id: staffId }) : null;
}

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});
