import { z } from "zod";
import { fail, withStaff } from "@/lib/staffApi";
import { readBoard, setItemAvailable } from "@/lib/table/db";

const Input = z.object({ itemId: z.uuid(), available: z.boolean() });

/** Sold out, or back on. */
export async function POST(request: Request) {
  return withStaff(async (staff) => {
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Check the item.");
    if (!(await setItemAvailable(staff.venueId, parsed.data.itemId, parsed.data.available))) return fail("Item not found.", 404);
    return Response.json(await readBoard(staff.venueId));
  });
}
