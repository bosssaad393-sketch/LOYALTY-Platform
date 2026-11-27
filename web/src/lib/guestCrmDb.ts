import "server-only";
import { db } from "./supabase";
import type { Staff } from "./staffAuth";
import { listBranches } from "./branchesDb";
import { cardVouchers } from "./vouchersDb";
import { bahrainWeekday, cleanTags, daysBetweenVisits, guestStage, mostOften, newestFirst, tagsOf, type GuestEvent, type GuestStage } from "./guestCrm";

type Raw = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Before migration 0034 the labels column and the notes table are not there: the record still opens, without them. */
const missing = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === "42703" || error.code === "42P01" || error.code === "PGRST204" || error.code === "PGRST205" || /tags|guest_notes/.test(error.message ?? ""));

export type GuestRecord = {
  cardId: string; code: string; name: string; stage: GuestStage; tags: string[];
  visits: number; points: number; lastVisit: string | null; joined: string; joinedAt: string | null;
  /** Day and month only: a venue greets a birthday, it does not need the year. */
  birthday: { day: number; month: number } | null;
  /** Agreed to news and offers on their card. */
  offers: boolean;
  wallet: "apple" | "google" | null;
  everyDays: number | null;
  giftsReady: number; giftsUsed: number;
  spentFils: number; bills: number;
  /** Worked out from the visits and bills themselves. Null = no clear habit yet (needs the same thing twice). */
  usualPlace: string | null; usualWeekday: number | null; favourite: string | null;
  /** False until migration 0034 is on this database: the screen then hides notes and labels instead of failing. */
  notesReady: boolean;
  events: GuestEvent[];
};

/** Everything about one guest of this venue, or null when the card is not this venue's. Contact details stay out. */
export async function guestRecord(venueId: string, cardId: string): Promise<GuestRecord | null> {
  let got = await db().from("cards")
    .select("id, code, points, visits, last_visit, created_at, joined_branch, wallet_platform, tags, members(name, deleted_at, consent_news, birth_day, birth_month)")
    .eq("id", cardId).eq("venue_id", venueId).maybeSingle();
  if (missing(got.error)) {
    got = await db().from("cards")
      .select("id, code, points, visits, last_visit, created_at, joined_branch, wallet_platform, members(name, deleted_at, consent_news, birth_day, birth_month)")
      .eq("id", cardId).eq("venue_id", venueId).maybeSingle();
  }
  if (got.error) throw got.error;
  const card = got.data as Raw | null;
  const member = (card?.members ?? null) as Raw | null;
  if (!card || !member || member.deleted_at || !text(member.name)) return null;

  const [branches, ledger, gifts, receipts, notes] = await Promise.all([
    listBranches(venueId, { includeInactive: true }).catch(() => []),
    db().from("ledger").select("id, kind, points, branch_id, created_at, staff_users(name)").eq("card_id", cardId).eq("venue_id", venueId).order("created_at", { ascending: false }).limit(300),
    cardVouchers(cardId, venueId),
    db().from("receipts").select("id, total_fils, branch_id, refunded_at, created_at").eq("card_id", cardId).eq("venue_id", venueId).order("created_at", { ascending: false }).limit(200),
    db().from("guest_notes").select("id, author, body, created_at").eq("card_id", cardId).eq("venue_id", venueId).order("created_at", { ascending: false }).limit(200),
  ]);
  if (ledger.error) throw ledger.error;
  const place = (id: unknown) => branches.find((b) => b.id === id)?.name ?? null;
  const joined = String(card.created_at);
  const events: GuestEvent[] = [];
  const visitTimes: string[] = [];
  const visitPlaces: string[] = [];

  for (const l of (ledger.data ?? []) as Raw[]) {
    const at = String(l.created_at), by = text((l.staff_users as Raw | null)?.name);
    if (l.kind === "earn") { events.push({ kind: "visit", at, place: place(l.branch_id), by }); visitTimes.push(at); const p = place(l.branch_id); if (p) visitPlaces.push(p); }
    else if (l.kind === "undo" && Number(l.points) <= 0) events.push({ kind: "visit_removed", at, by });
    else if (l.kind === "redeem") events.push({ kind: "reward_used", at, by });
  }
  for (const g of gifts) {
    events.push({ kind: "gift_ready", at: g.issuedAt, text: g.title });
    if (g.status === "redeemed" && g.redeemedAt) events.push({ kind: "gift_used", at: g.redeemedAt, text: g.title });
    if (g.status === "void") events.push({ kind: "gift_cancelled", at: g.redeemedAt ?? g.issuedAt, text: g.title });
  }
  // A till that is not connected has no receipts table rows; a database without the table simply shows no bills.
  const paid = receipts.error ? [] : ((receipts.data ?? []) as Raw[]).filter((r) => !r.refunded_at);
  for (const r of paid) events.push({ kind: "bill", at: String(r.created_at), fils: Number(r.total_fils) || 0, place: place(r.branch_id) });
  // What they order most, from the lines of their paid bills. No bills, or no table of lines: nothing to say.
  let favourite: string | null = null;
  if (paid.length) {
    const lines = await db().from("receipt_items").select("receipt_id, name, qty").eq("venue_id", venueId).in("receipt_id", paid.map((r) => r.id));
    const names = lines.error ? [] : ((lines.data ?? []) as Raw[]).flatMap((l) => Array.from({ length: Math.min(Math.max(Number(l.qty) || 1, 1), 20) }, () => String(l.name)));
    favourite = mostOften(names);
  }
  const notesReady = !notes.error;
  for (const n of notesReady ? ((notes.data ?? []) as Raw[]) : []) events.push({ kind: "note", at: String(n.created_at), id: String(n.id), text: String(n.body), by: String(n.author) });
  events.push({ kind: "joined", at: joined, place: place(card.joined_branch) });

  const visits = Number(card.visits) || 0, lastVisit = text(card.last_visit);
  const day = Number(member.birth_day), month = Number(member.birth_month);
  return {
    cardId, code: String(card.code), name: String(member.name), tags: tagsOf(card.tags),
    stage: guestStage({ visits, lastVisit, joined }),
    visits, points: Number(card.points) || 0, lastVisit, joined, joinedAt: place(card.joined_branch),
    birthday: day >= 1 && month >= 1 ? { day, month } : null,
    offers: member.consent_news === true,
    wallet: card.wallet_platform === "apple" || card.wallet_platform === "google" ? card.wallet_platform : null,
    everyDays: daysBetweenVisits(visitTimes),
    giftsReady: gifts.filter((g) => g.status === "issued").length, giftsUsed: gifts.filter((g) => g.status === "redeemed").length,
    spentFils: paid.reduce((s, r) => s + (Number(r.total_fils) || 0), 0), bills: paid.length,
    usualPlace: mostOften(visitPlaces), usualWeekday: mostOften(visitTimes.map(bahrainWeekday)), favourite,
    notesReady, events: newestFirst(events),
  };
}

