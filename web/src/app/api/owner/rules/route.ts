import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { readRules, Rules, saveRules } from "@/lib/rulesDb";

export async function GET() {
  return withOwner(async (staff) => Response.json(await readRules(staff.venueId)));
}

/** Changes apply from the next visit. Guests keep the points they have. */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Rules.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Check the numbers: points per BHD 1–100, reward goal 10 or more, and a short reward text.");
    return Response.json(await saveRules(staff, parsed.data));
  }, true);
}
