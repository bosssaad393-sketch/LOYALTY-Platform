import { z } from "zod";
import { fail, withStaff } from "@/lib/staffApi";
import { closeTabCash, readBoard } from "@/lib/table/db";

const Input = z.object({ tabId: z.uuid() });

/** Cash paid: closes the tab. Card payment comes with the Tap work. */
export async function POST(request: Request) {
  return withStaff(async (staff) => {
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Check the tab.");
    const r = await closeTabCash(staff.venueId, parsed.data.tabId, staff.id);
    if (r === "not_found") return fail("Tab not found.", 404);
    if (r === "unfinished") return fail("A round on this tab is still open. Finish or cancel it first.", 409);
    return Response.json(await readBoard(staff.venueId));
  });
}
