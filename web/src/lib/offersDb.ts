import "server-only";
import { db } from "./supabase";
import type { Staff } from "./staffAuth";
import { appleWalletConfigured } from "./appleWallet";
import { notifyAppleTokens } from "./apns";
import { addOfferMessages, googleWalletConfigured } from "./googleWallet";
import {
  OFFER_WINDOW_MS,
  appliesTo,
  applePlan,
  countCards,
  eligibleCardIds,
  findRecentDuplicate,
  inWindow,
  normaliseMember,
  offerListItem,
  type CardConsentRow,
  type OfferInputValue,
  type OfferListItem,
} from "./offers";

/** An error whose text is safe to show to the owner. */
export class OfferError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const PAGE = 1000;
const IN_CHUNK = 100;

/** Every card at the venue with whether its guest agreed to offers (names and contacts are never read). */
async function consentRows(venueId: string): Promise<CardConsentRow[]> {
  const rows: CardConsentRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from("cards")
      .select("id, members(consent_news, deleted_at)")
      .eq("venue_id", venueId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const c of data ?? []) rows.push({ id: c.id, members: normaliseMember(c.members) });
    if ((data ?? []).length < PAGE) break;
  }
  return rows;
}

export async function offersOverview(venueId: string): Promise<{ eligible: number; total: number; offers: OfferListItem[] }> {
  const [rows, offers] = await Promise.all([
    consentRows(venueId),
    db()
      .from("offers")
      .select("id, message, audience, sent_at, recipients, withdrawn_at")
      .eq("venue_id", venueId)
      .order("sent_at", { ascending: false })
      .limit(20),
  ]);
  if (offers.error) throw offers.error;
  // Withdrawn offers stay in the list as history.
  return { ...countCards(rows), offers: (offers.data ?? []).map(offerListItem) };
}

async function appleRegistrations(cardIds: string[]): Promise<{ card_id: string; push_token: string }[]> {
  const out: { card_id: string; push_token: string }[] = [];
  for (let i = 0; i < cardIds.length; i += IN_CHUNK) {
    const { data, error } = await db().from("apple_registrations").select("card_id, push_token").in("card_id", cardIds.slice(i, i + IN_CHUNK));
    if (error) throw error;
    out.push(...(data ?? []));
  }
  return out;
}

/**
 * Stores the offer, then delivers it to the Wallet cards of guests who agreed to offers.
 * - Apple: the pass reads the offer from the database when Wallet fetches it (see passOffer.ts and appleWallet.ts);
 *   here we only wake the registered devices.
 * - Google: adds a message to each saved card.
 * Returns the offer id and how many guests it was addressed to.
 */
export async function sendOffer(staff: Staff, input: OfferInputValue): Promise<{ id: string; recipients: number }> {
  const { message, audience } = input;
  const wantsApple = appliesTo(audience, "apple");
  const wantsGoogle = appliesTo(audience, "google");

  const eligible = eligibleCardIds(await consentRows(staff.venueId));
  if (eligible.length === 0) throw new OfferError("Nobody has agreed to notifications yet.");

  // A double tap sends the same offer once. A withdrawn offer is not a double tap: sending its text again is a new send.
  const recent = await db()
    .from("offers")
    .select("id, message, audience, sent_at, recipients, withdrawn_at")
    .eq("venue_id", staff.venueId)
    .is("withdrawn_at", null)
    .gte("sent_at", new Date(Date.now() - 5 * 60_000).toISOString())
    .order("sent_at", { ascending: false })
    .limit(10);
  if (recent.error) throw recent.error;
  const dup = findRecentDuplicate(recent.data ?? [], message, audience);
  if (dup) return { id: dup.id, recipients: dup.recipients ?? 0 };

  if (audience === "apple" && !appleWalletConfigured()) throw new OfferError("Apple Wallet is not set up yet.");
  if (audience === "google" && !googleWalletConfigured()) throw new OfferError("Google Wallet is not set up yet.");

  // Who can be reached on Apple: eligible guests with a registered device.
  const apple = wantsApple && appleWalletConfigured() ? applePlan(await appleRegistrations(eligible)) : { cards: 0, tokens: [] as string[] };
  if (audience === "apple" && apple.cards === 0) throw new OfferError("No guest with an Apple Wallet card has agreed to notifications yet.");

  // "All" counts every guest who agreed. "Apple" counts those with a registered device. "Google" is counted after sending.
  const recipients = audience === "all" ? eligible.length : audience === "apple" ? apple.cards : 0;

  // Store first: a card fetched right after the push must already see the offer.
  const { data: row, error } = await db()
    .from("offers")
    .insert({ venue_id: staff.venueId, message, audience, sent_by: staff.id, recipients })
    .select("id")
    .single();
  if (error) throw error;

  let finalRecipients = recipients;
  if (wantsApple && apple.tokens.length) {
    await notifyAppleTokens(apple.tokens);
  }
  if (wantsGoogle && googleWalletConfigured()) {
    try {
      const g = await addOfferMessages(staff.venueName, { id: row.id, message }, eligible, OFFER_WINDOW_MS);
      if (audience === "google") {
        finalRecipients = g.sent;
        const { error: e2 } = await db().from("offers").update({ recipients: g.sent }).eq("id", row.id);
        if (e2) console.error("offer recipients update failed", e2.message);
      }
    } catch (e) {
      console.error("google offer delivery failed", e instanceof Error ? e.message : e);
    }
  }

  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "offer_sent", detail: { offer: row.id, audience, recipients: finalRecipients } });
  return { id: row.id, recipients: finalRecipients };
}

