import { getCardView, isUuid } from "@/lib/cards";
import { GUEST_CARD_COOKIE } from "@/lib/table/points";

const YEAR = 365 * 24 * 3600;
const cookie = (value: string, maxAge: number) =>
  `${GUEST_CARD_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;

/**
 * The guest opened their own card page: this phone remembers the card, so the points of a table's bill are added by themselves.
 * The card link itself is the proof (it is the guest's private address). Nothing else is stored.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/card/[cardId]/remember">) {
  const { cardId } = await ctx.params;
  if (!isUuid(cardId) || !(await getCardView(cardId))) return Response.json({ error: "not_found" }, { status: 404 });
  return new Response(null, { status: 204, headers: { "set-cookie": cookie(cardId.toLowerCase(), YEAR) } });
}

/** "Forget this phone": for a shared or borrowed phone. */
export async function DELETE() {
  return new Response(null, { status: 204, headers: { "set-cookie": cookie("", 0) } });
}
