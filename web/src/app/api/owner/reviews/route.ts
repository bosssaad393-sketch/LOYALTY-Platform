import { withOwner } from "@/lib/ownerApi";
import { readLinks } from "@/lib/venueLinks";
import { readGoogleReviews } from "@/lib/googleReviews";

/** The venue's Google rating and latest public reviews (read only). */
export async function GET() {
  return withOwner(async (staff) => {
    const links = await readLinks(staff.venueId);
    return Response.json(await readGoogleReviews(links.googleReview));
  });
}
