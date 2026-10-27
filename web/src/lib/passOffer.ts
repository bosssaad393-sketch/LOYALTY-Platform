import "server-only";
import { db } from "./supabase";
import { agreedToNews, appleOfferSelection, normaliseMember, offerChangeStamp } from "./offers";

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
    const [live, gone] = await Promise.all([
      appleOffers(venueId).is("withdrawn_at", null).order("sent_at", { ascending: false }).limit(1),
      appleOffers(venueId).not("withdrawn_at", "is", null).order("sent_at", { ascending: false }).limit(1),
    ]);
    if (live.error) throw live.error;
    if (gone.error) throw gone.error;
    return appleOfferSelection([...(live.data ?? []), ...(gone.data ?? [])], now);
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
