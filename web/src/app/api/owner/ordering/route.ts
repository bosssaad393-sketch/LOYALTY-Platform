import { z } from "zod";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { setTableCallsOn, setTableOrdersOn, tableCallsOn, tableOrdersOn } from "@/lib/tableOrders";
import { tapOnFor } from "@/lib/tap/client";

/** What a table's code offers at a visit-card venue: ordering, calling the waiter, and paying by card from the phone. */
export async function GET() {
  return withOwner(async (staff) => Response.json({ on: await tableOrdersOn(staff.venueId), calls: await tableCallsOn(staff.venueId), payOnline: tapOnFor(staff.venueSlug) }));
}

/** The owner's switches: { on } for ordering, { calls } for calling the waiter. */
export async function POST(request: Request) {
  const parsed = z.union([z.object({ on: z.boolean() }), z.object({ calls: z.boolean() })]).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Choose on or off.");
  const input = parsed.data;
  return withOwner(async (staff) => {
    if ("on" in input) await setTableOrdersOn(staff, input.on);
    else await setTableCallsOn(staff, input.calls);
    return Response.json({ on: await tableOrdersOn(staff.venueId), calls: await tableCallsOn(staff.venueId) });
  }, true);
}
