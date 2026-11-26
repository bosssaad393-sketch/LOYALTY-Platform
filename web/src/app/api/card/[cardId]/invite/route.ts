import { getCardView, inviteOf, isUuid } from "@/lib/cards";
import { listVouchers } from "@/lib/vouchersDb";

/**
 * The guest's own invite link (bring a friend). The card id in the address is the guest's key, as on the card page.
 * The link carries a separate short code, never the card id, so sharing it opens nothing of the guest's.
 * 404 when the venue has no bring-a-friend gift switched on.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/card/[cardId]/invite">) {
  const { cardId } = await ctx.params;
  if (!isUuid(cardId)) return new Response(null, { status: 404 });
  const view = await getCardView(cardId);
  if (!view) return new Response(null, { status: 404 });
  if (!(await listVouchers(view.venue.id)).some((v) => v.active && v.trigger === "friend")) return new Response(null, { status: 404 });
  const code = await inviteOf(cardId);
  if (!code) return Response.json({ error: "unavailable" }, { status: 503 });
  const base = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
  return Response.json({ url: `${base}/join/${encodeURIComponent(view.venue.slug)}?r=${code}` }, { headers: { "cache-control": "no-store" } });
}
