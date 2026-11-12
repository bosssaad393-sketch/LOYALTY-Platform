import { clientKey, createRateLimiter } from "@/lib/rateLimit";
import { fail, refreshWalletCards } from "@/lib/staffApi";
import { guestCardFrom } from "@/lib/table/points";
import { sentOrdersFrom } from "@/lib/table/sentOrders";
import { findTable, tableView, spendReward } from "@/lib/table/db";

const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

/** The guest uses their points for the venue's reward. The points come off at once and the board tells staff what to bring. */
export async function POST(request: Request, ctx: RouteContext<"/api/table/[code]/redeem">) {
  const table = await findTable((await ctx.params).code);
  if (!table) return fail("table_unavailable", 404);
  if (!limiter.allow(`${table.id}:${clientKey(request.headers)}`)) return fail("too_many", 429);
  const cookie = request.headers.get("cookie");
  const card = guestCardFrom(cookie);
  const used = await spendReward(table, card);
  if (!used.ok) return fail(used.reason, 409);
  if (used.balance !== null) await refreshWalletCards(used.cardId, used.balance);
  return Response.json({ tab: await tableView(table, card, sentOrdersFrom(cookie)) });
}