const ownCard = async (venueId: string, cardId: string) =>
  !!(await db().from("cards").select("id").eq("id", cardId).eq("venue_id", venueId).maybeSingle()).data;

/** A note on a guest, signed with the name of who wrote it. "not_ready" = migration 0034 is not on this database yet. */
export async function addGuestNote(staff: Staff, cardId: string, body: string): Promise<"saved" | "no_card" | "not_ready"> {
  if (!(await ownCard(staff.venueId, cardId))) return "no_card";
  const { error } = await db().from("guest_notes").insert({ venue_id: staff.venueId, card_id: cardId, staff_id: staff.id, author: staff.name.slice(0, 80) || "Team", body });
  if (missing(error)) return "not_ready";
  if (error) throw error;
  return "saved";
}

export async function removeGuestNote(staff: Staff, noteId: string): Promise<boolean> {
  const { data } = await db().from("guest_notes").select("id").eq("id", noteId).eq("venue_id", staff.venueId).maybeSingle();
  if (!data) return false;
  const { error } = await db().from("guest_notes").delete().eq("id", noteId).eq("venue_id", staff.venueId);
  if (error) throw error;
  return true;
}

export async function setGuestTags(staff: Staff, cardId: string, tags: readonly unknown[]): Promise<string[] | "no_card" | "not_ready"> {
  if (!(await ownCard(staff.venueId, cardId))) return "no_card";
  const clean = cleanTags(tags);
  const { error } = await db().from("cards").update({ tags: clean }).eq("id", cardId).eq("venue_id", staff.venueId);
  if (missing(error)) return "not_ready";
  if (error) throw error;
  return clean;
}
