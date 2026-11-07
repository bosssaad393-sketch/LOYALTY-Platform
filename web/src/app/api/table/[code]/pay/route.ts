import { z } from "zod";
import { clientKey, createRateLimiter } from "@/lib/rateLimit";
import { fail } from "@/lib/staffApi";
import { findTable } from "@/lib/table/db";
import { startPayment } from "@/lib/tap/payments";
import { PAY_METHODS } from "@/lib/tap/rules";

const Input = z.object({ method: z.enum(PAY_METHODS) });
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

const STATUS = { off: 503, nothing: 409, wait: 409, failed: 502 } as const;

/** Starts paying what is left on this table's tab. The amount is worked out here from the tab, never sent by the browser. */
export async function POST(request: Request, ctx: RouteContext<"/api/table/[code]/pay">) {
  const code = (await ctx.params).code;
  const table = await findTable(code);
  if (!table) return fail("table_unavailable", 404);
  if (!limiter.allow(`${table.id}:${clientKey(request.headers)}`)) return fail("too_many", 429);
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("bad_request");
  const r = await startPayment(table, code, parsed.data.method, new URL(request.url).origin);
  if (!r.ok) return fail(r.reason, STATUS[r.reason]);
  return Response.json({ url: r.url });
}
