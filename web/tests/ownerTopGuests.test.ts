import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// "Top guests" on the owner overview: ranked by the database across every guest of the venue, never another venue's.

const h = vi.hoisted(() => ({ state: undefined as unknown as FakeState, staff: null as Staff | null }));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/staffAuth", () => ({ currentStaff: async () => h.staff }));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});

import { newState } from "./helpers/fakeDb";
import { GET } from "../src/app/api/owner/guests/route";

const VA = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", VB = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";
const get = async (q: string) => (await (await GET(new Request(`http://t/api/owner/guests?${q}`))).json()).guests as { name: string; visits: number; points: number }[];

beforeEach(() => {
  h.staff = { id: "s", name: "Owner", role: "owner", venueId: VA, venueSlug: "a", venueName: "A" };
  const card = (n: number, venue: string, visits: number, points: number, last: string) =>
    ({ id: `c${n}`, venue_id: venue, member_id: `m${n}`, code: String(1000 + n), visits, points, last_visit: last, created_at: "2026-10-01T00:00:00Z" });
  h.state = newState({
    members: [1, 2, 3, 4, 5].map((n) => ({ id: `m${n}`, name: `Guest ${n}`, deleted_at: null })),
    cards: [
      card(1, VA, 2, 10, "2026-11-07T10:00:00Z"),
      card(2, VA, 9, 40, "2026-10-02T10:00:00Z"), // most loyal, but has not been in for a month
      card(3, VA, 9, 90, "2026-10-03T10:00:00Z"), // same visits, more points: ranks first
      card(4, VA, 0, 0, "2026-11-07T11:00:00Z"),
      card(5, VB, 50, 500, "2026-11-07T12:00:00Z"), // another venue: never shown
    ],
  });
});

describe("top guests", () => {
  it("ranks by visits, then points, across all guests of the venue", async () => {
    expect((await get("top=3")).map((g) => g.name)).toEqual(["Guest 3", "Guest 2", "Guest 1"]);
  });
  it("leaves out guests with no visit and guests of other venues", async () => {
    const names = (await get("top=10")).map((g) => g.name);
    expect(names).not.toContain("Guest 4");
    expect(names).not.toContain("Guest 5");
  });
  it("without top, the normal list still works", async () => {
    expect((await get("q=")).length).toBe(4);
  });
});
