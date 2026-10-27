// Offer rules. Pure: no database, no framework, easy to test and to read.
// The server code that uses these lives in offersDb.ts and passOffer.ts.
import { z } from "zod";

export const OFFER_MAX_CHARS = 200;
/** An offer stays on the Wallet card for this long after it was sent. */
export const OFFER_WINDOW_DAYS = 14;
export const OFFER_WINDOW_MS = OFFER_WINDOW_DAYS * 86_400_000;
/** The same message sent again inside this time is treated as a double tap, not a new offer. */
export const DUPLICATE_WINDOW_MS = 2 * 60_000;
/** Shown on the back of a card that agreed to offers but has none right now. */
export const NO_OFFER_TEXT = "No offer right now.";

export const OFFER_AUDIENCES = ["all", "apple", "google"] as const;
export type OfferAudience = (typeof OFFER_AUDIENCES)[number];
export type Platform = "apple" | "google";

/** One line of plain text: control characters and line breaks become spaces, runs of spaces collapse. */
export function cleanMessage(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const c = ch.codePointAt(0) ?? 0;
    out += c < 32 || c === 127 || /\s/.test(ch) ? " " : ch;
  }
  return out.replace(/ +/g, " ").trim();
}

export const OfferInput = z.object({
  message: z.string().max(2000).transform(cleanMessage).pipe(z.string().min(1).max(OFFER_MAX_CHARS)),
  audience: z.enum(OFFER_AUDIENCES).default("all"),
});
export type OfferInputValue = z.infer<typeof OfferInput>;

/** The id in /api/owner/offers/[id]/withdraw must be a uuid before it goes anywhere near the database. */
export const isOfferId = (id: unknown): id is string => z.uuid().safeParse(id).success;

/** Which wallet platforms an audience reaches. */
export function appliesTo(audience: string, platform: Platform): boolean {
  return audience === "all" || audience === platform;
}

// ---- who can receive offers ---------------------------------------------------------

export type MemberConsent = { consent_news: boolean | null; deleted_at: string | null } | null;
export type CardConsentRow = { id: string; members: MemberConsent };

/** The database may hand a joined row back as an object or as a one-item list. */
export function normaliseMember(raw: unknown): MemberConsent {
  const m = Array.isArray(raw) ? raw[0] : raw;
  if (!m || typeof m !== "object") return null;
  const r = m as { consent_news?: unknown; deleted_at?: unknown };
  return {
    consent_news: typeof r.consent_news === "boolean" ? r.consent_news : null,
    deleted_at: typeof r.deleted_at === "string" ? r.deleted_at : null,
  };
}

/** Agreed to offers, and not deleted. Anything unclear counts as "no". */
export const agreedToNews = (m: MemberConsent): boolean => Boolean(m && m.consent_news === true && !m.deleted_at);

/** Cards of guests who still exist (not deleted). */
export const isLiveMember = (m: MemberConsent): boolean => Boolean(m && !m.deleted_at);

export function countCards(rows: CardConsentRow[]): { total: number; eligible: number } {
  let total = 0;
  let eligible = 0;
  for (const r of rows) {
    if (!isLiveMember(r.members)) continue;
    total++;
    if (agreedToNews(r.members)) eligible++;
  }
  return { total, eligible };
}

export const eligibleCardIds = (rows: CardConsentRow[]): string[] => rows.filter((r) => agreedToNews(r.members)).map((r) => r.id);

/** Distinct cards and distinct devices behind a list of Apple registrations. */
export function applePlan(rows: { card_id: string; push_token: string }[]): { cards: number; tokens: string[] } {
  return { cards: new Set(rows.map((r) => r.card_id)).size, tokens: [...new Set(rows.map((r) => r.push_token))] };
}

// ---- the 14-day window ----------------------------------------------------------------

type Timed = { message: string; audience: string; sent_at: string; withdrawn_at?: string | null };

/** A withdrawn offer is history: it never shows on a card again. Anything non-empty in `withdrawn_at` counts. */
export const isWithdrawn = (o: { withdrawn_at?: string | null }): boolean => Boolean(o.withdrawn_at);

