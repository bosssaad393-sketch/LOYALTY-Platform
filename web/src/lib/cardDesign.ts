import "server-only";
import { db } from "./supabase";
import { sampleMode } from "./demo";
import { appleWalletConfigured } from "./appleWallet";
import { notifyAppleTokens } from "./apns";

/**
 * Sending the Wallet card as it is built now to the cards guests already saved.
 *
 * The card's picture, colours, wording and place (the welcome on the lock screen near the venue) are built on this
 * server each time a phone asks for its card. A phone asks when it is woken by a push and the card is newer than the
 * copy it holds. So after a change is deployed: sendCardDesign marks every card of the business as newer and wakes
 * every phone that holds one. The guest does nothing and sees no message: same card, same code, same points.
 *
 * The mark is a line in the audit log (action "card_design_sent"), so this needs no change to the database.
 *
 * What cannot change this way: the pass type, the card's serial number (its id) and the address the card calls home
 * (PUBLIC_BASE_URL). Keep those for the life of the cards.
 */

const PAGE = 1000;
const IN_CHUNK = 100;
const ACTION = "card_design_sent";

/** When each business last sent its card out. A business that never did is not in the answer. Never throws. */
export async function passDesignStamps(venueIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const id of venueIds) {
    try {
      const { data, error } = await db().from("audit_log").select("created_at").eq("venue_id", id).eq("action", ACTION).order("created_at", { ascending: false }).limit(1);
      const at = error ? 0 : new Date(String((data ?? [])[0]?.created_at ?? "")).getTime();
      if (at > 0) out.set(id, at);
    } catch {
      /* the card then simply keeps its other dates */
    }
  }
  return out;
}

/** The phones holding a card of this business: one push address per phone, and how many cards that is. */
export async function savedCards(venueId: string): Promise<{ tokens: string[]; cards: number }> {
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db().from("cards").select("id").eq("venue_id", venueId).order("id").range(from, from + PAGE - 1);
    if (error) throw error;
    ids.push(...(data ?? []).map((c) => c.id as string));
    if ((data ?? []).length < PAGE) break;
  }
  const tokens = new Set<string>();
  const cards = new Set<string>();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await db().from("apple_registrations").select("card_id, push_token").in("card_id", ids.slice(i, i + IN_CHUNK));
    if (error) throw error;
    for (const r of data ?? []) {
      tokens.add(r.push_token as string);
      cards.add(r.card_id as string);
    }
  }
  return { tokens: [...tokens], cards: cards.size };
}

export type CardDesignStatus = {
  /** Apple Wallet is set up on this deployment (and it is not a sample). */
  configured: boolean;
  /** Cards saved in Apple Wallet, and the phones holding them. */
  cards: number;
  phones: number;
  /** When the card was last sent out; null = never. */
  sentAt: string | null;
};

export async function cardDesignStatus(venueId: string): Promise<CardDesignStatus> {
  if (sampleMode() || !appleWalletConfigured()) return { configured: false, cards: 0, phones: 0, sentAt: null };
  const [saved, stamps] = await Promise.all([savedCards(venueId), passDesignStamps([venueId])]);
  const at = stamps.get(venueId);
  return { configured: true, cards: saved.cards, phones: saved.tokens.length, sentAt: at ? new Date(at).toISOString() : null };
}

/**
 * Marks every card of the business as newer than any copy on a phone, then wakes the phones. Returns how many phones
 * Apple accepted the wake-up for. A phone that is off picks the card up later; every card also refreshes at the
 * guest's next visit, because that wakes its phone too.
 */
export async function sendCardDesign(venueId: string, staffId: string, now = new Date()): Promise<CardDesignStatus & { accepted: number }> {
  if (sampleMode() || !appleWalletConfigured()) return { configured: false, cards: 0, phones: 0, sentAt: null, accepted: 0 };
  const sentAt = now.toISOString();
  const saved = await savedCards(venueId);
  // The mark goes in first: a phone woken a moment later must already find its card newer.
  const { error } = await db().from("audit_log").insert({ venue_id: venueId, actor: staffId, action: ACTION, detail: { cards: saved.cards, phones: saved.tokens.length }, created_at: sentAt });
  if (error) throw error;
  const accepted = await notifyAppleTokens(saved.tokens);
  return { configured: true, cards: saved.cards, phones: saved.tokens.length, sentAt, accepted };
}
