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

/**
 * One session cookie PER SCREEN, so a person can be the developer, the owner and a till user in the same browser at the same time
 * (and on the same phone) without one login getting in the way of another. A cookie is signed together with its screen name, so a
 * developer cookie can never be used on the owner screens, whatever is done with the cookie.
 */
export type Area = "staff" | "owner" | "dev";
export const AREAS: Area[] = ["staff", "owner", "dev"];
export const STAFF_COOKIE = "loyalty_staff";
export const COOKIE_NAMES: Record<Area, string> = { staff: STAFF_COOKIE, owner: "loyalty_owner", dev: "loyalty_dev" };
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

export function makeSessionValue(staffId: string, area: Area = "staff"): { value: string; maxAge: number } {
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  const payload = `${staffId}.${area}.${exp}`;
  return { value: `${payload}.${sign(payload)}`, maxAge: SESSION_HOURS * 3600 };
}

export function readSession(value: string | undefined, area: Area = "staff"): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [staffId, a, exp, mac] = parts;
  if (a !== area) return null;
  const expected = Buffer.from(sign(`${staffId}.${a}.${exp}`));
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

export const loadStaffById = (id: string) => loadStaff({ id });

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

/** The signed-in person for THIS screen (staff till, owner, or developer), or null. Each screen has its own cookie. */
export async function currentStaff(area: Area = "staff"): Promise<Staff | null> {
  const staffId = readSession((await cookies()).get(COOKIE_NAMES[area])?.value, area);
  return staffId ? loadStaff({ id: staffId }) : null;
}

/** Which screen a sign-in belongs to. An explicit choice wins; otherwise the role decides (developer, owner/manager, staff). */
export function areaFor(role: Staff["role"], asked?: string | null): Area {
  if (role === "developer") return "dev";
  if (asked === "owner" || asked === "staff") return asked;
  return role === "owner" || role === "manager" ? "owner" : "staff";
}

/** The Set-Cookie header text that stores a session for one screen. */
export function sessionCookie(area: Area, value: string, maxAge: number): string {
  const o = cookieOptions(maxAge);
  return `${COOKIE_NAMES[area]}=${value}; Path=${o.path}; Max-Age=${o.maxAge}; HttpOnly; SameSite=Lax${o.secure ? "; Secure" : ""}`;
}

export const clearCookie = (area: Area): string => `${COOKIE_NAMES[area]}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});
