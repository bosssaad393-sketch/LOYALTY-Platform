// Table booking requests (migration 0028). Pure rules, safe in the browser.
import { z } from "zod";

export type BookingStatus = "pending" | "confirmed" | "declined" | "cancelled";
/** A request must be at least this far ahead, and no further than BOOK_AHEAD_DAYS. */
export const BOOK_NOTICE_MINUTES = 30;
export const BOOK_AHEAD_DAYS = 60;
export const BOOK_MAX_PARTY = 30;

export const BookingInput = z.object({
  venue: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/),
  party: z.number().int().min(1).max(BOOK_MAX_PARTY),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  note: z.string().trim().max(300).optional().default(""),
  branch: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
});
export type BookingInput = z.infer<typeof BookingInput>;

/** The moment a Bahrain day and clock time mean (Bahrain is UTC+3 all year), or null when it is not a real date. */
export function bookingMoment(date: string, time: string): Date | null {
  const d = new Date(`${date}T${time}:00+03:00`);
  if (Number.isNaN(d.getTime())) return null;
  // "2026-02-31" must not slide into March.
  return new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10) === date ? d : null;
}

export function bookingWindow(at: Date, now: number = Date.now()): "ok" | "too_soon" | "too_far" {
  if (at.getTime() < now + BOOK_NOTICE_MINUTES * 60_000) return "too_soon";
  if (at.getTime() > now + BOOK_AHEAD_DAYS * 86_400_000) return "too_far";
  return "ok";
}

/** Today and the last bookable day in Bahrain, as YYYY-MM-DD, for the date box. */
export function bookingDays(now: number = Date.now()): { min: string; max: string } {
  const day = (t: number) => new Date(t + 3 * 3_600_000).toISOString().slice(0, 10);
  return { min: day(now), max: day(now + BOOK_AHEAD_DAYS * 86_400_000) };
}

export type BookingView = { id: string; name: string; phone: string; party: number; at: string; note: string | null; status: BookingStatus; reply: string | null; branchName: string | null; member: boolean; createdAt: string };
/** What the guest sees of their own request: no ids, nothing about anyone else. */
export type MyBooking = { venueName: string; party: number; at: string; status: BookingStatus; reply: string | null; past: boolean };
