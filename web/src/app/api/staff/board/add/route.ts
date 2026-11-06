import { z } from "zod";
import { fail, withStaff } from "@/lib/staffApi";
import { placeOrder, readBoard, venueTable } from "@/lib/table/db";
import { CartInput } from "@/lib/table/rules";

const Input = CartInput.extend({ tableId: z.uuid() });

/** Staff add a round for a guest who ordered by voice. */
export async function POST(request: Request) {
  return withStaff(async (staff) => {
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Pick a table and at least one item.");
    const table = await venueTable(staff.venueId, parsed.data.tableId);
    if (!table) return fail("Table not found.", 404);
    const r = await placeOrder(table, { items: parsed.data.items }, { source: "staff", staffId: staff.id });
    if (!r.ok) return fail("Something in this order is sold out.", 409);
    return Response.json(await readBoard(staff.venueId));
  });
}
