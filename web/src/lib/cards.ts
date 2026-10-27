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

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
