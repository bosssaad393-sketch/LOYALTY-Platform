import { sampleMode } from "@/lib/demo";
import { isUuid } from "@/lib/ids";
import { sampleCardRows } from "@/lib/fakeDb";

/**
 * Sample mode only: one sample card's rows, for the page process to take in (lib/sampleSync.ts). The data is invented
 * and the card id is the same unguessable link the guest holds. On a real deployment this route does not exist (404).
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/sample/card/[id]">) {
  if (!sampleMode()) return new Response(null, { status: 404 });
  const { id } = await ctx.params;
  const rows = isUuid(id) ? sampleCardRows(id) : null;
  return rows ? Response.json(rows, { headers: { "cache-control": "no-store" } }) : new Response(null, { status: 404 });
}
