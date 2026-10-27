import { z } from "zod";
import { cookieOptions, makeSessionValue, signIn, STAFF_COOKIE } from "@/lib/staffAuth";
import { fail } from "@/lib/staffApi";

const Input = z.object({ email: z.email().max(160), password: z.string().min(1).max(200) });

export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Enter your email and password.");
  const staff = await signIn(parsed.data.email.toLowerCase(), parsed.data.password).catch(() => null);
  if (!staff) return fail("Wrong email or password.", 401);
  const session = makeSessionValue(staff.id);
  const res = Response.json({ name: staff.name, role: staff.role, venue: staff.venueName });
  res.headers.append("set-cookie", serialize(session.value, session.maxAge));
  return res;
}

function serialize(value: string, maxAge: number) {
  const o = cookieOptions(maxAge);
  return `${STAFF_COOKIE}=${value}; Path=${o.path}; Max-Age=${o.maxAge}; HttpOnly; SameSite=Lax${o.secure ? "; Secure" : ""}`;
}
