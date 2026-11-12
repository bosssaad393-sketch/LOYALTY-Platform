import { withOwner } from "@/lib/ownerApi";
import { listFeedback } from "@/lib/feedback";

/** What members wrote on the counter page, newest first. */
export async function GET() {
  return withOwner(async (staff) => Response.json(await listFeedback(staff.venueId)));
}
