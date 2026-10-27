import { describe, expect, it } from "vitest";
import {
  UNDO_WINDOW_MS,
  balanceFromEntries,
  canRedeem,
  canUndo,
  pointsForBill,
} from "../src/lib/ledger";

describe("pointsForBill", () => {
  it("multiplies the bill by the rate", () => {
    expect(pointsForBill(10, 2)).toBe(20);
    expect(pointsForBill(25, 2)).toBe(50);
  });
  it("rounds down, never up", () => {
    expect(pointsForBill(4.75, 2)).toBe(9); // 9.5 -> 9
    expect(pointsForBill(1.234, 2)).toBe(2); // 2.468 -> 2
    expect(pointsForBill(0.499, 2)).toBe(0);
  });
  it("is exact with fils", () => {
    expect(pointsForBill(0.1 + 0.2, 10)).toBe(3); // float 0.30000000000000004
  });
  it("rejects bad input", () => {
    for (const bad of [0, -1, Number.NaN, Infinity, 5000.001]) {
      expect(() => pointsForBill(bad, 2)).toThrow();
    }
    expect(() => pointsForBill(10, 0)).toThrow();
    expect(() => pointsForBill(10, 1.5)).toThrow();
  });
});

describe("canRedeem", () => {
  it("needs at least the reward goal", () => {
    expect(canRedeem(500, 500)).toBe(true);
    expect(canRedeem(499, 500)).toBe(false);
    expect(canRedeem(1200, 500)).toBe(true);
  });
});

describe("canUndo", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const at = (msAgo: number) => new Date(now.getTime() - msAgo);

  it("allows a fresh earn", () => {
    expect(canUndo({ kind: "earn", created_at: at(60_000), alreadyUndone: false }, now).ok).toBe(true);
  });
  it("allows exactly at the window edge", () => {
    expect(canUndo({ kind: "redeem", created_at: at(UNDO_WINDOW_MS), alreadyUndone: false }, now).ok).toBe(true);
  });
  it("blocks after the window", () => {
    const r = canUndo({ kind: "earn", created_at: at(UNDO_WINDOW_MS + 1), alreadyUndone: false }, now);
    expect(r.ok).toBe(false);
  });
  it("blocks a second undo", () => {
    expect(canUndo({ kind: "earn", created_at: at(1000), alreadyUndone: true }, now).ok).toBe(false);
  });
  it("blocks undoing an undo, an adjust or a welcome", () => {
    for (const kind of ["undo", "adjust", "welcome"] as const) {
      expect(canUndo({ kind, created_at: at(1000), alreadyUndone: false }, now).ok).toBe(false);
    }
  });
});

describe("balanceFromEntries", () => {
  it("sums the ledger", () => {
    expect(balanceFromEntries([{ points: 100 }, { points: 50 }, { points: -150 }])).toBe(0);
  });
  it("an undo cancels its earn", () => {
    expect(balanceFromEntries([{ points: 40 }, { points: -40 }])).toBe(0);
  });
  it("an undone redeem gives the points back", () => {
    expect(balanceFromEntries([{ points: 500 }, { points: -500 }, { points: 500 }])).toBe(500);
  });
});
