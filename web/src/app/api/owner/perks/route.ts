import { z } from "zod";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { cancelPerk, grantPerks, GrantInput, ownerPerks } from "@/lib/perks";

/** Staff perks, owner only: see what was given, give a thank-you to chosen team members, take back one that was not used. */
export async function GET() {
  return withOwner(async (staff) => Response.json({ perks: await ownerPerks(staff) }), true);
}

export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = GrantInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Choose who it is for and write what they get (at least 2 letters).");
    try {
      const n = await grantPerks(staff, parsed.data);
      return n === 0 ? fail("No active team member was chosen.") : Response.json({ given: n });
    } catch (e) {
      if (e instanceof RangeError) return fail("The last day cannot be in the past.");
      throw e;
    }
  }, true);
}

const Cancel = z.object({ id: z.uuid() });

export async function DELETE(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Cancel.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Reward missing.");
    return (await cancelPerk(staff, parsed.data.id)) ? Response.json({ ok: true }) : fail("That reward was already used or is not yours to cancel.", 404);
  }, true);
}
