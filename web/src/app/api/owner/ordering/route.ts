import { z } from "zod";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { setTableOrdersOn, tableOrdersOn } from "@/lib/tableOrders";
import { tapOnFor } from "@/lib/tap/client";

/** Can guests order from the table's code, and can they pay by card from the phone (a Tap account is set up)? */
export async function GET() {
  return withOwner(async (staff) => Response.json({ on: await tableOrdersOn(staff.venueId), payOnline: tapOnFor(staff.venueSlug) }));
}

/** The owner's switch. */
export async function POST(request: Request) {
  const parsed = z.object({ on: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Choose on or off.");
  return withOwner(async (staff) => {
    await setTableOrdersOn(staff, parsed.data.on);
    return Response.json({ on: parsed.data.on });
  }, true);
}
