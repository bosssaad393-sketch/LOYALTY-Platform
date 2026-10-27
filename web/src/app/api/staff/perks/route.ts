import { z } from "zod";
import { fail, withStaff } from "@/lib/staffApi";
import { claimPerk, myPerks } from "@/lib/perks";

/** My own thank-you rewards (the ones the owner gave me). */
export async function GET() {
  return withStaff(async (staff) => Response.json({ perks: await myPerks(staff) }));
}

const Claim = z.object({ id: z.uuid() });

/** Mark one of MY rewards as used. */
export async function POST(request: Request) {
  return withStaff(async (staff) => {
    const parsed = Claim.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Reward missing.");
    return (await claimPerk(staff, parsed.data.id)) ? Response.json({ ok: true }) : fail("That reward is not available any more.", 404);
  });
}
