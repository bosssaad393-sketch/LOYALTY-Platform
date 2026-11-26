import { z } from "zod";
import { areaFor, makeSessionValue, sessionCookie } from "@/lib/staffAuth";
import { fail } from "@/lib/staffApi";
import { signInWithPin } from "@/lib/pin";
import { brandVenue } from "@/lib/brand";
import { getVenue } from "@/lib/supabase";
import { staffPinAllowed, tillCookie, tillKeyFrom } from "@/lib/trustedTills";

// venue: the venue this screen belongs to (the till and owner screens send it). Without it, the deployment's own venue.
const Input = z.object({ pin: z.string().regex(/^\d{4,6}$/), area: z.enum(["owner", "staff"]).optional(), venue: z.string().regex(/^[a-z0-9-]{1,60}$/).optional() });

/** Sign in with a PIN (staff, manager, owner). Wrong tries are counted; too many pause sign-in for a few minutes. */
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Enter your PIN.");
  // Trusted tills (0029): with the venue's switch on, a staff PIN (four digits) signs in only on a device the owner
  // added. This is decided BEFORE the PIN is looked at, so an unknown device learns nothing about any PIN.
  // The owner's and a manager's PIN (six digits) are never held to it, so the owner cannot be locked out.
  const cookieHeader = request.headers.get("cookie");
  if (parsed.data.pin.length === 4) {
    // Any failure to read the venue or the rule leaves the sign-in as it was before this rule existed.
    const venue = await Promise.resolve().then(() => getVenue(parsed.data.venue ?? brandVenue())).catch(() => null);
    if (venue && !(await staffPinAllowed(venue.id, cookieHeader).catch(() => true))) {
      return fail("This device is not one of the venue's tills. Ask the owner to add it.", 403);
    }
  }
  const caller = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  const r = await signInWithPin(parsed.data.pin, caller, parsed.data.venue ?? brandVenue()).catch(() => null);
  if (!r) return fail("Something went wrong. Please try again.", 500);
  if (!r.ok) return r.reason === "locked" ? fail("Too many tries. Please wait a few minutes and try again.", 429) : fail("That PIN is not right.", 401);
  // A developer signs in with email and password, never with a PIN.
  if (r.staff.role === "developer") return fail("That PIN is not right.", 401);
  // A staff login with a longer PIN (not issued by this app) is held to the same rule, without saying the PIN was right.
  if (r.staff.role === "staff" && !(await staffPinAllowed(r.staff.venueId, cookieHeader).catch(() => true))) return fail("That PIN is not right.", 401);
  const area = areaFor(r.staff.role, parsed.data.area);
  const session = makeSessionValue(r.staff.id, area);
  const res = Response.json({ name: r.staff.name, role: r.staff.role, venue: r.staff.venueName });
  res.headers.append("set-cookie", sessionCookie(area, session.value, session.maxAge));
  // A till keeps its place: each sign-in on it renews the device cookie for another 400 days.
  const till = tillKeyFrom(cookieHeader);
  if (till) res.headers.append("set-cookie", tillCookie(till));
  return res;
}
