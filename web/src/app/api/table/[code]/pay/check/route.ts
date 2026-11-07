import { z } from "zod";
import { clientKey, createRateLimiter } from "@/lib/rateLimit";
import { fail } from "@/lib/staffApi";
import { guestCardFrom } from "@/lib/table/points";
import { findTable, tableView } from "@/lib/table/db";
import { checkPayment } from "@/lib/tap/payments";

const Input = z.object({ paymentId: z.uuid() });
const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

/** The guest is back from Tap's page: ask Tap about this payment and answer with the result and the tab. */
export async function POST(request: Request, ctx: RouteContext<"/api/table/[code]/pay/check">) {
  const table = await findTable((await ctx.params).code);
  if (!table) return fail("table_unavailable", 404);
  if (!limiter.allow(`${table.id}:${clientKey(request.headers)}`)) return fail("too_many", 429);
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("bad_request");
  const status = await checkPayment(table, parsed.data.paymentId).catch((e) => {
    console.error("tap check failed", e instanceof Error ? e.message : e);
    return "initiated" as const;
  });
  if (!status) return fail("not_found", 404);
  return Response.json({ status, tab: await tableView(table, guestCardFrom(request.headers.get("cookie"))) });
}
