import { describe, expect, it } from "vitest";
import { insights, liveVisitTimes } from "../src/lib/ownerInsights";

const NOW = Date.UTC(2026, 10, 11, 9, 0, 0); // Wednesday 11 Nov 2026, 12:00 in Bahrain
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

describe("owner insights", () => {
  it("is empty, not invented, when there are no guests", () => {
    expect(insights([], [], 500, NOW)).toEqual({ visited: 0, returning: 0, returningRate: null, lapsed: 0, nearReward: 0, rewardReady: 0, busiest: null });
  });

  it("counts returning guests among those who visited", () => {
    const cards = [
      { points: 0, visits: 0, lastVisit: null },
      { points: 10, visits: 1, lastVisit: ago(2) },
      { points: 40, visits: 3, lastVisit: ago(1) },
      { points: 90, visits: 2, lastVisit: ago(5) },
    ];
    const r = insights(cards, [], 500, NOW);
    expect(r.visited).toBe(3);
    expect(r.returning).toBe(2);
    expect(r.returningRate).toBe(67);
  });

  it("counts a guest as not seen only after 30 days, and never one who has not visited", () => {
    const cards = [
      { points: 0, visits: 0, lastVisit: null },
      { points: 10, visits: 1, lastVisit: ago(29) },
      { points: 10, visits: 1, lastVisit: ago(31) },
      { points: 10, visits: 4, lastVisit: ago(60) },
    ];
    expect(insights(cards, [], 500, NOW).lapsed).toBe(2);
  });

  it("splits near a reward (80% of the goal) from reward ready", () => {
    const cards = [399, 400, 499, 500, 1200].map((points) => ({ points, visits: 1, lastVisit: ago(1) }));
    const r = insights(cards, [], 500, NOW);
    expect(r.nearReward).toBe(2);
    expect(r.rewardReady).toBe(2);
  });

  it("says nothing about rewards when the goal is not set", () => {
    const r = insights([{ points: 900, visits: 1, lastVisit: ago(1) }], [], 0, NOW);
    expect([r.nearReward, r.rewardReady]).toEqual([0, 0]);
  });

  it("finds the busiest weekday in Bahrain time, inside the last 90 days", () => {
    // 22:30 UTC on Thursday is 01:30 on Friday in Bahrain.
    const lateThursday = new Date(Date.UTC(2026, 10, 5, 22, 30)).toISOString();
    const friday = new Date(Date.UTC(2026, 10, 6, 15, 0)).toISOString();
    const monday = new Date(Date.UTC(2026, 10, 9, 15, 0)).toISOString();
    const r = insights([], [lateThursday, friday, monday, ago(200), "not a date"], 500, NOW);
    expect(r.busiest).toEqual({ weekday: 5, visits: 2, share: 67 });
  });

  it("leaves out visits that staff undid", () => {
    const rows = [
      { id: 1, kind: "earn", undoes: null, created_at: ago(3) },
      { id: 2, kind: "earn", undoes: null, created_at: ago(2) },
      { id: 3, kind: "undo", undoes: 1, created_at: ago(2) },
      { id: 4, kind: "redeem", undoes: null, created_at: ago(1) },
    ];
    expect(liveVisitTimes(rows)).toEqual([ago(2)]);
  });
});
