// The join page's date of birth: a day select and a month select, both optional together. Pure, so it is easy to test.
// No year on purpose: the birthday notice needs only the day and the month (autoMessages.ts), and a guest in a queue
// picks two values faster than scrolling a date wheel back thirty years. Less personal data kept, too.

const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** How many days the select offers for a month (1-12). No month chosen yet = 31. February keeps the 29th. */
export function daysIn(month: number | null): number {
  return month && month >= 1 && month <= 12 ? DAYS_IN[month - 1] : 31;
}

/**
 * What the form sends as `birthday`: "" when both are empty, "DD/MM" when both are chosen (the format /api/join reads),
 * "half" when only one is chosen, so the page can ask for the other before sending.
 */
export function birthdayValue(day: string, month: string): string | "half" {
  const d = Number(day) || 0;
  const m = Number(month) || 0;
  if (!d && !m) return "";
  if (!d || !m || m > 12 || d > daysIn(m)) return "half";
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
