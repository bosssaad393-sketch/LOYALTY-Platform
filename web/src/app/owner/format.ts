export { n } from "@/lib/format";
import { bahrainDay, bahrainTime } from "@/lib/format";
import { makeT, type T } from "@/lib/uiLang";
import { tx } from "@/lib/uiArabic";

const EN = makeT("en");

export function ago(iso: string | null, t: T = EN): string {
  if (!iso) return t("never");
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? t("today") : d === 1 ? t("yesterday") : t("{n} days ago", { n: d });
}

/** "today", "yesterday" or "5 days ago", for a request or a sent offer. */
export const when = ago;

export function greeting(t: T = EN): string {
  const h = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Bahrain" }));
  return h < 12 ? t("Good morning") : h < 18 ? t("Good afternoon") : t("Good evening");
}

export function longDate(t: T = EN): string {
  return new Date().toLocaleDateString(t.locale, { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Bahrain" });
}

/** "15 Oct, 21:02" in Bahrain time. */
export function stamp(iso: string): string {
  return `${bahrainDay(iso)}, ${bahrainTime(iso)}`;
}

export function shortDate(iso: string, t: T = EN): string {
  return new Date(iso).toLocaleDateString(t.locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bahrain" });
}

/** English; show through t(). */
export const AUDIENCE_LABEL = { all: tx("All guests who agreed"), apple: tx("Apple Wallet only"), google: tx("Google Wallet only") } as const;
