import { z } from "zod";
import { clientKey, createRateLimiter } from "@/lib/rateLimit";
import { fail } from "@/lib/staffApi";
import { guestCardFrom } from "@/lib/table/points";
import { addRequest, findTable, tableView } from "@/lib/table/db";
import { REQUEST_KINDS } from "@/lib/table/rules";

const Input = z.object({ kind: z.enum(REQUEST_KINDS) });
const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

/** Coal, waiter or bill. Starts the service clock for that request. */
export async function POST(request: Request, ctx: RouteContext<"/api/table/[code]/request">) {
  const table = await findTable((await ctx.params).code);
  if (!table) return fail("table_unavailable", 404);
  if (!limiter.allow(`${table.id}:${clientKey(request.headers)}`)) return fail("too_many", 429);
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("bad_request");
  await addRequest(table, parsed.data.kind);
  return Response.json({ tab: await tableView(table, guestCardFrom(request.headers.get("cookie"))) });
}
