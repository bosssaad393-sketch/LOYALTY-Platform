import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { BranchInput, listBranches, saveBranch } from "@/lib/branchesDb";

/** The business's places (branches and partner counters), switched-off ones included. */
export async function GET() {
  return withOwner(async (staff) => Response.json({ branches: await listBranches(staff.venueId, { includeInactive: true }) }));
}

/** Owner only: add a place, or change one (send its id). */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = BranchInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Check the branch: a name, https links, a Google link for reviews, and a location as two numbers.");
    const saved = await saveBranch(staff, parsed.data);
    if (saved === "not_found") return fail("Branch not found.", 404);
    if (saved === "half_location") return fail("A location needs both numbers: latitude and longitude.");
    return Response.json({ branch: saved });
  }, true);
}
