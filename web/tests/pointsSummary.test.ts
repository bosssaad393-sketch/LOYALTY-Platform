import { describe, expect, it, beforeEach } from "vitest";
import {
  PER_DAY_CAP,
  PointsRangeInput,
  rangeStartMs,
  summarisePoints,
  type PointsLedgerRow,
  type PointsRange,
} from "../src/lib/pointsSummary";

const DAY = 86_400_000;
// 12:00 UTC = 15:00 in Bahrain on Thursday 15 October 2026.
const NOW = Date.parse("2026-10-15T12:00:00Z");

/** An ISO time at the given Bahrain clock time, `daysAgo` Bahrain days before today (2026-10-15). */
const bh = (daysAgo: number, hhmm = "12:00") => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 9, 15, h - 3, m) - daysAgo * DAY).toISOString();
};
/** The Bahrain calendar day `daysAgo` days before today, as "YYYY-MM-DD". */
const dayOf = (daysAgo: number) => new Date(Date.UTC(2026, 9, 15) - daysAgo * DAY).toISOString().slice(0, 10);

let nextId = 1;
beforeEach(() => {
  nextId = 1;
});
const row = (kind: string, points: number, created_at: string, o: Partial<PointsLedgerRow> = {}): PointsLedgerRow => ({
  id: nextId++,
  kind,
  points,
  bill_bhd: null,
  created_at,
  undoes: null,
  ...o,
});
const earn = (points: number, bill: number | string | null, created_at: string, o: Partial<PointsLedgerRow> = {}) => row("earn", points, created_at, { bill_bhd: bill, ...o });
const redeem = (created_at: string, points = -500, o: Partial<PointsLedgerRow> = {}) => row("redeem", points, created_at, o);
const undo = (target: number | string, points: number, created_at: string, o: Partial<PointsLedgerRow> = {}) => row("undo", points, created_at, { undoes: target, ...o });

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("empty ledger", () => {
  it("gives zeros and one empty perDay item per day for every range", () => {
    const expected: [PointsRange, number, string][] = [
      ["today", 1, dayOf(0)],
      ["7d", 7, "2026-10-09"],
      ["30d", 30, dayOf(29)],
      ["all", 1, dayOf(0)],
    ];
    for (const [range, days, from] of expected) {
      const s = summarisePoints([], range, NOW, 0);
      expect(s.range).toBe(range);
      expect(s.from).toBe(from);
      expect(s.to).toBe("2026-10-15");
      expect([s.issued, s.redeemed, s.rewards, s.visits, s.billBhd]).toEqual([0, 0, 0, 0, 0]);
      expect(s.perDay).toHaveLength(days);
      expect(s.perDay.every((d) => d.issued === 0 && d.redeemed === 0)).toBe(true);
      expect(s.perDay[s.perDay.length - 1].day).toBe("2026-10-15");
    }
  });
  it("passes the points held through unchanged, whatever the range", () => {
    for (const range of ["today", "7d", "30d", "all"] as const) expect(summarisePoints([], range, NOW, 39452).held).toBe(39452);
  });
  it("shows 0 held if the caller hands over something that is not a number", () => {
    expect(summarisePoints([], "7d", NOW, Number.NaN).held).toBe(0);
  });
});

describe("totals", () => {
  it("adds earn and redeem entries, and shows the redeemed points as a positive number", () => {
    const rows = [
      earn(100, 50, bh(0, "10:00")),
      earn(40, 20.5, bh(1, "19:30")),
      redeem(bh(0, "13:00"), -500),
    ];
    const s = summarisePoints(rows, "7d", NOW, 1234);
    expect(s.issued).toBe(140);
    expect(s.redeemed).toBe(500);
    expect(s.rewards).toBe(1);
    expect(s.visits).toBe(2);
    expect(s.billBhd).toBe(70.5);
    expect(s.held).toBe(1234);
  });
  it("counts redeemed points as positive in perDay too", () => {
    const s = summarisePoints([redeem(bh(0), -500), redeem(bh(0, "18:00"), -300)], "today", NOW, 0);
    expect(s.perDay).toEqual([{ day: "2026-10-15", issued: 0, redeemed: 800 }]);
    expect(s.rewards).toBe(2);
  });
  it("does not depend on the order of the rows (an undo can come before the entry in the list)", () => {
    const rows = [undo(1, -100, bh(0, "10:05"), { id: 2 }), earn(100, 50, bh(0, "10:00"), { id: 1 }), earn(20, 10, bh(0, "11:00"), { id: 3 })];
    const s = summarisePoints(rows, "today", NOW, 0);
    expect([s.issued, s.visits, s.billBhd]).toEqual([20, 1, 10]);
  });
});

