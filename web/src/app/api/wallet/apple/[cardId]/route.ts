import { getCardView, isUuid } from "@/lib/cards";
import { buildPass } from "@/lib/appleWallet";

/** Returns the guest's card as a signed Apple Wallet pass. Safari on iPhone opens it straight into Wallet. */
export async function GET(request: Request, ctx: RouteContext<"/api/wallet/apple/[cardId]">) {
  const { cardId } = await ctx.params;
  if (!isUuid(cardId)) return new Response("Not found", { status: 404 });

  try {
    const view = await getCardView(cardId);
    if (!view) return new Response("Not found", { status: 404 });
    const url = new URL(request.url);
    const p = url.searchParams.get("preview");
    const preview = p === "qr" || p === "card" ? p : undefined;
    const pass = await buildPass(view.venue, view.card, view.memberName, url.origin, preview);
    return new Response(new Uint8Array(pass), {
      headers: {
        "content-type": "application/vnd.apple.pkpass",
        "content-disposition": `attachment; filename="${view.venue.slug}-card${preview ? "-preview" : ""}.pkpass"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("apple wallet pass failed", err);
    return new Response("Apple Wallet is unavailable right now. Please try again later.", { status: 503 });
  }
}
