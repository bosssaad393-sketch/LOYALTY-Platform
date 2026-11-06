import { withDeveloper } from "@/lib/devApi";
import { listTables } from "@/lib/table/db";

/** The developer's "Menu" button: opens the guest menu of the venue's first table. Table codes stay on the server until a developer asks. */
export async function GET() {
  return withDeveloper(async (staff) => {
    const [table] = await listTables(staff.venueId);
    if (!table) return new Response("This venue has no tables yet. Add one under Tables and menu in the owner app.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    // A relative address, so it stays right behind any proxy or custom domain.
    return new Response(null, { status: 303, headers: { location: `/t/${table.token}` } });
  });
}
