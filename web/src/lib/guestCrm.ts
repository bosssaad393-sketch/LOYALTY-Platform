import { NEW_WITHIN_DAYS, QUIET_AFTER_DAYS, REGULAR_VISITS, type SegmentCard } from "./offers";

/**
 * The guest record (migration 0034): where a guest stands, their labels and the story of their card.
 * No database here, so the list, the record and the tests all work from the same rules.
 */

/**
 * Where a guest stands today, one answer per guest so the list can be filtered by it. The numbers are the ones the
 * offers use (lib/offers.ts), so "Regulars" on this screen and "Regulars" when sending an offer are the same people.
 *   quiet   : has visited, but not for QUIET_AFTER_DAYS
 *   regular : REGULAR_VISITS visits or more, and seen recently
 *   new     : joined within NEW_WITHIN_DAYS
 *   waiting : joined longer ago and has not visited yet
 *   active  : everyone else (a few visits, seen recently)
 */
export const GUEST_STAGES = ["new", "regular", "active", "quiet", "waiting"] as const;
export type GuestStage = (typeof GUEST_STAGES)[number];

export function guestStage(c: SegmentCard, now: number = Date.now()): GuestStage {
  const day = 86_400_000;
  if (c.visits > 0 && c.lastVisit !== null && Date.parse(c.lastVisit) < now - QUIET_AFTER_DAYS * day) return "quiet";
  if (c.visits >= REGULAR_VISITS) return "regular";
  if (c.joined !== null && Date.parse(c.joined) >= now - NEW_WITHIN_DAYS * day) return "new";
  return c.visits > 0 ? "active" : "waiting";
}

export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 24;

/** Labels as the venue typed them, tidied: trimmed, lower case, no doubles, no empty ones, eight at most. */
export function cleanTags(input: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const tag = raw.normalize("NFKC").replace(/[\u0000-\u001f,]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase().slice(0, MAX_TAG_LENGTH).trim();
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

export const tagsOf = (value: unknown): string[] => (Array.isArray(value) ? cleanTags(value) : []);

/** One line in a guest's story. `text` is filled by the venue's own data (a gift title, a note); `place` is a branch. */
export type GuestEvent =
  | { kind: "joined"; at: string; place: string | null }
  | { kind: "visit"; at: string; place: string | null; by: string | null }
  | { kind: "visit_removed"; at: string; by: string | null }
  | { kind: "reward_used"; at: string; by: string | null }
  | { kind: "gift_ready"; at: string; text: string }
  | { kind: "gift_used"; at: string; text: string }
  | { kind: "gift_cancelled"; at: string; text: string }
  | { kind: "bill"; at: string; fils: number; place: string | null }
  | { kind: "note"; at: string; id: string; text: string; by: string };

/** Newest first. Two things at the same moment keep the order they were given in. */
export function newestFirst(events: GuestEvent[]): GuestEvent[] {
  return events.map((e, i) => ({ e, i })).sort((a, b) => Date.parse(b.e.at) - Date.parse(a.e.at) || a.i - b.i).map((x) => x.e);
}

/** The value seen most often, when it is seen at least twice and more than any other. Null = no clear habit yet. */
export function mostOften<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  if (!ranked.length || ranked[0][1] < 2 || (ranked[1] && ranked[1][1] === ranked[0][1])) return null;
  return ranked[0][0];
}

/** Day of the week in Bahrain (UTC+3): 0 = Sunday. */
export const bahrainWeekday = (iso: string) => new Date(Date.parse(iso) + 3 * 3_600_000).getUTCDay();

/** Days between visits on average, from the visits themselves. Null until there are two. */
export function daysBetweenVisits(visitTimes: string[]): number | null {
  const t = visitTimes.map((v) => Date.parse(v)).filter(Number.isFinite).sort((a, b) => a - b);
  if (t.length < 2) return null;
  return Math.round(((t[t.length - 1] - t[0]) / (t.length - 1) / 86_400_000) * 10) / 10;
}
