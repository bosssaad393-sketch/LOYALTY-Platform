import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";

// One card per guest per venue: joining again with the same mobile or email does not make a second card, and never hands
// out the first one either (typing someone's number must not open their card). Invented guests only.

const h = vi.hoisted(() => ({ state: undefined as unknown as FakeState }));

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return {
    db: () => makeDb(h.state),
    getVenue: async (slug: string) => h.state.tables.venues.find((v) => v.slug === slug && v.active) ?? null,
  };
});

import { newState } from "./helpers/fakeDb";
import { POST as join } from "../src/app/api/join/route";

const VA = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", VB = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";
const req = (body: Record<string, unknown>) =>
  new Request("http://test.local/api/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ terms: true, ...body }) });
const cards = (venue = VA) => h.state.tables.cards.filter((c) => c.venue_id === venue);

beforeEach(() => {
  h.state = newState({
    venues: [{ id: VA, slug: "a", name: "Venue A", active: true }, { id: VB, slug: "b", name: "Venue B", active: true }],
    members: [],
    cards: [],
  });
});

describe("joining twice", () => {
  it("a first join makes a card", async () => {
    const r = await join(req({ venue: "a", name: "Test Guest 0001", mobile: "+973 0000 0001" }));
    expect(r.status).toBe(200);
    expect(cards()).toHaveLength(1);
  });
  it("the same mobile, written differently, gets no second card and no card id back", async () => {
    await join(req({ venue: "a", name: "Test Guest 0001", mobile: "+973 0000 0001" }));
    const r = await join(req({ venue: "a", name: "Someone Else", mobile: "+973-0000-0001" }));
    expect(r.status).toBe(409);
    const body = await r.json();
    expect(body.code).toBe("already_member");
    expect(JSON.stringify(body)).not.toMatch(/cardId|[0-9a-f]{8}-[0-9a-f]{4}/);
    expect(cards()).toHaveLength(1);
  });
  it("the same email in other capitals gets no second card", async () => {
    await join(req({ venue: "a", name: "Test Guest 0002", email: "test.guest0002@example.com" }));
    expect((await join(req({ venue: "a", name: "Test Guest 0002", email: "Test.Guest0002@Example.com" }))).status).toBe(409);
    expect(cards()).toHaveLength(1);
  });
  it("the answer is the same whether the mobile or the email matched", async () => {
    await join(req({ venue: "a", name: "Test Guest 0003", mobile: "+97300000003", email: "test.guest0003@example.com" }));
    const byMobile = await (await join(req({ venue: "a", name: "X", mobile: "+97300000003", email: "new@example.com" }))).json();
    const byEmail = await (await join(req({ venue: "a", name: "X", mobile: "+97300000099", email: "test.guest0003@example.com" }))).json();
    expect(byMobile).toEqual(byEmail);
  });
  it("the same guest may still join a different venue", async () => {
    await join(req({ venue: "a", name: "Test Guest 0004", mobile: "+97300000004" }));
    expect((await join(req({ venue: "b", name: "Test Guest 0004", mobile: "+97300000004" }))).status).toBe(200);
    expect(cards(VB)).toHaveLength(1);
  });
  it("a guest who deleted their data can join again", async () => {
    await join(req({ venue: "a", name: "Test Guest 0005", email: "test.guest0005@example.com" }));
    h.state.tables.members[0].deleted_at = "2026-11-07T00:00:00Z";
    expect((await join(req({ venue: "a", name: "Test Guest 0005", email: "test.guest0005@example.com" }))).status).toBe(200);
  });
});
