import { bridgeInbox, bridgeVenue } from "@/lib/devChat";

/** For CALABOS only (bearer token). The developer's messages that CALABOS has not answered yet. Off (404) unless CALABOS_BRIDGE_TOKEN is set. */
export async function GET(request: Request) {
  const v = await bridgeVenue(request);
  if (v instanceof Response) return v;
  try {
    return Response.json({ messages: await bridgeInbox(v.venueId) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("bridge inbox failed", e instanceof Error ? e.message : e);
    return Response.json({ error: "try again" }, { status: 500 });
  }
}
