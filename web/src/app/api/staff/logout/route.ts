import { STAFF_COOKIE } from "@/lib/staffAuth";

export async function POST() {
  const res = Response.json({ ok: true });
  res.headers.append("set-cookie", `${STAFF_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  return res;
}
