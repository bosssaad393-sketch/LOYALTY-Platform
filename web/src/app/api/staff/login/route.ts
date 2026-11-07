import { z } from "zod";
import { areaFor, makeSessionValue, sessionCookie, signIn } from "@/lib/staffAuth";
import { fail } from "@/lib/staffApi";
import { allowed, LIMITS } from "@/lib/rateLimitDb";

const Input = z.object({ email: z.email().max(160), password: z.string().min(1).max(200), area: z.enum(["owner", "staff"]).optional() });

/** Email + password sign-in. The session is stored for ONE screen: the developer screen for a developer, otherwise the owner or staff screen. */
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Enter your email and password.");
  // Counted in the database, before the password is tried: 5 tries per account and 20 per address in 15 minutes.
  // Supabase Auth only sees this server's address, so its own per-address limit cannot tell callers apart.
  const email = parsed.data.email.toLowerCase();
  if (!(await allowed(LIMITS.loginPerEmail(email), LIMITS.loginPerCaller(request.headers)))) {
    return fail("Too many tries. Please wait 15 minutes and try again.", 429);
  }
  const staff = await signIn(email, parsed.data.password).catch(() => null);
  if (!staff) return fail("Wrong email or password.", 401);
  const area = areaFor(staff.role, parsed.data.area);
  const session = makeSessionValue(staff.id, area);
  const res = Response.json({ name: staff.name, role: staff.role, venue: staff.venueName });
  res.headers.append("set-cookie", sessionCookie(area, session.value, session.maxAge));
  return res;
}
