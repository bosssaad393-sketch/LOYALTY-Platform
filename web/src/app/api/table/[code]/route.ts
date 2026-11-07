import { fail } from "@/lib/staffApi";
import { guestCardFrom } from "@/lib/table/points";
import { findTable, readMenu, tableView } from "@/lib/table/db";

/** Public, reached through the table's QR code: the menu and this table's current tab. Nothing about any guest. */
export async function GET(request: Request, ctx: RouteContext<"/api/table/[code]">) {
  const table = await findTable((await ctx.params).code);
  if (!table) return fail("This table is not available.", 404);
  return Response.json({ menu: await readMenu(table.venueId), tab: await tableView(table, guestCardFrom(request.headers.get("cookie"))) });
}
