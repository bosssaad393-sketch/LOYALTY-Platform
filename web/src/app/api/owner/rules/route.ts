import { z } from "zod";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { readRules, Rules, saveRules, saveStampTexts } from "@/lib/rulesDb";

export async function GET() {
  return withOwner(async (staff) => Response.json(await readRules(staff.venueId)));
}

const StampTexts = z.object({ stampTexts: z.array(z.string().trim().min(2).max(60)).min(1).max(6) });

/** Changes apply from the next visit. Guests keep the points (or stamps) they have. Stamp venues send { stampTexts }. */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const body = await request.json().catch(() => null);
    const stamps = StampTexts.safeParse(body);
    if (stamps.success) {
      await saveStampTexts(staff, stamps.data.stampTexts);
      return Response.json(await readRules(staff.venueId));
    }
    const parsed = Rules.safeParse(body);
    if (!parsed.success) return fail("Check the numbers: points per BHD 1–100, reward goal 10 or more, and a short reward text.");
    return Response.json(await saveRules(staff, parsed.data));
  }, true);
}
