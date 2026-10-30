import { AREAS, clearCookie, type Area } from "@/lib/staffAuth";

/** Signs out of ONE screen. The screen comes from the request ({"area":"owner"}) or from the page it was sent from; if neither is known, all three are cleared. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { area?: string } | null;
  let area: Area | null = AREAS.find((a) => a === body?.area) ?? null;
  if (!area) {
    try {
      const path = new URL(request.headers.get("referer") ?? "", "http://x").pathname;
      area = path.startsWith("/dev") ? "dev" : path.startsWith("/owner") ? "owner" : path.startsWith("/staff") ? "staff" : null;
    } catch {
      /* unknown screen */
    }
  }
  const res = Response.json({ ok: true });
  for (const a of area ? [area] : AREAS) res.headers.append("set-cookie", clearCookie(a));
  return res;
}