/** Wakes the Apple devices of guests who agreed to offers so they fetch their card again. Best effort: never throws. */
async function wakeAppleCards(venueId: string): Promise<void> {
  try {
    const eligible = eligibleCardIds(await consentRows(venueId));
    if (eligible.length === 0) return;
    const plan = applePlan(await appleRegistrations(eligible));
    if (plan.tokens.length) await notifyAppleTokens(plan.tokens);
  } catch (e) {
    console.error("apple push after withdraw failed", e instanceof Error ? e.message : e);
  }
}

/**
 * Withdraws a sent offer of this venue (owner only; the route checks the role).
 * - The offer stays in the list as history, marked withdrawn.
 * - Apple: the pass is built from the database, so once the offer is marked it is left out: the previous live offer
 *   (inside the 14 days) shows, or "No offer right now.". Here we wake the registered devices so they fetch the card.
 *   Skipped when the offer could not be on a card any more (older than 14 days, or Google only).
 * - Google: NOT touched. Google has no call that removes one message, and rewriting the whole message list of every
 *   card is not something we can verify without a real Google Wallet account. The message ends by itself when its
 *   14-day display interval ends. See "Round 3, as built" in docs/OWNER-APP-CONTRACT.md.
 * - A notification that already appeared on a phone cannot be recalled.
 * Throws OfferError 404 (not an offer of this venue) or 409 (already withdrawn, also when two taps race).
 */
export async function withdrawOffer(staff: Staff, offerId: string): Promise<{ withdrawnAt: string }> {
  const { data: offer, error } = await db()
    .from("offers")
    .select("id, audience, sent_at, withdrawn_at")
    .eq("id", offerId)
    .eq("venue_id", staff.venueId) // an offer of another venue looks exactly like one that does not exist
    .maybeSingle();
  if (error) throw error;
  if (!offer) throw new OfferError("That message was not found.", 404);
  if (offer.withdrawn_at) throw new OfferError("That message was already withdrawn.", 409);

  // Conditional update: if two taps (or two screens) arrive together, only one of them changes the row.
  const stamp = new Date().toISOString();
  const { data: changed, error: e2 } = await db()
    .from("offers")
    .update({ withdrawn_at: stamp, withdrawn_by: staff.id })
    .eq("id", offerId)
    .eq("venue_id", staff.venueId)
    .is("withdrawn_at", null)
    .select("id, withdrawn_at");
  if (e2) throw e2;
  if (!changed || changed.length === 0) throw new OfferError("That message was already withdrawn.", 409);

  const stored = Date.parse(changed[0].withdrawn_at);
  const withdrawnAt = Number.isFinite(stored) ? new Date(stored).toISOString() : stamp;

  const { error: e3 } = await db()
    .from("audit_log")
    .insert({ venue_id: staff.venueId, actor: staff.id, action: "offer_withdrawn", detail: { offer: offerId, audience: offer.audience } });
  if (e3) console.error("audit log for offer_withdrawn failed", e3.message);

  if (appliesTo(offer.audience, "apple") && appleWalletConfigured() && inWindow(offer.sent_at)) {
    await wakeAppleCards(staff.venueId);
  }
  return { withdrawnAt };
}
