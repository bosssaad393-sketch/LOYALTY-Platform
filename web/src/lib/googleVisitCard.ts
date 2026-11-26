import "server-only";
import { getCardView } from "./cards";
import { listBranches } from "./branchesDb";
import { cardVouchers } from "./vouchersDb";
import { passVoucher } from "./vouchers";
import { directionsUrl } from "./placeLinks";
import type { VisitCardExtra } from "./googleWallet";

/**
 * What a visit card shows in Google Wallet: the visits, the gift that is ready and where it is used, and the first
 * branch's menu, directions and Google review links (the review link goes to every guest and is tied to nothing).
 * Null for a card of a points or stamp venue, or when the card cannot be read. Never throws.
 */
export async function visitCardExtra(cardId: string): Promise<VisitCardExtra | null> {
  try {
    const view = await getCardView(cardId);
    if (!view || view.venue.card_mode !== "visits") return null;
    const [vouchers, branches] = await Promise.all([cardVouchers(cardId, view.venue.id), listBranches(view.venue.id)]);
    const gift = passVoucher(vouchers);
    const here = branches.find((b) => b.kind === "branch") ?? null;
    const links: { label: string; url: string }[] = [];
    const base = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
    if (base) links.push({ label: "Menu", url: `${base}/menu/${encodeURIComponent(view.venue.slug)}` });
    const map = here ? directionsUrl(here) : null;
    if (map) links.push({ label: "Directions", url: map });
    if (here?.reviewUrl) links.push({ label: "Review us on Google", url: here.reviewUrl });
    return { visits: Number(view.card.visits ?? 0), gift: gift ? { title: gift.title, place: gift.redeemBranchName } : null, links };
  } catch {
    return null;
  }
}
