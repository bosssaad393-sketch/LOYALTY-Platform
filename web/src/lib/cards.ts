import "server-only";
import { randomInt } from "node:crypto";
import { db, type Card, type Venue } from "./supabase";
import { parseTiers, stampState, type StampState } from "./stamps";

/** `stamps` is set for stamp venues (0020): the reward due next and the ladder. */
export type CardView = { card: Card; venue: Venue; memberName: string; stamps?: StampState; /** Visit card (0022): no points, no stamps. */ visitMode?: boolean; lastVisit?: string | null };

/** Creates a member and their card at a venue. Retries if the 4-digit code is already taken. */
export async function createCard(
  venue: Venue,
  input: { name: string; phone?: string; email?: string; news: boolean; birthday?: { day: number; month: number; year: number | null } | null; branchId?: string | null; /** 0027: the card whose invite link this guest joined with. */ invitedBy?: string | null },
): Promise<Card> {
  const { data: member, error: mErr } = await db()
    .from("members")
    .insert({
      name: input.name,
      phone: input.phone || null,
      email: input.email || null,
      consent_terms: new Date().toISOString(),
      consent_news: input.news,
      ...(input.birthday ? { birth_day: input.birthday.day, birth_month: input.birthday.month, birth_year: input.birthday.year } : {}),
    })
    .select("id")
    .single();
  if (mErr) throw mErr;

  for (let attempt = 0; attempt < 20; attempt++) {
    const code = String(randomInt(1000, 10000));
    const row: Record<string, unknown> = { venue_id: venue.id, member_id: member.id, code, ...(input.branchId ? { joined_branch: input.branchId } : {}) };
    let { data, error } = await db().from("cards").insert(input.invitedBy ? { ...row, invited_by: input.invitedBy } : row).select("id, venue_id, member_id, code, points, visits").single();
    // A database without 0027 has no place for the invite: the guest still gets their card.
    if (error && input.invitedBy && /invited_by/.test(error.message ?? "")) ({ data, error } = await db().from("cards").insert(row).select("id, venue_id, member_id, code, points, visits").single());
    if (!error) return data as Card;
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
    .select("id, venue_id, member_id, code, points, visits, rewards_given, last_visit, created_at, members(name, deleted_at), venues(id, slug, name, points_per_bhd, reward_goal, reward_text, stamp_tiers, card_mode)")
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
  const tiers = parseTiers((venue as { stamp_tiers?: unknown }).stamp_tiers);
  const stamps = tiers ? stampState(tiers, data.points, Number((data as { rewards_given?: number }).rewards_given ?? 0)) : undefined;
  const visitMode = (venue as { card_mode?: string | null }).card_mode === "visits";
  return { card, venue, memberName: member.name, stamps, visitMode, lastVisit: (data as { last_visit?: string | null }).last_visit ?? null };
}

export { isUuid } from "./ids";

// ---- Bring a friend (migration 0027)

const INVITE_LETTERS = "abcdefghjkmnpqrstuvwxyz23456789";
const newInvite = () => Array.from({ length: 10 }, () => INVITE_LETTERS[randomInt(0, INVITE_LETTERS.length)]).join("");
export const isInvite = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9]{8,16}$/.test(v);

/** The guest's invite code, made the first time it is asked for. Null on a database without 0027. */
export async function inviteOf(cardId: string): Promise<string | null> {
  try {
    const { data, error } = await db().from("cards").select("invite").eq("id", cardId).maybeSingle();
    if (error || !data) return null;
    if (typeof data.invite === "string" && data.invite) return data.invite;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newInvite();
      const { data: set, error: e } = await db().from("cards").update({ invite: code }).eq("id", cardId).is("invite", null).select("invite");
      if (!e && (set ?? []).length) return code;
      if (!e) break; // another tap set it first: read it below
    }
    const again = await db().from("cards").select("invite").eq("id", cardId).maybeSingle();
    return typeof again.data?.invite === "string" && again.data.invite ? again.data.invite : null;
  } catch {
    return null;
  }
}

/** The card behind an invite code at this venue, or null. Never throws. */
export async function cardByInvite(venueId: string, code: string): Promise<string | null> {
  if (!isInvite(code)) return null;
  try {
    const { data, error } = await db().from("cards").select("id").eq("venue_id", venueId).eq("invite", code).maybeSingle();
    return error || !data ? null : String(data.id);
  } catch {
    return null;
  }
}

/** The card that invited this one, or null. Never throws. */
export async function inviterOf(cardId: string): Promise<string | null> {
  try {
    const { data, error } = await db().from("cards").select("invited_by").eq("id", cardId).maybeSingle();
    return error || !data?.invited_by ? null : String(data.invited_by);
  } catch {
    return null;
  }
}