/** Parsed time in ms, or 0 when missing or unreadable. */
function timeOrZero(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const t = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

/**
 * The offer a card should show now: the newest one for this platform that was sent within the last 14 days
 * and was NOT withdrawn. If the newest offer is withdrawn, the one before it (when still inside the 14 days) shows.
 * An offer dated slightly in the future (clock difference between server and database) still counts.
 */
export function activeOffer<T extends Timed>(offers: T[], platform: Platform, now: number = Date.now()): T | null {
  let best: T | null = null;
  let bestAt = -Infinity;
  for (const o of offers) {
    if (isWithdrawn(o)) continue;
    if (!appliesTo(o.audience, platform)) continue;
    const at = Date.parse(o.sent_at);
    if (!Number.isFinite(at) || now - at > OFFER_WINDOW_MS) continue;
    if (at > bestAt) {
      best = o;
      bestAt = at;
    }
  }
  return best;
}

/** Is the offer still inside its 14 days, so that a card may still show it? An unreadable date counts as "no". */
export function inWindow(sentAt: string, now: number = Date.now()): boolean {
  const at = Date.parse(sentAt);
  return Number.isFinite(at) && now - at <= OFFER_WINDOW_MS;
}

/**
 * When the offer part of a card last changed (epoch ms), given the newest offer ever sent to that platform.
 * While the offer is live that is its send time; once it ran out, the moment it ran out. Apple only fetches a
 * card again when this is newer than the time it last asked.
 */
export function offerStamp(latestSentAt: string | number | null | undefined, now: number = Date.now()): number {
  if (latestSentAt == null) return 0;
  const t = typeof latestSentAt === "number" ? latestSentAt : Date.parse(latestSentAt);
  if (!Number.isFinite(t)) return 0;
  return now - t > OFFER_WINDOW_MS ? t + OFFER_WINDOW_MS : t;
}

/**
 * When the offer part of a Wallet card last changed, now that offers can be withdrawn. Apple only fetches a card
 * again when this is newer than the time it last asked, so every visible change has to move it forward:
 * - a new offer: its send time (`latestLiveSentAt` is the newest offer that is NOT withdrawn);
 * - the live offer running out: the moment it ran out (same rule as offerStamp);
 * - a withdrawal: the withdrawal time (`latestWithdrawnAt` is the newest `withdrawn_at`).
 * It never goes backwards: withdrawing the newest offer makes the older one show again, but the stamp stays at the
 * withdrawal time, so the cards that still show the withdrawn text are fetched again.
 */
export function offerChangeStamp(
  p: { latestLiveSentAt?: string | number | null; latestWithdrawnAt?: string | number | null },
  now: number = Date.now(),
): number {
  return Math.max(offerStamp(p.latestLiveSentAt, now), timeOrZero(p.latestWithdrawnAt));
}

/** An identical offer sent a moment ago (double tap): returns it so it is not sent twice. A withdrawn offer never counts. */
export function findRecentDuplicate<T extends Timed>(recent: T[], message: string, audience: string, now: number = Date.now()): T | null {
  for (const o of recent) {
    if (isWithdrawn(o)) continue;
    const at = Date.parse(o.sent_at);
    if (Number.isFinite(at) && now - at <= DUPLICATE_WINDOW_MS && o.message === message && o.audience === audience) return o;
  }
  return null;
}

// ---- Apple Wallet back field ------------------------------------------------------------

/**
 * The `offer` back field of an Apple pass. Only guests who agreed to offers get it.
 * With a live offer the field carries changeMessage "%@", so Wallet shows the offer text as the alert.
 * Without one it shows a neutral line and has no changeMessage: this way the field already exists on the card
 * when the first offer arrives (Apple does not document an alert for a field that is newly added), and an offer
 * running out never triggers an alert.
 *
 * `alert: false` shows the message without changeMessage. It is used when an OLDER offer shows again because newer
 * ones were withdrawn: the guest must not be alerted about the old offer a second time.
 */
export function appleOfferField(venueName: string, message: string | null, alert: boolean = true) {
  const label = `From ${venueName}`;
  if (!message) return { key: "offer", label, value: NO_OFFER_TEXT };
  return alert ? { key: "offer", label, value: message, changeMessage: "%@" } : { key: "offer", label, value: message };
}

/**
 * What the Apple pass of a guest who agreed to offers should say, from the venue's offers (withdrawn ones included).
 * - message: the newest offer that is not withdrawn and is inside the 14 days, or null ("No offer right now.").
 * - alert: true only when that offer is also the newest offer ever sent to Apple. When it is an older offer showing
 *   again because newer ones were withdrawn, there is no alert (Wallet would announce it as if it were new).
 *   A corrected offer sent before the original is withdrawn is still the newest one, so it does alert.
 */
export function appleOfferSelection<T extends Timed>(offers: T[], now: number = Date.now()): { message: string | null; alert: boolean } {
  const live = activeOffer(offers, "apple", now);
  if (!live) return { message: null, alert: false };
  const liveAt = Date.parse(live.sent_at);
  const olderOneResurfaced = offers.some((o) => isWithdrawn(o) && appliesTo(o.audience, "apple") && timeOrZero(o.sent_at) > liveAt);
  return { message: live.message, alert: !olderOneResurfaced };
}

// ---- API shape -----------------------------------------------------------------------------

export type OfferView = { id: string; message: string; audience: OfferAudience; sentAt: string; recipients: number };

export function offerView(row: { id: string; message: string; audience: string; sent_at: string; recipients?: number | null }): OfferView {
  const at = Date.parse(row.sent_at);
  return {
    id: row.id,
    message: row.message,
    audience: (OFFER_AUDIENCES as readonly string[]).includes(row.audience) ? (row.audience as OfferAudience) : "all",
    sentAt: Number.isFinite(at) ? new Date(at).toISOString() : row.sent_at,
    recipients: row.recipients ?? 0,
  };
}

/** One row of GET /api/owner/offers: the offer plus when it was withdrawn (null = still live or expired by age). */
export type OfferListItem = OfferView & { withdrawnAt: string | null };

export function offerListItem(row: Parameters<typeof offerView>[0] & { withdrawn_at?: string | null }): OfferListItem {
  const at = row.withdrawn_at ? Date.parse(row.withdrawn_at) : NaN;
  // A withdrawn offer with an unreadable date is still withdrawn: show the raw value rather than pretending it is live.
  const withdrawnAt = !row.withdrawn_at ? null : Number.isFinite(at) ? new Date(at).toISOString() : row.withdrawn_at;
  return { ...offerView(row), withdrawnAt };
}
