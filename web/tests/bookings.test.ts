import { describe, expect, it } from "vitest";
import { BookingInput, bookingDays, bookingMoment, bookingWindow } from "@/lib/bookings";

const NOW = Date.parse("2026-11-26T12:00:00Z"); // 15:00 in Bahrain

describe("a table request", () => {
  const ok = { venue: "roshinah", name: "Maryam", phone: "+973 3333 4444", party: 4, date: "2026-11-27", time: "20:30" };

  it("reads a Bahrain day and time as the right moment", () => {
    expect(bookingMoment("2026-11-27", "20:30")?.toISOString()).toBe("2026-11-27T17:30:00.000Z");
    expect(bookingMoment("2026-11-27", "01:00")?.toISOString()).toBe("2026-11-26T22:00:00.000Z");
    expect(bookingMoment("2026-02-31", "20:00")).toBeNull();
    expect(bookingMoment("2026-13-01", "20:00")).toBeNull();
  });

  it("must be at least half an hour ahead and inside sixty days", () => {
    expect(bookingWindow(new Date(NOW + 20 * 60_000), NOW)).toBe("too_soon");
    expect(bookingWindow(new Date(NOW + 31 * 60_000), NOW)).toBe("ok");
    expect(bookingWindow(new Date(NOW + 59 * 86_400_000), NOW)).toBe("ok");
    expect(bookingWindow(new Date(NOW + 61 * 86_400_000), NOW)).toBe("too_far");
    expect(bookingDays(NOW)).toEqual({ min: "2026-11-26", max: "2027-01-25" });
    // 23:30 in Bahrain is already tomorrow there only after 21:00 UTC.
    expect(bookingDays(Date.parse("2026-11-26T21:30:00Z")).min).toBe("2026-11-27");
  });

  it("accepts a complete request and refuses a broken one", () => {
    expect(BookingInput.safeParse(ok).success).toBe(true);
    for (const bad of [{ party: 0 }, { party: 31 }, { party: 2.5 }, { phone: "abc" }, { name: " " }, { time: "25:00" }, { date: "27/11/2026" }, { venue: "Bad Venue" }, { note: "x".repeat(301) }, { branch: "No Spaces" }]) {
      expect(BookingInput.safeParse({ ...ok, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
