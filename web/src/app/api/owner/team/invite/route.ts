import { withOwner } from "@/lib/ownerApi";
import { makeInvite } from "@/lib/teamInvite";

/** A fresh join link for this venue's team. Owner only. */
export async function GET() {
  return withOwner(async (staff) => {
    const { token, expiresAt } = makeInvite(staff.venueId);
    return Response.json({ path: `/staff/join/${token}`, expiresAt }, { headers: { "cache-control": "no-store" } });
  }, true);
}
