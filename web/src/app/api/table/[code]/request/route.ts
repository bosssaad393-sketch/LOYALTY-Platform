import { z } from "zod";
import { clientKey, createRateLimiter } from "@/lib/rateLimit";
import { fail } from "@/lib/staffApi";
import { guestCardFrom } from "@/lib/table/points";
import { sentOrdersFrom } from "@/lib/table/sentOrders";
import { addRequest, findTable, tableView } from "@/lib/table/db";
import { REQUEST_KINDS } from "@/lib/table/rules";
import { getVenue } from "@/lib/supabase";
import { tableFloorOn } from "@/lib/tableOrders";
import { notifyStaff } from "@/lib/staffPush";

const Input = z.object({ kind: z.enum(REQUEST_KINDS) });
const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

/** Coal, waiter or bill. Starts the service clock for that request. */
export async function POST(request: Request, ctx: RouteContext<"/api/table/[code]/request">) {
  const table = await findTable((await ctx.params).code);
  if (!table) return fail("table_unavailable", 404);
  if (!limiter.allow(`${table.id}:${clientKey(request.headers)}`)) return fail("too_many", 429);
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("bad_request");
  // A visit-card venue takes calls from the table only when its owner switched that (or ordering) on.
  const venue = await Promise.resolve().then(() => getVenue(table.venueSlug)).catch(() => null);
  if (venue?.card_mode === "visits" && !(await tableFloorOn(venue.id))) return fail("table_unavailable", 404);
  // A new call wakes the staff's phones; a second tap on a call that is still open does not.
  if (await addRequest(table, parsed.data.kind)) await notifyStaff(table.venueId);
  return Response.json({ tab: await tableView(table, guestCardFrom(request.headers.get("cookie")), sentOrdersFrom(request.headers.get("cookie"))) });
}
