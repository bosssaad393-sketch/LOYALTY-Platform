import { bridgeReply, bridgeVenue, ReplyInput } from "@/lib/devChat";

/** For CALABOS only (bearer token). Answers one developer message. */
export async function POST(request: Request) {
  const v = await bridgeVenue(request);
  if (v instanceof Response) return v;
  const parsed = ReplyInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  try {
    return (await bridgeReply(v.venueId, parsed.data)) ? Response.json({ ok: true }) : Response.json({ error: "no such message" }, { status: 404 });
  } catch (e) {
    console.error("bridge reply failed", e instanceof Error ? e.message : e);
    return Response.json({ error: "try again" }, { status: 500 });
  }
}
