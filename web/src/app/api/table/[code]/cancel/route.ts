import { z } from "zod";
import { clientKey, createRateLimiter } from "@/lib/rateLimit";
import { fail } from "@/lib/staffApi";
import { guestCardFrom } from "@/lib/table/points";
import { findTable, guestCancelOrder, tableView } from "@/lib/table/db";
import { sentOrdersFrom } from "@/lib/table/sentOrders";

const Input = z.object({ orderId: z.uuid() });
const limiter = createRateLimiter({ limit: 12, windowMs: 60_000 });

/** A guest cancels a round they sent from this phone, while staff have not accepted it yet. */
export async function POST(request: Request, ctx: RouteContext<"/api/table/[code]/cancel">) {
  const table = await findTable((await ctx.params).code);
  if (!table) return fail("table_unavailable", 404);
  if (!limiter.allow(`${table.id}:${clientKey(request.headers)}`)) return fail("too_many", 429);
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("bad_request");
  const cookie = request.headers.get("cookie");
  const sent = sentOrdersFrom(cookie);
  if (!sent.has(parsed.data.orderId)) return fail("not_yours", 403);
  const r = await guestCancelOrder(table, parsed.data.orderId);
  if (r === "not_found") return fail("not_found", 404);
  if (r === "started") return Response.json({ error: "started", tab: await tableView(table, guestCardFrom(cookie), sent) }, { status: 409 });
  return Response.json({ tab: await tableView(table, guestCardFrom(cookie), sent) });
}
