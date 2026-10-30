import { z } from "zod";
import { areaFor, makeSessionValue, sessionCookie } from "@/lib/staffAuth";
import { fail } from "@/lib/staffApi";
import { signInWithPin } from "@/lib/pin";

const Input = z.object({ pin: z.string().regex(/^\d{4,8}$/), area: z.enum(["owner", "staff"]).optional() });

/** Sign in with a PIN (staff, manager, owner). Wrong tries are counted; too many pause sign-in for a few minutes. */
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Enter your PIN (4 to 8 digits).");
  const caller = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  const r = await signInWithPin(parsed.data.pin, caller).catch(() => null);
  if (!r) return fail("Something went wrong. Please try again.", 500);
  if (!r.ok) return r.reason === "locked" ? fail("Too many tries. Please wait a few minutes and try again.", 429) : fail("That PIN is not right.", 401);
  // A developer signs in with email and password, never with a PIN.
  if (r.staff.role === "developer") return fail("That PIN is not right.", 401);
  const area = areaFor(r.staff.role, parsed.data.area);
  const session = makeSessionValue(r.staff.id, area);
  const res = Response.json({ name: r.staff.name, role: r.staff.role, venue: r.staff.venueName });
  res.headers.append("set-cookie", sessionCookie(area, session.value, session.maxAge));
  return res;
}
