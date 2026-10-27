import { withdrawOfferResponse } from "@/lib/offersApi";

/**
 * Withdraws a sent offer: it stays in the list as history but stops showing on Wallet cards (Apple; see withdrawOffer
 * in lib/offersDb.ts for what Google does). Owner only, no body. A notification that already reached a phone cannot
 * be recalled. 400 bad id, 404 not an offer of this venue, 409 already withdrawn. The logic is in lib/offersApi.ts.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/owner/offers/[id]/withdraw">) {
  const { id } = await ctx.params;
  return withdrawOfferResponse(id);
}
