import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the Supabase client that, like the real one, answers at most 1000 rows per request.
// No network and no real database: this only checks how pointsSummaryDb reads pages and which filters it sends.
const fake = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  calls: [] as { table: string; from: number; to: number; filters: string[] }[],
  error: null as { message: string } | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", () => ({
  db: () => ({
    from: (table: string) => {
      const filters: ((r: Record<string, unknown>) => boolean)[] = [];
      const described: string[] = [];
      let from = 0;
      let to = 999;
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), described.push(`eq ${c}`), b),
        gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), described.push(`gte ${c} ${v}`), b),
        order: () => b,
        range: (f: number, t: number) => ((from = f), (to = t), b),
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
          fake.calls.push({ table, from, to, filters: described });
          if (fake.error) return Promise.resolve({ data: null, error: fake.error }).then(ok, bad);
          const hits = (fake.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
          return Promise.resolve({ data: hits.slice(from, Math.min(to, from + 999) + 1), error: null }).then(ok, bad);
        },
      };
      return b;
    },
  }),
}));

import { pointsSummaryFor } from "../src/lib/pointsSummaryDb";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const VENUE = "venue-1";
const earnRow = (id: number, at = "2026-10-15T09:00:00Z", venue = VENUE) => ({ id, venue_id: venue, kind: "earn", points: 1, bill_bhd: 0.5, created_at: at, undoes: null });
const cardRow = (id: number, points: number, venue = VENUE) => ({ id, venue_id: venue, points });

beforeEach(() => {
  fake.tables = {};
  fake.calls = [];
  fake.error = null;
});

describe("pointsSummaryFor", () => {
  it("reads past the 1000-row limit page by page, for the ledger and for the cards", async () => {
    fake.tables.ledger = Array.from({ length: 2350 }, (_, i) => earnRow(i + 1));
    fake.tables.cards = Array.from({ length: 1200 }, (_, i) => cardRow(i + 1, 2));
    const s = await pointsSummaryFor(VENUE, "today", NOW);
    expect(s.visits).toBe(2350);
    expect(s.issued).toBe(2350);
    expect(s.billBhd).toBe(1175);
    expect(s.held).toBe(2400);
    expect(fake.calls.filter((c) => c.table === "ledger")).toHaveLength(3);
    expect(fake.calls.filter((c) => c.table === "cards")).toHaveLength(2);
  });

  it("asks for one more (empty) page when a table holds exactly 1000 rows, and loses none", async () => {
    fake.tables.ledger = Array.from({ length: 1000 }, (_, i) => earnRow(i + 1));
    const s = await pointsSummaryFor(VENUE, "today", NOW);
    expect(s.visits).toBe(1000);
    expect(fake.calls.filter((c) => c.table === "ledger").map((c) => [c.from, c.to])).toEqual([[0, 999], [1000, 1999]]);
  });

  it("only reads this venue's rows", async () => {
    fake.tables.ledger = [earnRow(1), earnRow(2, "2026-10-15T09:00:00Z", "other-venue")];
    fake.tables.cards = [cardRow(1, 10), cardRow(2, 99, "other-venue")];
    const s = await pointsSummaryFor(VENUE, "today", NOW);
    expect(s.visits).toBe(1);
    expect(s.held).toBe(10);
  });

  it("limits short ranges to the range start, and reads everything for 'all'", async () => {
    fake.tables.ledger = [earnRow(1, "2026-10-14T20:00:00Z"), earnRow(2, "2026-10-14T22:00:00Z")];
    const today = await pointsSummaryFor(VENUE, "today", NOW);
    expect(today.visits).toBe(1); // the first row is 23:00 on the 14th in Bahrain
    expect(fake.calls.find((c) => c.table === "ledger")?.filters).toContain("gte created_at 2026-10-14T21:00:00.000Z");
    fake.calls = [];
    const all = await pointsSummaryFor(VENUE, "all", NOW);
    expect(all.visits).toBe(2);
    expect(fake.calls.find((c) => c.table === "ledger")?.filters.some((f) => f.startsWith("gte"))).toBe(false);
  });

  it("fails loudly past the safety cap instead of showing totals that miss rows", async () => {
    fake.tables.ledger = Array.from({ length: 100_001 }, (_, i) => earnRow(i + 1));
    await expect(pointsSummaryFor(VENUE, "all", NOW)).rejects.toThrow(/more than 100000 rows/);
  });

  it("turns a database error into an error (the route answers 500, nothing half-built)", async () => {
    fake.error = { message: "connection reset" };
    await expect(pointsSummaryFor(VENUE, "7d", NOW)).rejects.toThrow(/connection reset/);
  });
});
