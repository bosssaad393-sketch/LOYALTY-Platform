// What the join page asks for (venues.join_fields, migration 0022) and the birthday a guest may give.
// Pure, so it is easy to test.

export type JoinField = "mobile" | "email" | "birthday";
const KNOWN: JoinField[] = ["mobile", "email", "birthday"];

/** The fields the venue asks for besides the name. Nothing set = mobile only (how every venue worked before 0022). */
export function joinFields(raw: unknown): JoinField[] {
  const list = Array.isArray(raw) ? raw.map((x) => String(x).trim().toLowerCase()) : [];
  const out = KNOWN.filter((f) => list.includes(f));
  return out.length ? out : ["mobile"];
}

export type Birthday = { day: number; month: number; year: number | null };

const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Reads a birthday: "YYYY-MM-DD" (a date picker), "DD/MM" or "DD/MM/YYYY". Empty = no birthday (it is optional).
 * Returns "bad" for anything that is not a real day, a year before 1900 or a date in the future.
 */
export function parseBirthday(raw: unknown, now: Date = new Date()): Birthday | null | "bad" {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let day: number, month: number, year: number | null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dm = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}))?$/);
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dm) [day, month, year] = [Number(dm[1]), Number(dm[2]), dm[3] ? Number(dm[3]) : null];
  else return "bad";
  if (month < 1 || month > 12 || day < 1 || day > DAYS_IN[month - 1]) return "bad";
  if (year !== null) {
    if (year < 1900) return "bad";
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    if (month === 2 && day === 29 && !leap) return "bad";
    if (Date.UTC(year, month - 1, day) > now.getTime()) return "bad";
  }
  return { day, month, year };
}
