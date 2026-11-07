export { n } from "@/lib/format";
import { bahrainDay, bahrainTime } from "@/lib/format";

export function ago(iso: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

/** "today", "yesterday" or "5 days ago", for a request or a sent offer. */
export const when = ago;

export function greeting(): string {
  const h = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Bahrain" }));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function longDate(): string {
  return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Bahrain" });
}

/** "15 Oct, 21:02" in Bahrain time. */
export function stamp(iso: string): string {
  return `${bahrainDay(iso)}, ${bahrainTime(iso)}`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bahrain" });
}

export const AUDIENCE_LABEL = { all: "All guests who agreed", apple: "Apple Wallet only", google: "Google Wallet only" } as const;
