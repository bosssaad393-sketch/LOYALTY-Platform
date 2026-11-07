import { clientKey, createRateLimiter } from "@/lib/rateLimit";
import { fail } from "@/lib/staffApi";
import { guestCardFrom } from "@/lib/table/points";
import { findTable, placeOrder, tableView } from "@/lib/table/db";
import { CartInput } from "@/lib/table/rules";

const limiter = createRateLimiter({ limit: 12, windowMs: 60_000 });

/** A guest sends one round. Staff accept it on the board before anything is made, so a stray order can be cancelled. */
export async function POST(request: Request, ctx: RouteContext<"/api/table/[code]/order">) {
  const table = await findTable((await ctx.params).code);
  if (!table) return fail("table_unavailable", 404);
  if (!limiter.allow(`${table.id}:${clientKey(request.headers)}`)) return fail("too_many", 429);
  const parsed = CartInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("bad_order");
  const r = await placeOrder(table, parsed.data, { source: "guest" });
  if (!r.ok) return Response.json({ error: "unavailable", unavailable: r.unavailable }, { status: 409 });
  return Response.json({ orderId: r.orderId, tab: await tableView(table, guestCardFrom(request.headers.get("cookie"))) });
}
