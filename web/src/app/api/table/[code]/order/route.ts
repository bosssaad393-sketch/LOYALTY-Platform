import { clientKey, createRateLimiter } from "@/lib/rateLimit";
import { fail } from "@/lib/staffApi";
import { guestCardFrom } from "@/lib/table/points";
import { findTable, placeOrder, tableView } from "@/lib/table/db";
import { CartInput } from "@/lib/table/rules";
import { rememberSentOrder, sentOrdersFrom } from "@/lib/table/sentOrders";

const limiter = createRateLimiter({ limit: 12, windowMs: 60_000 });

/**
 * A guest sends one round. Staff accept it on the board before anything is made, so a stray order can be cancelled: by staff,
 * or by the phone that sent it (it remembers its rounds in a signed cookie) until staff accept it.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/table/[code]/order">) {
  const table = await findTable((await ctx.params).code);
  if (!table) return fail("table_unavailable", 404);
  if (!limiter.allow(`${table.id}:${clientKey(request.headers)}`)) return fail("too_many", 429);
  const parsed = CartInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("bad_order");
  const r = await placeOrder(table, parsed.data, { source: "guest" });
  if (!r.ok) return Response.json({ error: "unavailable", unavailable: r.unavailable }, { status: 409 });
  const cookie = request.headers.get("cookie");
  const remember = rememberSentOrder(cookie, r.orderId);
  const sent = remember ? sentOrdersFrom(cookie).add(r.orderId) : new Set<string>();
  return Response.json(
    { orderId: r.orderId, tab: await tableView(table, guestCardFrom(cookie), sent) },
    remember ? { headers: { "set-cookie": remember } } : undefined,
  );
}
