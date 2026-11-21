import type { Points, PointsRange } from "./types";
import { makeT, type T } from "@/lib/uiLang";
import { tx } from "@/lib/uiArabic";

const EN = makeT("en");

/** Whole numbers with thousands separators: 5,240. */
const num = (x: number) => Math.round(x).toLocaleString("en-GB");

/** Money in BHD always has three decimals: 1,845.500. */
import { bhd } from "@/lib/format";
export { bhd };

/** "2026-10-15" -> "15 Oct". The day is already a Bahrain calendar day, so no time zone maths. */
export function dayLabel(day: string, t: T = EN): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(t.locale, { day: "numeric", month: "short", timeZone: "UTC" });
}

export const RANGES: { id: PointsRange; label: string }[] = [
  { id: "today", label: tx("Today") },
  { id: "7d", label: tx("7 days") },
  { id: "30d", label: tx("30 days") },
  { id: "all", label: tx("All time") },
];

/** The opening words of the summary: "7 days to 15 Oct". */
export function rangeLead(p: Pick<Points, "range" | "to">, t: T = EN): string {
  const to = dayLabel(p.to, t);
  if (p.range === "today") return t("Today, {date}", { date: to });
  if (p.range === "7d") return t("7 days to {date}", { date: to });
  if (p.range === "30d") return t("30 days to {date}", { date: to });
  return t("All time to {date}", { date: to });
}

/**
 * One plain paragraph the owner can paste into a message:
 * "7 days to 15 Oct: 5,240 points given out over 312 visits (bills BHD 1,845.500). 6 rewards given for 3,000 points. Guests hold 39,452 points."
 */
export function summaryText(p: Points, t: T = EN): string {
  if (t.lang === "ar") {
    const rewardsAr = p.rewards === 0 ? t("No rewards given.") : t("Rewards given: {n}, for {pts}.", { n: num(p.rewards), pts: num(p.redeemed) });
    return `${rangeLead(p, t)}: ${t("{n} given out over {visits} visits (bills BHD {bill}).", { n: num(p.issued), visits: num(p.visits), bill: bhd(p.billBhd) })} ${rewardsAr} ${t("Guests hold {n}.", { n: num(p.held) })}`;
  }
  const visits = `${num(p.visits)} ${p.visits === 1 ? "visit" : "visits"}`;
  const rewards = p.rewards === 0 ? "No rewards given." : `${num(p.rewards)} ${p.rewards === 1 ? "reward" : "rewards"} given for ${num(p.redeemed)} points.`;
  return `${rangeLead(p)}: ${num(p.issued)} points given out over ${visits} (bills BHD ${bhd(p.billBhd)}). ${rewards} Guests hold ${num(p.held)} points.`;
}
