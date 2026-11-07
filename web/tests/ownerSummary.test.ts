import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Staff } from "../src/lib/staffAuth";

// The owner summary route asks Postgres for the numbers (owner_summary, migration 0015) instead of fetching rows.
// The SQL itself is tested in migrations.test.ts against a real Postgres; this checks the route around it.

const h = vi.hoisted(() => ({ staff: null as Staff | null, calls: [] as { fn: string; args: Record<string, unknown> }[], tablesRead: [] as string[], answer: null as unknown, fail: false }));

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/staffAuth", () => ({ currentStaff: async () => h.staff }));
vi.mock("../src/lib/supabase", () => ({
  db: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => { h.calls.push({ fn, args }); return h.fail ? { data: null, error: { message: "boom" } } : { data: h.answer, error: null }; },
    from: (table: string) => {
      h.tablesRead.push(table);
      const q = { select: () => q, eq: () => q, single: async () => ({ data: { name: "Venue A", points_per_bhd: 3, reward_goal: 300, reward_text: "A free dessert" }, error: null }) };
      return q;
    },
  }),
}));

import { GET } from "../src/app/api/owner/summary/route";

const VA = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const days = Array.from({ length: 14 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, "0")}`, visits: String(i) }));

beforeEach(() => {
  h.staff = { id: "s", name: "Owner", role: "owner", venueId: VA, venueSlug: "a", venueName: "Venue A" };
  h.calls = [];
  h.tablesRead = [];
  h.fail = false;
  h.answer = { members: "1200", newThisWeek: 50, pointsHeld: "36000", visits7d: 6, visitsPrev7d: 4, rewards30d: 1, perDay14: days };
});

describe("owner summary", () => {
  it("asks Postgres for this venue's numbers, from the start of today in Bahrain", async () => {
    await GET();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].fn).toBe("owner_summary");
    expect(h.calls[0].args.p_venue).toBe(VA);
    const t = new Date(String(h.calls[0].args.p_today));
    expect((t.getUTCHours() + 3) % 24).toBe(0);
    expect(t.getUTCMinutes()).toBe(0);
  });
  it("never fetches cards or ledger rows", async () => {
    await GET();
    expect(h.tablesRead).toEqual(["venues"]);
  });
  it("answers numbers (big counts arrive from Postgres as text) with the venue", async () => {
    const body = await (await GET()).json();
    expect(body).toMatchObject({ members: 1200, pointsHeld: 36000, visits7d: 6, venue: { name: "Venue A" } });
    expect(body.perDay14[13]).toEqual({ day: "2026-11-14", visits: 13 });
  });
  it("a database error is a plain 500, never a half answer", async () => {
    h.fail = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await GET()).status).toBe(500);
    log.mockRestore();
  });
  it("a manager may see it; nobody signed in may not", async () => {
    h.staff = { ...h.staff!, role: "manager" };
    expect((await GET()).status).toBe(200);
    h.staff = null;
    expect((await GET()).status).toBe(401);
  });
});
