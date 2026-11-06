import { describe, expect, it } from "vitest";
import { CartInput, dayPart, orderPatch, parsePriceFils, priceCart, salesReport, tabCanClose, waitTable, type MenuRow } from "../src/lib/table/rules";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const row = (id: string, over: Partial<MenuRow> = {}): MenuRow => ({ id, name_en: "Tea", name_ar: null, price_fils: 1500, available: true, active: true, ...over });
const NOW = "2026-11-06T18:00:00.000Z";

describe("priceCart", () => {
  it("takes prices from the menu and adds them up exactly", () => {
    const r = priceCart({ items: [{ id: A, qty: 3 }, { id: B, qty: 1 }] }, [row(A, { price_fils: 100 }), row(B, { price_fils: 200 })]);
    expect(r).toMatchObject({ ok: true, totalFils: 500 });
  });
  it("ignores a price sent by the browser", () => {
    const parsed = CartInput.parse({ items: [{ id: A, qty: 1, price_fils: 1 }] });
    const r = priceCart(parsed, [row(A)]);
    expect(r).toMatchObject({ ok: true, totalFils: 1500 });
  });
  it("stops the whole order when an item is sold out, removed or unknown", () => {
    expect(priceCart({ items: [{ id: A, qty: 1 }] }, [row(A, { available: false })])).toEqual({ ok: false, unavailable: [A] });
    expect(priceCart({ items: [{ id: A, qty: 1 }] }, [row(A, { active: false })])).toEqual({ ok: false, unavailable: [A] });
    expect(priceCart({ items: [{ id: A, qty: 1 }] }, [])).toEqual({ ok: false, unavailable: [A] });
  });
  it("refuses bad quantities", () => {
    for (const qty of [0, -1, 21, 1.5]) expect(CartInput.safeParse({ items: [{ id: A, qty }] }).success).toBe(false);
    expect(CartInput.safeParse({ items: [] }).success).toBe(false);
  });
});

describe("parsePriceFils", () => {
  it("reads BHD with up to 3 decimals", () => {
    expect(parsePriceFils("1.5")).toBe(1500);
    expect(parsePriceFils("1.500")).toBe(1500);
    expect(parsePriceFils("0.005")).toBe(5);
    expect(parsePriceFils("12")).toBe(12000);
  });
  it("refuses anything else", () => {
    for (const t of ["", "abc", "1.2345", "-1", "1,5"]) expect(parsePriceFils(t)).toBeNull();
  });
});

describe("orderPatch", () => {
  it("walks new, accepted, ready, served", () => {
    expect(orderPatch("new", "accept", 10, NOW)).toEqual({ status: "accepted", accepted_at: NOW, ready_minutes: 10 });
    expect(orderPatch("accepted", "ready", undefined, NOW)).toEqual({ status: "ready", ready_at: NOW });
    expect(orderPatch("ready", "serve", undefined, NOW)).toEqual({ status: "served", served_at: NOW });
  });
  it("accepts only 10 or 20 minutes", () => {
    expect(orderPatch("new", "accept", 15, NOW)).toBeNull();
    expect(orderPatch("new", "accept", undefined, NOW)).toBeNull();
  });
  it("refuses steps that skip or go back", () => {
    expect(orderPatch("new", "ready", undefined, NOW)).toBeNull();
    expect(orderPatch("served", "cancel", undefined, NOW)).toBeNull();
    expect(orderPatch("ready", "cancel", undefined, NOW)).toBeNull();
    expect(orderPatch("cancelled", "accept", 10, NOW)).toBeNull();
  });
});

describe("tabCanClose", () => {
  it("waits for rounds still being made", () => {
    expect(tabCanClose([{ status: "served" }, { status: "cancelled" }, { status: "ready" }])).toBe(true);
    expect(tabCanClose([{ status: "new" }])).toBe(false);
    expect(tabCanClose([{ status: "accepted" }])).toBe(false);
    expect(tabCanClose([])).toBe(true);
  });
});

describe("reports", () => {
  it("uses Bahrain time for the part of the day", () => {
    expect(dayPart("2026-11-06T15:30:00.000Z")).toBe("evening"); // 18:30 in Bahrain
    expect(dayPart("2026-11-06T21:30:00.000Z")).toBe("late"); // 00:30 in Bahrain
    expect(dayPart("2026-11-06T05:00:00.000Z")).toBe("morning"); // 08:00 in Bahrain
    expect(dayPart("2026-11-06T10:00:00.000Z")).toBe("afternoon"); // 13:00 in Bahrain
  });
  it("averages waits and leaves out requests still open", () => {
    const at = "2026-11-06T15:00:00.000Z";
    const rows = waitTable(
      [{ created_at: at, accepted_at: "2026-11-06T15:02:00.000Z", ready_at: "2026-11-06T15:12:00.000Z" }, { created_at: at, accepted_at: "2026-11-06T15:04:00.000Z", ready_at: null }],
      [{ kind: "coal", created_at: at, handled_at: "2026-11-06T15:05:00.000Z" }, { kind: "coal", created_at: at, handled_at: null }],
    );
    const evening = rows.find((r) => r.part === "evening")!;
    expect(evening.accept).toEqual({ count: 2, avgMinutes: 3 });
    expect(evening.ready).toEqual({ count: 1, avgMinutes: 12 });
    expect(evening.coal).toEqual({ count: 1, avgMinutes: 5 });
    expect(evening.bill).toEqual({ count: 0, avgMinutes: null });
  });
  it("leaves cancelled rounds out of sales and ranks items by value", () => {
    const at = "2026-11-06T15:00:00.000Z";
    const r = salesReport(
      [
        { order_id: "1", name_en: "Tea", price_fils: 1000, qty: 2, created_at: at },
        { order_id: "1", name_en: "Cake", price_fils: 3000, qty: 1, created_at: at },
        { order_id: "2", name_en: "Tea", price_fils: 1000, qty: 9, created_at: at },
      ],
      new Set(["2"]),
    );
    expect(r.totalFils).toBe(5000);
    expect(r.items.map((i) => i.name)).toEqual(["Cake", "Tea"]);
    expect(r.perHour[18].fils).toBe(5000);
  });
});
