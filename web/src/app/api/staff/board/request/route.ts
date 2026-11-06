import { z } from "zod";
import { fail, withStaff } from "@/lib/staffApi";
import { handleRequest, readBoard } from "@/lib/table/db";

const Input = z.object({ requestId: z.uuid() });

/** Stops the clock on a call. */
export async function POST(request: Request) {
  return withStaff(async (staff) => {
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Check the request.");
    if (!(await handleRequest(staff.venueId, parsed.data.requestId, staff.id))) return fail("Already done, or not found.", 404);
    return Response.json(await readBoard(staff.venueId));
  });
}
