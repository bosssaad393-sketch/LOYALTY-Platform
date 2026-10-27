import { withOwner } from "@/lib/ownerApi";
import { ACCESS } from "@/lib/roles";
import { listDeletionRequests } from "@/lib/privacyDb";
import { readTerms } from "@/lib/termsDb";

/**
 * Deletion requests and the venue's terms. Owner only.
 * Requests carry a date label, never a name or contact: the owner can erase without browsing personal data.
 */
export async function GET() {
  return withOwner(async (staff) => {
    const [requests, terms] = await Promise.all([listDeletionRequests(staff.venueId), readTerms(staff.venueId, staff.venueName)]);
    return Response.json({ requests, terms: { text: terms.text, updatedAt: terms.updatedAt, isDefault: terms.isDefault } });
  }, ACCESS.privacyView);
}
