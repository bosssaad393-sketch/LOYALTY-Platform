import "server-only";
import { fail } from "./staffApi";
import { withOwner } from "./ownerApi";
import { ACCESS } from "./roles";
import { isOfferId } from "./offers";
import { OfferError, withdrawOffer } from "./offersDb";

/**
 * Everything POST /api/owner/offers/[id]/withdraw does, as a function of the id in the address.
 * The route file only passes the id in; keeping the rest here lets the tests run it without Next.js.
 *   401 not signed in, 403 not the owner, 400 the id is not a uuid,
 *   404 not an offer of this venue, 409 already withdrawn, 200 { ok: true, withdrawnAt }.
 */
export async function withdrawOfferResponse(id: string): Promise<Response> {
  return withOwner(async (staff) => {
    if (!isOfferId(id)) return fail("That message id is not valid.");
    try {
      const { withdrawnAt } = await withdrawOffer(staff, id);
      return Response.json({ ok: true, withdrawnAt });
    } catch (err) {
      if (err instanceof OfferError) return fail(err.message, err.status);
      throw err;
    }
  }, ACCESS.offersWithdraw);
}