describe("undone entries", () => {
  it("drops an earn that was undone, with its points, visit and bill", () => {
    const rows = [earn(100, 50, bh(0, "10:00"), { id: 1 }), undo(1, -100, bh(0, "10:05"), { id: 2 }), earn(20, 10, bh(0, "11:00"), { id: 3 })];
    const s = summarisePoints(rows, "7d", NOW, 0);
    expect(s.issued).toBe(20);
    expect(s.visits).toBe(1);
    expect(s.billBhd).toBe(10);
    expect(s.redeemed).toBe(0);
    expect(s.perDay[6].issued).toBe(20);
  });
  it("drops a redeem that was undone, from both the points and the reward count", () => {
    const rows = [redeem(bh(0, "10:00"), -500, { id: 1 }), undo(1, 500, bh(0, "10:04"), { id: 2 })];
    const s = summarisePoints(rows, "7d", NOW, 0);
    expect([s.issued, s.redeemed, s.rewards]).toEqual([0, 0, 0]);
    expect(s.perDay.every((d) => d.issued === 0 && d.redeemed === 0)).toBe(true);
  });
  it("never counts undo rows themselves, not even when the entry they undo is missing from the rows", () => {
    const s = summarisePoints([undo(999, 500, bh(0)), undo(998, -100, bh(1))], "all", NOW, 0);
    expect([s.issued, s.redeemed, s.rewards, s.visits, s.billBhd]).toEqual([0, 0, 0, 0, 0]);
  });
  it("matches ids whether the database gave numbers or strings", () => {
    const rows = [earn(100, 50, bh(0, "10:00"), { id: 7 }), undo("7", -100, bh(0, "10:02"), { id: "8" })];
    expect(summarisePoints(rows, "today", NOW, 0).issued).toBe(0);
  });
  it("handles an undo that lands on the next Bahrain day: undone on either day's view", () => {
    const rows = [earn(100, 50, bh(1, "23:58"), { id: 1 }), undo(1, -100, bh(0, "00:03"), { id: 2 })];
    // Today alone: the earn is yesterday (outside), the undo is never counted.
    expect(summarisePoints(rows, "today", NOW, 0).issued).toBe(0);
    // Both days in view: the earn is undone, so nothing counts.
    const week = summarisePoints(rows, "7d", NOW, 0);
    expect([week.issued, week.visits, week.billBhd]).toEqual([0, 0, 0]);
  });
});

