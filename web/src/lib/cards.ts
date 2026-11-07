import "server-only";
import { randomInt } from "node:crypto";
import { db, type Card, type Venue } from "./supabase";

export type CardView = { card: Card; venue: Venue; memberName: string };

/** Creates a member and their card at a venue. Retries if the 4-digit code is already taken. */
export async function createCard(
  venue: Venue,
  input: { name: string; phone?: string; email?: string; news: boolean },
): Promise<Card> {
  const { data: member, error: mErr } = await db()
    .from("members")
    .insert({
      name: input.name,
      phone: input.phone || null,
      email: input.email || null,
      consent_terms: new Date().toISOString(),
      consent_news: input.news,
    })
    .select("id")
    .single();
  if (mErr) throw mErr;

  for (let attempt = 0; attempt < 20; attempt++) {
    const code = String(randomInt(1000, 10000));
    const { data, error } = await db()
      .from("cards")
      .insert({ venue_id: venue.id, member_id: member.id, code })
      .select("id, venue_id, member_id, code, points, visits")
      .single();
    if (!error) return data;
    if (error.code !== "23505") throw error; // 23505 = code already used at this venue
  }
  throw new Error("Could not find a free card code. The venue may be full.");
}

/**
 * True when a guest who has not deleted their data already holds a card at this venue under this mobile or email.
 * Used to stop a second card (points split over two). The card itself is never handed out here: typing someone's
 * number must not open their card, so the guest gets it back from staff, who can see them.
 */
export async function hasCardAt(venueId: string, contact: { phone?: string; email?: string }): Promise<boolean> {
  const ids = new Set<string>();
  for (const [col, value] of [["phone", contact.phone], ["email", contact.email]] as const) {
    if (!value) continue;
    const { data, error } = await db().from("members").select("id, deleted_at").eq(col, value).is("deleted_at", null).limit(50);
    if (error) throw error;
    for (const m of data ?? []) ids.add(m.id as string);
  }
  if (!ids.size) return false;
  const { data, error } = await db().from("cards").select("id").eq("venue_id", venueId).in("member_id", [...ids]).limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function getCardView(cardId: string): Promise<CardView | null> {
  const { data, error } = await db()
    .from("cards")
    .select("id, venue_id, member_id, code, points, visits, created_at, members(name, deleted_at), venues(id, slug, name, points_per_bhd, reward_goal, reward_text)")
    .eq("id", cardId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const member = data.members as unknown as { name: string; deleted_at: string | null } | null;
  const venue = data.venues as unknown as Venue | null;
  if (!member || member.deleted_at || !venue) return null;
  const card: Card = {
    id: data.id,
    venue_id: data.venue_id,
    member_id: data.member_id,
    code: data.code,
    points: data.points,
    visits: data.visits,
    created_at: data.created_at,
  };
  return { card, venue, memberName: member.name };
}

export { isUuid } from "./ids";
