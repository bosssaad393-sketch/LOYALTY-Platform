import { z } from "zod";
import { fail, withStaff } from "@/lib/staffApi";
import { actOnOrder, readBoard } from "@/lib/table/db";

const Input = z.object({ orderId: z.uuid(), action: z.enum(["accept", "ready", "serve", "cancel"]), minutes: z.union([z.literal(10), z.literal(20)]).optional() });

export async function POST(request: Request) {
  return withStaff(async (staff) => {
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Check the action.");
    const r = await actOnOrder(staff.venueId, parsed.data.orderId, parsed.data.action, parsed.data.minutes);
    if (r === "not_found") return fail("Order not found.", 404);
    if (r === "not_allowed") return fail("That step does not apply to this order.", 409);
    if (r === "changed") return fail("Someone else just changed this order.", 409);
    return Response.json(await readBoard(staff.venueId));
  });
}
