import { fail } from "@/lib/staffApi";
import { withDeveloper } from "@/lib/devApi";
import { RequestUpdate, teamRequests, updateRequest } from "@/lib/assistant/devInbox";

export async function GET() {
  return withDeveloper(async (staff) => Response.json({ requests: await teamRequests(staff) }));
}

export async function PATCH(request: Request) {
  return withDeveloper(async (staff) => {
    const parsed = RequestUpdate.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Check the request id and the status.");
    return (await updateRequest(staff, parsed.data)) ? Response.json({ ok: true }) : fail("Request not found.", 404);
  });
}
