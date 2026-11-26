import { describe, expect, it } from "vitest";
import { spending, type SpendBill } from "@/lib/guestOrders";
import { nextMilestone } from "@/lib/vouchers";

const NOW = Date.parse("2026-11-26T12:00:00Z");
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
const bill = (id: number, cardId: string, fils: number, days: number): SpendBill => ({ id, cardId, totalFils: fils, at: ago(days) });

describe("the owner's spending picture", () => {
  const guests = [
    { cardId: "a", name: "Ali", lastVisit: ago(2) },
    { cardId: "b", name: "Badriya", lastVisit: ago(45) },
    { cardId: "c", name: "", lastVisit: ago(1) },
  ];
  const bills = [bill(1, "a", 10_000, 3), bill(2, "a", 6_000, 20), bill(3, "b", 30_000, 50), bill(4, "c", 99_000, 1)];
  const lines = [
    { receiptId: 1, name: "Karak tea", qty: 2 }, { receiptId: 1, name: "Hummus", qty: 1 },
    { receiptId: 2, name: "karak  Tea", qty: 1 }, { receiptId: 3, name: "Old dish", qty: 9 },
  ];

  it("counts bills and the average over 30 days, dishes by quantity, spenders over 90 days", () => {
    const s = spending(bills, lines, guests, NOW);
    expect(s.bills).toBe(3);
    expect(s.totalFils).toBe(115_000);
    expect(s.avgFils).toBe(38_333);
    expect(s.dishes).toEqual([{ name: "Karak tea", qty: 3, bills: 2 }, { name: "Hummus", qty: 1, bills: 1 }]);
    expect(s.spenders.map((g) => [g.name, g.spentFils, g.bills])).toEqual([["Badriya", 30_000, 1], ["Ali", 16_000, 2]]);
  });

  it("names good spenders who went quiet, and never an erased guest", () => {
    const s = spending(bills, lines, guests, NOW);
    expect(s.quiet.map((g) => g.name)).toEqual(["Badriya"]);
    expect(JSON.stringify(s)).not.toContain('"cardId":"c"');
  });

  it("is all zeros with no bills", () => {
    expect(spending([], [], [], NOW)).toEqual({ bills: 0, totalFils: 0, avgFils: null, dishes: [], spenders: [], quiet: [] });
  });
});

describe("the next gift on the ladder", () => {
  const gift = (id: string, atVisit: number | null, over = {}) => ({ id, trigger: "visit_count" as const, atVisit, active: true, ...over });
  const defs = [gift("ten", 10), gift("five", 5), gift("off", 3, { active: false }), { id: "first", trigger: "first_visit" as const, atVisit: null, active: true }];

  it("is the nearest one still ahead, with the visits left", () => {
    expect(nextMilestone(defs, 2, [])).toMatchObject({ gift: { id: "five" }, left: 3 });
    expect(nextMilestone(defs, 5, [])).toMatchObject({ gift: { id: "ten" }, left: 5 });
    expect(nextMilestone(defs, 4, ["five"])).toMatchObject({ gift: { id: "ten" }, left: 6 });
    expect(nextMilestone(defs, 10, [])).toBeNull();
  });
});
