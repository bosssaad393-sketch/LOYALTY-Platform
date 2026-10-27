import type { Points, PointsRange } from "./types";

/** Whole numbers with thousands separators: 5,240. */
const num = (x: number) => Math.round(x).toLocaleString("en-GB");

/** Money in BHD always has three decimals: 1,845.500. */
export const bhd = (x: number) => x.toLocaleString("en-GB", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** "2026-10-15" -> "15 Oct". The day is already a Bahrain calendar day, so no time zone maths. */
export function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export const RANGES: { id: PointsRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All time" },
];

/** The opening words of the summary: "7 days to 15 Oct". */
export function rangeLead(p: Pick<Points, "range" | "to">): string {
  const to = dayLabel(p.to);
  if (p.range === "today") return `Today, ${to}`;
  if (p.range === "7d") return `7 days to ${to}`;
  if (p.range === "30d") return `30 days to ${to}`;
  return `All time to ${to}`;
}

/**
 * One plain paragraph the owner can paste into a message:
 * "7 days to 15 Oct: 5,240 points given out over 312 visits (bills BHD 1,845.500). 6 rewards given for 3,000 points. Guests hold 39,452 points."
 */
export function summaryText(p: Points): string {
  const visits = `${num(p.visits)} ${p.visits === 1 ? "visit" : "visits"}`;
  const rewards = p.rewards === 0 ? "No rewards given." : `${num(p.rewards)} ${p.rewards === 1 ? "reward" : "rewards"} given for ${num(p.redeemed)} points.`;
  return `${rangeLead(p)}: ${num(p.issued)} points given out over ${visits} (bills BHD ${bhd(p.billBhd)}). ${rewards} Guests hold ${num(p.held)} points.`;
}
