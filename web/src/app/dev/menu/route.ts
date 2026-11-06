import { withDeveloper } from "@/lib/devApi";
import { listTables } from "@/lib/table/db";

/** The developer's "Menu" button: opens the guest menu of the venue's first table. Table codes stay on the server until a developer asks. */
export async function GET(request: Request) {
  return withDeveloper(async (staff) => {
    const [table] = await listTables(staff.venueId);
    if (!table) return new Response("This venue has no tables yet. Add one under Tables and menu in the owner app.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    return Response.redirect(new URL(`/t/${table.token}`, request.url), 303);
  });
}
