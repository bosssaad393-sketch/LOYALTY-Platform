import { bridgeVenue } from "@/lib/devChat";
import { AdminInput, runAdmin } from "@/lib/calabosAdmin";

/** For CALABOS only (bearer token). The few actions Saad can ask CALABOS to do on this platform. See lib/calabosAdmin.ts. */
export async function POST(request: Request) {
  const v = await bridgeVenue(request);
  if (v instanceof Response) return v;
  const parsed = AdminInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request: check the action and its fields" }, { status: 400 });
  try {
    const r = await runAdmin(parsed.data, v.venueId);
    return r.ok ? Response.json(r.data, { headers: { "cache-control": "no-store" } }) : Response.json({ error: r.error }, { status: 422 });
  } catch (e) {
    console.error("calabos admin failed", e instanceof Error ? e.message : e);
    return Response.json({ error: "try again" }, { status: 500 });
  }
}
