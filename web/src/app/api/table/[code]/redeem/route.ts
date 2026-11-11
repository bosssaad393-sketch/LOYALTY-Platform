import { clientKey, createRateLimiter } from "@/lib/rateLimit";
import { fail } from "@/lib/staffApi";
import { guestCardFrom } from "@/lib/table/points";
import { sentOrdersFrom } from "@/lib/table/sentOrders";
import { askReward, findTable, tableView } from "@/lib/table/db";

const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

/** The guest asks to use their points for the venue's reward. Staff confirm on the board; nothing is spent here. */
export async function POST(request: Request, ctx: RouteContext<"/api/table/[code]/redeem">) {
  const table = await findTable((await ctx.params).code);
  if (!table) return fail("table_unavailable", 404);
  if (!limiter.allow(`${table.id}:${clientKey(request.headers)}`)) return fail("too_many", 429);
  const cookie = request.headers.get("cookie");
  const card = guestCardFrom(cookie);
  const asked = await askReward(table, card);
  if (asked !== "ok") return fail(asked, 409);
  return Response.json({ tab: await tableView(table, card, sentOrdersFrom(cookie)) });
}