describe("Bahrain days", () => {
  it("puts 21:30 UTC in the next Bahrain day, and 20:59:59 UTC in the previous one", () => {
    const rows = [
      earn(10, 5, "2026-10-14T20:59:59Z"), // 23:59:59 on the 14th in Bahrain
      earn(10, 5, "2026-10-14T21:00:00Z"), // 00:00:00 on the 15th
      earn(10, 5, "2026-10-14T21:30:00Z"), // 00:30 on the 15th
      earn(10, 5, "2026-10-15T20:59:59Z"), // 23:59:59 on the 15th (still today, after "now")
      earn(10, 5, "2026-10-15T21:00:00Z"), // 00:00 on the 16th: tomorrow, not in any summary
    ];
    const today = summarisePoints(rows, "today", NOW, 0);
    expect(today.visits).toBe(3);
    expect(today.issued).toBe(30);
    const week = summarisePoints(rows, "7d", NOW, 0);
    expect(week.visits).toBe(4);
    expect(week.perDay[5]).toEqual({ day: "2026-10-14", issued: 10, redeemed: 0 });
    expect(week.perDay[6]).toEqual({ day: "2026-10-15", issued: 30, redeemed: 0 });
  });
  it("uses the Bahrain date of NOW for 'today', even just after midnight there", () => {
    const justAfterMidnight = Date.parse("2026-10-14T21:05:00Z"); // 00:05 on the 15th in Bahrain
    const s = summarisePoints([earn(10, 5, "2026-10-14T20:50:00Z")], "today", justAfterMidnight, 0);
    expect(s.to).toBe("2026-10-15");
    expect(s.visits).toBe(0);
  });
  it("lists consecutive days across a month end and a leap day", () => {
    const days = (iso: string, range: PointsRange) => summarisePoints([], range, Date.parse(iso), 0).perDay.map((d) => d.day);
    expect(days("2026-11-02T12:00:00Z", "7d")).toEqual(["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(days("2028-03-02T12:00:00Z", "7d")).toEqual(["2028-02-25", "2028-02-26", "2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01", "2028-03-02"]);
  });
});

describe("ranges", () => {
  const rows = () => [0, 6, 7, 29, 30, 100].map((d) => earn(10, 5, bh(d)));
  it("today = 1 day, 7d = 7 days, 30d = 30 days, all = everything", () => {
    expect(summarisePoints(rows(), "today", NOW, 0).visits).toBe(1);
    expect(summarisePoints(rows(), "7d", NOW, 0).visits).toBe(2);
    expect(summarisePoints(rows(), "30d", NOW, 0).visits).toBe(4);
    expect(summarisePoints(rows(), "all", NOW, 0).visits).toBe(6);
  });
  it("from and to are the first and last day included", () => {
    expect(summarisePoints(rows(), "7d", NOW, 0)).toMatchObject({ from: "2026-10-09", to: "2026-10-15" });
    expect(summarisePoints(rows(), "30d", NOW, 0)).toMatchObject({ from: dayOf(29), to: dayOf(0) });
    expect(summarisePoints(rows(), "all", NOW, 0)).toMatchObject({ from: dayOf(100), to: dayOf(0) });
  });
  it("rangeStartMs is the first instant of the first day, null for all", () => {
    expect(rangeStartMs("today", NOW)).toBe(Date.parse("2026-10-14T21:00:00Z"));
    expect(rangeStartMs("7d", NOW)).toBe(Date.parse("2026-10-08T21:00:00Z"));
    expect(rangeStartMs("30d", new Date(NOW))).toBe(Date.parse("2026-09-15T21:00:00Z"));
    expect(rangeStartMs("all", NOW)).toBeNull();
  });
  it("accepts a Date for now as well as epoch milliseconds", () => {
    const rs = rows();
    expect(summarisePoints(rs, "7d", new Date(NOW), 5)).toEqual(summarisePoints(rs, "7d", NOW, 5));
  });
});

describe("perDay", () => {
  it("has one item per day, oldest first, empty days included", () => {
    const rows = [earn(100, 50, bh(0)), redeem(bh(0, "18:00")), earn(50, 25, bh(2))];
    const s = summarisePoints(rows, "7d", NOW, 0);
    expect(s.perDay).toEqual([
      { day: "2026-10-09", issued: 0, redeemed: 0 },
      { day: "2026-10-10", issued: 0, redeemed: 0 },
      { day: "2026-10-11", issued: 0, redeemed: 0 },
      { day: "2026-10-12", issued: 0, redeemed: 0 },
      { day: "2026-10-13", issued: 50, redeemed: 0 },
      { day: "2026-10-14", issued: 0, redeemed: 0 },
      { day: "2026-10-15", issued: 100, redeemed: 500 },
    ]);
  });
  it("has the right length for each range", () => {
    const rows = [earn(10, 5, bh(0))];
    expect(summarisePoints(rows, "today", NOW, 0).perDay).toHaveLength(1);
    expect(summarisePoints(rows, "7d", NOW, 0).perDay).toHaveLength(7);
    expect(summarisePoints(rows, "30d", NOW, 0).perDay).toHaveLength(30);
  });
  it("adds up to the totals for today, 7d and 30d", () => {
    // A deterministic mix of earns, redeems, welcome bonuses and undos over 40 days.
    const rows: PointsLedgerRow[] = [];
    let seed = 12345;
    const rnd = () => {
      // mulberry32: small, deterministic, good enough to spread rows over days
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 400; i++) {
      const at = bh(Math.floor(rnd() * 40), `${String(Math.floor(rnd() * 22)).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}`);
      const k = rnd();
      const r = k < 0.7 ? earn(Math.floor(rnd() * 200) + 1, Math.floor(rnd() * 90) + 1, at) : k < 0.85 ? redeem(at) : row("welcome", 25, at);
      rows.push(r);
      if (r.kind !== "welcome" && rnd() < 0.1) rows.push(undo(r.id, -r.points, new Date(Date.parse(at) + 120_000).toISOString()));
    }
    for (const range of ["today", "7d", "30d"] as const) {
      const s = summarisePoints(rows, range, NOW, 0);
      expect(sum(s.perDay.map((d) => d.issued))).toBe(s.issued);
      expect(sum(s.perDay.map((d) => d.redeemed))).toBe(s.redeemed);
    }
    expect(summarisePoints(rows, "30d", NOW, 0).issued).toBeGreaterThan(0);
  });
});

describe("range=all", () => {
  it("covers the whole history in the totals but only the last 90 days in perDay", () => {
    const rows = [earn(10, 5, bh(200)), earn(10, 5, bh(95)), earn(10, 5, bh(50)), earn(10, 5, bh(0))];
    const s = summarisePoints(rows, "all", NOW, 0);
    expect(s.visits).toBe(4);
    expect(s.issued).toBe(40);
    expect(s.billBhd).toBe(20);
    expect(s.from).toBe(dayOf(200));
    expect(s.to).toBe(dayOf(0));
    expect(s.perDay).toHaveLength(PER_DAY_CAP);
    expect(s.perDay[0].day).toBe(dayOf(89));
    expect(s.perDay[PER_DAY_CAP - 1].day).toBe(dayOf(0));
    expect(sum(s.perDay.map((d) => d.issued))).toBe(20); // only the two entries inside the last 90 days
  });
  it("starts perDay on the first entry's day when the history is shorter than 90 days", () => {
    const s = summarisePoints([earn(10, 5, bh(10)), earn(10, 5, bh(3))], "all", NOW, 0);
    expect(s.from).toBe(dayOf(10));
    expect(s.perDay).toHaveLength(11);
    expect(s.perDay[0]).toEqual({ day: dayOf(10), issued: 10, redeemed: 0 });
  });
  it("keeps exactly 90 days at the edge: 89 days ago fits, 90 days ago is cut from perDay but not from the totals", () => {
    const a = summarisePoints([earn(10, 5, bh(89))], "all", NOW, 0);
    expect(a.perDay).toHaveLength(90);
    expect(a.perDay[0]).toEqual({ day: dayOf(89), issued: 10, redeemed: 0 });
    const b = summarisePoints([earn(10, 5, bh(90))], "all", NOW, 0);
    expect(b.perDay).toHaveLength(90);
    expect(b.from).toBe(dayOf(90));
    expect(b.issued).toBe(10);
    expect(sum(b.perDay.map((d) => d.issued))).toBe(0);
  });
  it("uses today as the first day when nothing was ever recorded, or only unusable rows exist", () => {
    expect(summarisePoints([], "all", NOW, 0).from).toBe(dayOf(0));
    expect(summarisePoints([earn(10, 5, "not a date"), earn(10, 5, bh(-3))], "all", NOW, 0)).toMatchObject({ from: dayOf(0), visits: 0 });
  });
});

describe("bill total", () => {
  it("rounds to 3 decimals so float noise never shows (33 x 0.1 is 3.3, not 3.3000000000000016)", () => {
    const rows = Array.from({ length: 33 }, () => earn(1, 0.1, bh(0)));
    expect(summarisePoints(rows, "today", NOW, 0).billBhd).toBe(3.3);
  });
  it("keeps fils exactly and accepts bills the database sends as strings", () => {
    const rows = [earn(24, "12.345", bh(0)), earn(1, 0.001, bh(0)), earn(2, "1.000", bh(1))];
    expect(summarisePoints(rows, "7d", NOW, 0).billBhd).toBe(13.346);
  });
  it("ignores a missing or unreadable bill instead of turning the total into NaN", () => {
    const rows = [earn(10, null, bh(0)), earn(10, "abc", bh(0)), earn(10, 5.25, bh(0))];
    const s = summarisePoints(rows, "today", NOW, 0);
    expect(s.billBhd).toBe(5.25);
    expect(s.visits).toBe(3);
  });
  it("only counts bills of live earn entries, not of redeems or undone earns", () => {
    const rows = [earn(10, 5, bh(0), { id: 1 }), undo(1, -10, bh(0, "12:01"), { id: 2, bill_bhd: 5 }), row("redeem", -500, bh(0), { bill_bhd: 9 })];
    expect(summarisePoints(rows, "today", NOW, 0).billBhd).toBe(0);
  });
});

describe("other ledger kinds", () => {
  it("counts a welcome bonus as points given out, but not as a visit or a bill", () => {
    const s = summarisePoints([row("welcome", 50, bh(0))], "today", NOW, 0);
    expect([s.issued, s.visits, s.billBhd, s.redeemed, s.rewards]).toEqual([50, 0, 0, 0, 0]);
    expect(s.perDay[0].issued).toBe(50);
  });
  it("ignores adjustments (plus or minus) and kinds it does not know", () => {
    const rows = [row("adjust", 30, bh(0)), row("adjust", -20, bh(0)), row("bonus", 99, bh(0))];
    const s = summarisePoints(rows, "today", NOW, 400);
    expect([s.issued, s.redeemed, s.rewards, s.visits]).toEqual([0, 0, 0, 0]);
    expect(s.held).toBe(400); // an adjustment still shows up in what guests hold
  });
});

describe("bad rows", () => {
  it("skips rows with an unreadable date or a date after today instead of failing", () => {
    const rows = [earn(10, 5, "not a date"), earn(10, 5, bh(-2)), earn(10, 5, bh(0))];
    const s = summarisePoints(rows, "7d", NOW, 0);
    expect(s.visits).toBe(1);
    expect(s.issued).toBe(10);
  });
});

describe("PointsRangeInput", () => {
  it("defaults to 7d when the range is missing", () => {
    expect(PointsRangeInput.safeParse(undefined)).toMatchObject({ success: true, data: "7d" });
  });
  it("accepts the four ranges", () => {
    for (const r of ["today", "7d", "30d", "all"]) expect(PointsRangeInput.safeParse(r)).toMatchObject({ success: true, data: r });
  });
  it("rejects everything else", () => {
    for (const r of ["", "week", "7D", "90d", " today", "all,today", null, 7]) expect(PointsRangeInput.safeParse(r).success).toBe(false);
  });
});
