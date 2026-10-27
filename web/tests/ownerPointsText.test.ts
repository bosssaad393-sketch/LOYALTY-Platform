import { describe, expect, it } from "vitest";
import { bhd, dayLabel, rangeLead, summaryText } from "../src/app/owner/pointsText";
import type { Points } from "../src/app/owner/types";

const base: Points = {
  range: "7d",
  from: "2026-10-09",
  to: "2026-10-15",
  issued: 5240,
  redeemed: 3000,
  rewards: 6,
  visits: 312,
  billBhd: 1845.5,
  held: 39452,
  perDay: [],
};

describe("points summary text", () => {
  it("writes the example paragraph from the design brief", () => {
    expect(summaryText(base)).toBe("7 days to 15 Oct: 5,240 points given out over 312 visits (bills BHD 1,845.500). 6 rewards given for 3,000 points. Guests hold 39,452 points.");
  });

  it("starts with the right words for each range", () => {
    expect(rangeLead({ range: "today", to: "2026-10-15" })).toBe("Today, 15 Oct");
    expect(rangeLead({ range: "30d", to: "2026-10-15" })).toBe("30 days to 15 Oct");
    expect(rangeLead({ range: "all", to: "2026-10-15" })).toBe("All time to 15 Oct");
  });

  it("uses singular words for one visit and one reward", () => {
    const t = summaryText({ ...base, range: "today", visits: 1, rewards: 1, redeemed: 500 });
    expect(t).toContain("over 1 visit (");
    expect(t).toContain("1 reward given for 500 points.");
  });

  it("says plainly when no reward was given", () => {
    expect(summaryText({ ...base, rewards: 0, redeemed: 0 })).toContain("No rewards given. Guests hold");
  });

  it("always shows BHD with three decimals", () => {
    expect(bhd(0)).toBe("0.000");
    expect(bhd(12.5)).toBe("12.500");
    expect(bhd(1234567.1234)).toBe("1,234,567.123");
  });

  it("labels a Bahrain calendar day without shifting it", () => {
    expect(dayLabel("2026-10-01")).toBe("1 Oct");
    expect(dayLabel("2026-12-31")).toBe("31 Dec");
  });
});
