// Automatic notices (migration 0022): birthday, and "we miss you" after N days without a visit.
// Pure selection rules; autoMessagesDb.ts reads the guests and writes message_log.

const DAY = 86_400_000;
const BAHRAIN = 3 * 3600_000;

export type AutoKind = "birthday" | "winback";
export type AutoSetting = { kind: AutoKind; enabled: boolean; textEn: string; textAr: string | null; days: number };

export const DEFAULT_MESSAGES: Record<AutoKind, AutoSetting> = {
  birthday: { kind: "birthday", enabled: true, textEn: "Happy birthday, {name}. Come in and celebrate with us.", textAr: "كل عام وأنت بخير يا {name}. تفضل واحتفل معنا.", days: 14 },
  winback: { kind: "winback", enabled: true, textEn: "We have missed you, {name}. Your table is waiting.", textAr: "اشتقنا لك يا {name}. طاولتك بانتظارك.", days: 14 },
};

/** Day, month and year of "now" in Bahrain (UTC+3, no daylight saving). */
export function bahrainDate(now: number = Date.now()): { day: number; month: number; year: number; iso: string } {
  const d = new Date(now + BAHRAIN);
  return { day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear(), iso: d.toISOString().slice(0, 10) };
}

export type AutoGuest = {
  cardId: string;
  firstName: string;
  consentNews: boolean;
  deleted: boolean;
  birthDay: number | null;
  birthMonth: number | null;
  lastVisit: string | null;
};

export type DueMessage = { cardId: string; kind: AutoKind; period: string; message: string };

const fill = (text: string, name: string) => text.replace(/\{name\}/g, name).trim().slice(0, 200);

/** Only guests who agreed to offers and news, and who have not asked for their data to be deleted. */
const reachable = (g: AutoGuest) => g.consentNews && !g.deleted;

/**
 * Whose birthday is today (Bahrain). 29 February is greeted on 28 February in other years.
 * period = the year, so each guest is greeted once a year.
 */
export function dueBirthdays(guests: AutoGuest[], setting: AutoSetting, now: number = Date.now()): DueMessage[] {
  if (!setting.enabled) return [];
  const t = bahrainDate(now);
  const leap = (t.year % 4 === 0 && t.year % 100 !== 0) || t.year % 400 === 0;
  return guests
    .filter((g) => reachable(g) && g.birthMonth !== null && g.birthDay !== null)
    .filter((g) => (g.birthMonth === t.month && g.birthDay === t.day) || (!leap && t.month === 2 && t.day === 28 && g.birthMonth === 2 && g.birthDay === 29))
    .map((g) => ({ cardId: g.cardId, kind: "birthday" as const, period: String(t.year), message: fill(setting.textEn, g.firstName) }));
}

/** A notice switched on today does not write to everyone who left long ago: only spells that crossed the line in the last week. */
export const WINBACK_WINDOW_DAYS = 7;

/**
 * Who has not visited for `days` full days. period = the date of that last visit, so one quiet spell gets one notice.
 */
export function dueWinbacks(guests: AutoGuest[], setting: AutoSetting, now: number = Date.now()): DueMessage[] {
  if (!setting.enabled) return [];
  return guests
    .filter((g) => reachable(g) && g.lastVisit)
    .filter((g) => {
      const quiet = (now - Date.parse(g.lastVisit!)) / DAY;
      return quiet >= setting.days && quiet < setting.days + WINBACK_WINDOW_DAYS;
    })
    .map((g) => ({ cardId: g.cardId, kind: "winback" as const, period: g.lastVisit!.slice(0, 10), message: fill(setting.textEn, g.firstName) }));
}

/** How long a notice stays on the card: 7 days. */
export const NOTICE_DAYS = 7;
export function liveNotice<T extends { sent_at: string; message: string }>(log: T[], now: number = Date.now()): T | null {
  const fresh = log.filter((m) => now - Date.parse(m.sent_at) < NOTICE_DAYS * DAY).sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at));
  return fresh[0] ?? null;
}
