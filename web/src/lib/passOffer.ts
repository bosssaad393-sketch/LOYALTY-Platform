import "server-only";
import { db } from "./supabase";
import { agreedToNews, appleOfferSelection, normaliseMember, offerChangeStamp, offerIsFor } from "./offers";

/**
 * Offer data for Apple passes.
 * Both functions are best effort: if the lookup fails (for example migration 0003 or 0004 is not applied yet), the
 * pass is still built, just without the offer field.
 * Withdrawn offers (migration 0004, `withdrawn_at`) are never shown: the newest offer that is not withdrawn wins.
 */

/** The offers that can reach Apple cards: sent to everyone or to Apple only. */
const appleOffers = (venueId: string) => db().from("offers").select("message, audience, sent_at, withdrawn_at").eq("venue_id", venueId).in("audience", ["all", "apple"]);

/**
 * null  = this guest did not agree to offers: the pass gets no offer field.
 * { message, alert } = the guest agreed. `message` is the live offer (newest not withdrawn, sent in the last 14 days)
 * or null when there is none. `alert` says whether the field may announce itself (see appleOfferSelection).
 */
export async function offerStateForCard(cardId: string, venueId: string, now: number = Date.now()): Promise<{ message: string | null; alert: boolean } | null> {
  try {
    const { data: card, error } = await db().from("cards").select("members(consent_news, deleted_at)").eq("id", cardId).maybeSingle();
    if (error) throw error;
    if (!agreedToNews(normaliseMember(card?.members))) return null;
    // Two small reads: the newest offer that is not withdrawn (what to show), and the newest withdrawn one (to know
    // whether the offer on show is an older one coming back, which must not alert the guest a second time).
    // An offer sent to one group (0026) is only for the cards in its list, so the newest few are read and the ones
    // meant for this card are kept. A database without 0026 has no lists: every offer is for everyone.
    type Row = { message: string; audience: string; sent_at: string; withdrawn_at: string | null; target_cards?: string[] | null };
    const read = async (cols: string) => Promise.all([
      db().from("offers").select(cols).eq("venue_id", venueId).in("audience", ["all", "apple"]).is("withdrawn_at", null).order("sent_at", { ascending: false }).limit(20),
      db().from("offers").select(cols).eq("venue_id", venueId).in("audience", ["all", "apple"]).not("withdrawn_at", "is", null).order("sent_at", { ascending: false }).limit(20),
    ]);
    let [live, gone] = await read("message, audience, sent_at, withdrawn_at, target_cards");
    if (/target_cards/.test(live.error?.message ?? gone.error?.message ?? "")) [live, gone] = await read("message, audience, sent_at, withdrawn_at");
    if (live.error) throw live.error;
    if (gone.error) throw gone.error;
    const mine = (rows: unknown) => ((rows ?? []) as Row[]).filter((o) => offerIsFor(o, cardId)).slice(0, 1);
    return appleOfferSelection([...mine(live.data), ...mine(gone.data)], now);
  } catch (e) {
    console.error("offer lookup failed", e instanceof Error ? e.message : e);
    return null;
  }
}

/** For each venue: when its Apple offer last changed (see offerChangeStamp). Venues with no offers are left out. */
export async function offerStampsByVenue(venueIds: string[], now: number = Date.now()): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    await Promise.all(
      venueIds.map(async (venueId) => {
        const [live, gone] = await Promise.all([
          appleOffers(venueId).is("withdrawn_at", null).order("sent_at", { ascending: false }).limit(1),
          appleOffers(venueId).not("withdrawn_at", "is", null).order("withdrawn_at", { ascending: false }).limit(1),
        ]);
        if (live.error) throw live.error;
        if (gone.error) throw gone.error;
        const stamp = offerChangeStamp({ latestLiveSentAt: live.data?.[0]?.sent_at, latestWithdrawnAt: gone.data?.[0]?.withdrawn_at }, now);
        if (stamp > 0) out.set(venueId, stamp);
      }),
    );
  } catch (e) {
    console.error("offer stamp lookup failed", e instanceof Error ? e.message : e);
  }
  return out;
}
