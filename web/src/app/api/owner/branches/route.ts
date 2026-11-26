import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { BranchInput, listBranches, saveBranch } from "@/lib/branchesDb";
import { pinOfMapsLink } from "@/lib/mapsPin";

/** The business's places (branches and partner counters), switched-off ones included. */
export async function GET() {
  return withOwner(async (staff) => Response.json({ branches: await listBranches(staff.venueId, { includeInactive: true }) }));
}

/** Owner only: add a place, or change one (send its id). */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = BranchInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Check the branch: a name, https links, a Google link for reviews, and a location as two numbers.");
    // No numbers typed but a Google Maps link pasted: the pin is read from the link, so the owner pastes one thing.
    const input = parsed.data;
    let pinFound = false;
    if (input.lat === null && input.lng === null && input.mapsUrl) {
      const pin = await pinOfMapsLink(input.mapsUrl);
      if (pin) { input.lat = pin.lat; input.lng = pin.lng; pinFound = true; }
    }
    const saved = await saveBranch(staff, input);
    if (saved === "not_found") return fail("Branch not found.", 404);
    if (saved === "half_location") return fail("A location needs both numbers: latitude and longitude.");
    return Response.json({ branch: saved, pinFound });
  }, true);
}
