import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// The guest record (migration 0034): one guest's facts, labels, notes and history, never another venue's.

const h = vi.hoisted(() => ({ state: undefined as unknown as FakeState, staff: null as Staff | null }));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/staffAuth", () => ({ currentStaff: async () => h.staff }));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});

import { newState } from "./helpers/fakeDb";
import { GET, POST } from "../src/app/api/owner/guests/record/route";
import { GET as LIST } from "../src/app/api/owner/guests/route";
import { bahrainWeekday, cleanTags, daysBetweenVisits, guestStage, mostOften, newestFirst } from "../src/lib/guestCrm";

const VA = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", VB = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";
const C1 = "cccccccc-cccc-4ccc-8ccc-000000000001", C2 = "cccccccc-cccc-4ccc-8ccc-000000000002";
const get = async (id: string) => GET(new Request(`http://t/api/owner/guests/record?cardId=${id}`));
const post = async (body: unknown) => POST(new Request("http://t/api/owner/guests/record", { method: "POST", body: JSON.stringify(body) }));
const now = Date.parse("2026-11-27T12:00:00Z");
const days = (d: number) => new Date(now - d * 86_400_000).toISOString();

beforeEach(() => {
  h.staff = { id: "s1", name: "Owner", role: "owner", venueId: VA, venueSlug: "a", venueName: "A" };
  h.state = newState({
    members: [
      { id: "m1", name: "Maryam", deleted_at: null, consent_news: true, birth_day: 4, birth_month: 3, phone: "+97330000000" },
      { id: "m2", name: "Other venue guest", deleted_at: null, consent_news: false },
    ],
    cards: [
      { id: C1, venue_id: VA, member_id: "m1", code: "1001", visits: 2, points: 0, last_visit: "2026-11-20T10:00:00Z", created_at: "2026-11-01T09:00:00Z", wallet_platform: "apple", tags: ["family"] },
      { id: C2, venue_id: VB, member_id: "m2", code: "1002", visits: 1, points: 0, last_visit: "2026-11-20T10:00:00Z", created_at: "2026-11-01T09:00:00Z" },
    ],
    staff_users: [{ id: "s1", name: "Owner", venue_id: VA }],
    ledger: [
      { id: 1, card_id: C1, venue_id: VA, kind: "earn", points: 0, staff_id: "s1", created_at: "2026-11-10T10:00:00Z" },
      { id: 2, card_id: C1, venue_id: VA, kind: "earn", points: 0, staff_id: "s1", created_at: "2026-11-20T10:00:00Z" },
    ],
  });
});

describe("guest record", () => {
  it("shows the facts and the history, newest first, without contact details", async () => {
    const res = await get(C1);
    const text = await res.text();
    expect(text).not.toContain("+973");
    const { record } = JSON.parse(text);
    expect(record).toMatchObject({ name: "Maryam", code: "1001", visits: 2, tags: ["family"], offers: true, wallet: "apple", birthday: { day: 4, month: 3 }, everyDays: 10, usualWeekday: null, usualPlace: null, favourite: null });
    expect(record.events.map((e: { kind: string }) => e.kind)).toEqual(["visit", "visit", "joined"]);
  });

  it("never opens another venue's guest", async () => {
    expect((await get(C2)).status).toBe(404);
    expect((await post({ do: "note", cardId: C2, body: "x" })).status).toBe(404);
    expect((await post({ do: "tags", cardId: C2, tags: ["x"] })).status).toBe(404);
  });

  it("saves a note signed by who wrote it, and removes it", async () => {
    const { record } = await (await post({ do: "note", cardId: C1, body: "  Allergic to nuts  " })).json();
    const note = record.events.find((e: { kind: string }) => e.kind === "note");
    expect(note).toMatchObject({ text: "Allergic to nuts", by: "Owner" });
    const after = await (await post({ do: "remove_note", cardId: C1, noteId: note.id })).json().catch(() => null);
    expect(after).toBeTruthy();
  });

  it("refuses an empty or over-long note", async () => {
    expect((await post({ do: "note", cardId: C1, body: "   " })).status).toBe(400);
    expect((await post({ do: "note", cardId: C1, body: "x".repeat(601) })).status).toBe(400);
  });

  it("tidies labels and shows them in the list, where they can be searched", async () => {
    const { record } = await (await post({ do: "tags", cardId: C1, tags: [" VIP ", "vip", "Family", ""] })).json();
    expect(record.tags).toEqual(["vip", "family"]);
    const { guests } = await (await LIST(new Request("http://t/api/owner/guests?q=vip"))).json();
    expect(guests.map((g: { name: string }) => g.name)).toEqual(["Maryam"]);
    expect(guests[0]).toHaveProperty("stage");
  });
});

describe("guest rules", () => {
  it("places each guest in one stage", () => {
    expect(guestStage({ visits: 0, lastVisit: null, joined: days(3) }, now)).toBe("new");
    expect(guestStage({ visits: 0, lastVisit: null, joined: days(60) }, now)).toBe("waiting");
    expect(guestStage({ visits: 2, lastVisit: days(5), joined: days(60) }, now)).toBe("active");
    expect(guestStage({ visits: 7, lastVisit: days(5), joined: days(60) }, now)).toBe("regular");
    expect(guestStage({ visits: 7, lastVisit: days(45), joined: days(90) }, now)).toBe("quiet");
  });
  it("keeps eight labels at most, each 24 characters at most", () => {
    expect(cleanTags(Array.from({ length: 12 }, (_, i) => `t${i}`))).toHaveLength(8);
    expect(cleanTags(["x".repeat(40)])[0]).toHaveLength(24);
    expect(cleanTags([1, null, "ok"])).toEqual(["ok"]);
  });
  it("names a habit only when it is clear", () => {
    expect(mostOften(["Sanad", "Sanad", "Asmak"])).toBe("Sanad");
    expect(mostOften(["Sanad"])).toBeNull();
    expect(mostOften(["Sanad", "Sanad", "Asmak", "Asmak"])).toBeNull();
    // 22:30 UTC on a Thursday is already Friday in Bahrain.
    expect(bahrainWeekday("2026-11-26T22:30:00Z")).toBe(5);
  });
  it("works out the days between visits, and sorts the history", () => {
    expect(daysBetweenVisits([days(0)])).toBeNull();
    expect(daysBetweenVisits([days(20), days(10), days(0)])).toBe(10);
    expect(newestFirst([{ kind: "joined", at: days(9), place: null }, { kind: "visit", at: days(1), place: null, by: null }]).map((e) => e.kind)).toEqual(["visit", "joined"]);
  });
});
