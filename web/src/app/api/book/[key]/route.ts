import { cancelMyBooking, myBooking } from "@/lib/bookingsDb";

/** The guest's own request, by the key their phone kept. */
export async function GET(_request: Request, ctx: RouteContext<"/api/book/[key]">) {
  const b = await myBooking((await ctx.params).key).catch(() => null);
  return b ? Response.json(b, { headers: { "cache-control": "no-store" } }) : new Response(null, { status: 404 });
}

/** The guest takes their request back. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/book/[key]">) {
  const ok = await cancelMyBooking((await ctx.params).key).catch(() => false);
  return ok ? Response.json({ ok: true }) : new Response(null, { status: 404 });
}
