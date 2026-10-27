import { getCardView, isUuid } from "@/lib/cards";
import { ensureClass, saveUrl } from "@/lib/googleWallet";

/** Redirects the guest to Google's "Save to Google Wallet" page for their card. */
export async function GET(request: Request, ctx: RouteContext<"/api/wallet/google/[cardId]">) {
  const { cardId } = await ctx.params;
  if (!isUuid(cardId)) return new Response("Not found", { status: 404 });

  try {
    const view = await getCardView(cardId);
    if (!view) return new Response("Not found", { status: 404 });
    await ensureClass(view.venue);
    const origin = new URL(request.url).origin;
    return Response.redirect(saveUrl(view.venue, view.card, view.memberName, origin), 302);
  } catch (err) {
    console.error("google wallet save failed", err);
    return new Response("Google Wallet is unavailable right now. Please try again later.", { status: 503 });
  }
}
