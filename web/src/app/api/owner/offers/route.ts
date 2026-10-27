import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { ACCESS } from "@/lib/roles";
import { OfferInput } from "@/lib/offers";
import { OfferError, offersOverview, sendOffer } from "@/lib/offersDb";

/** How many guests agreed to offers, and the offers sent so far (newest first, 20). Owner and manager. */
export async function GET() {
  return withOwner(async (staff) => Response.json(await offersOverview(staff.venueId)), ACCESS.offersView);
}

/** Sends an offer to the Wallet cards of guests who agreed to receive them. Owner only. */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = OfferInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Write a short message (up to 200 characters).");
    try {
      return Response.json(await sendOffer(staff, parsed.data));
    } catch (err) {
      if (err instanceof OfferError) return fail(err.message, err.status);
      throw err;
    }
  }, ACCESS.offersSend);
}
