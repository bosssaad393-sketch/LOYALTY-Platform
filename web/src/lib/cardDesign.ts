import "server-only";
import { db } from "./supabase";
import { sampleMode } from "./demo";
import { appleWalletConfigured } from "./appleWallet";
import { notifyAppleTokens } from "./apns";

/**
 * Sending a new Wallet card design to the cards guests already saved (migration 0032).
 *
 * The card's picture, colours and wording are built on this server each time a phone asks for its card. A phone asks
 * when it is woken by a push and the card is newer than the copy it holds. So after a new design is deployed:
 * sendCardDesign marks every card of the business as newer (venues.pass_updated_at = now) and wakes every phone that
 * holds one. The guest does nothing: same card, same code, same visits and gifts.
 *
 * What cannot change this way: the pass type, the card's serial number (its id) and the address the card calls home
 * (PUBLIC_BASE_URL). Keep those for the life of the cards.
 */

const PAGE = 1000;
const IN_CHUNK = 100;

/** When each business last sent a design out. A database without the column (before 0032) answers nothing. */
export async function passDesignStamps(venueIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (venueIds.length === 0) return out;
  const { data, error } = await db().from("venues").select("id, pass_updated_at").in("id", venueIds);
  if (error) return out;
  for (const v of (data ?? []) as { id: string; pass_updated_at?: string | null }[]) {
    const t = v.pass_updated_at ? new Date(v.pass_updated_at).getTime() : 0;
    if (t > 0) out.set(v.id, t);
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
  /** When a design was last sent out; null = never. */
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
  const { error } = await db().from("venues").update({ pass_updated_at: sentAt }).eq("id", venueId);
  if (error) throw error;
  const saved = await savedCards(venueId);
  const accepted = await notifyAppleTokens(saved.tokens);
  await db().from("audit_log").insert({ venue_id: venueId, actor: staffId, action: "card_design_sent", detail: { cards: saved.cards, phones: saved.tokens.length, accepted } });
  return { configured: true, cards: saved.cards, phones: saved.tokens.length, sentAt, accepted };
}
