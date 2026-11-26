import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";

// Sending a new Wallet card design to cards guests already saved (migration 0032), against an in-memory database.
// Apple is stood in for: nothing leaves this machine. Invented guests only.

const h = vi.hoisted(() => ({ state: undefined as unknown as FakeState, woken: [] as string[][], configured: true }));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});
vi.mock("../src/lib/appleWallet", () => ({ appleWalletConfigured: () => h.configured, buildPass: async () => Buffer.from("the card as it is built now") }));
vi.mock("../src/lib/apns", () => ({ notifyAppleTokens: async (tokens: string[]) => { h.woken.push(tokens); return tokens.length; } }));
vi.mock("../src/lib/passOffer", () => ({ offerStampsByVenue: async () => new Map<string, number>() }));
vi.mock("../src/lib/vouchersDb", () => ({ voucherStamps: async () => new Map<string, number>() }));
vi.mock("../src/lib/autoMessagesDb", () => ({ noticeStamps: async () => new Map<string, number>() }));
vi.mock("../src/lib/cards", () => ({
  isUuid: (s: string) => /^[0-9a-f-]{36}$/.test(s),
  getCardView: async (id: string) => ({ venue: { id: "venue-a", slug: "roshinah", name: "Al Roshinah" }, card: { id }, memberName: "Maryam Test" }),
}));

import { newState } from "./helpers/fakeDb";
import { cardDesignStatus, passDesignStamps, savedCards, sendCardDesign } from "../src/lib/cardDesign";
import { GET } from "../src/app/api/applewallet/v1/[...path]/route";

const VA = "venue-a", VB = "venue-b";
const PASS_TYPE = "pass.co.orbyn.test";
const card = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const JOINED = "2026-11-01T10:00:00.000Z";
const SENT = new Date("2026-12-05T09:30:00.000Z");
const wallet = (path: string[], init?: RequestInit, query = "") =>
  GET(new Request(`https://cards.example/api/applewallet/v1/${path.join("/")}${query}`, init), { params: Promise.resolve({ path }) } as never);

beforeEach(() => {
  process.env.APPLE_PASS_TYPE_ID = PASS_TYPE;
  delete process.env.ORBYN_DEMO;
  delete process.env.LOYALTY_FAKE_DB;
  h.woken = [];
  h.configured = true;
  h.state = newState({
    venues: [{ id: VA, pass_updated_at: null }, { id: VB, pass_updated_at: null }],
    members: [{ id: "m1", consent_news: false, deleted_at: null }],
    cards: [
      { id: card(1), venue_id: VA, member_id: "m1", created_at: JOINED, apple_auth_token: "secret-of-card-1" },
      { id: card(2), venue_id: VA, member_id: "m1", created_at: JOINED, apple_auth_token: "secret-of-card-2" },
      { id: card(3), venue_id: VA, member_id: "m1", created_at: JOINED, apple_auth_token: "secret-of-card-3" },
      { id: card(9), venue_id: VB, member_id: "m1", created_at: JOINED, apple_auth_token: "secret-of-card-9" },
    ],
    // Card 1 is on two phones; card 2 on one phone; card 3 was never added to Wallet.
    apple_registrations: [
      { device_id: "phone-1", card_id: card(1), push_token: "tok-1" },
      { device_id: "phone-1b", card_id: card(1), push_token: "tok-1b" },
      { device_id: "phone-2", card_id: card(2), push_token: "tok-2" },
      { device_id: "phone-9", card_id: card(9), push_token: "tok-9" },
    ],
    ledger: [],
    audit_log: [],
  });
});

describe("which phones hold a card", () => {
  it("counts this business's saved cards and phones, never another business's", async () => {
    const saved = await savedCards(VA);
    expect(saved.cards).toBe(2);
    expect(saved.tokens.sort()).toEqual(["tok-1", "tok-1b", "tok-2"]);
    expect(await cardDesignStatus(VA)).toEqual({ configured: true, cards: 2, phones: 3, sentAt: null });
  });

  it("finds every phone when there are more cards than one question to the database can hold", async () => {
    for (let n = 100; n < 330; n++) {
      h.state.tables.cards.push({ id: card(n), venue_id: VA, member_id: "m1", created_at: JOINED });
      h.state.tables.apple_registrations.push({ device_id: `phone-${n}`, card_id: card(n), push_token: `tok-${n}` });
    }
    const saved = await savedCards(VA);
    expect(saved.cards).toBe(232);
    expect(new Set(saved.tokens).size).toBe(233);
  });
});

describe("sending the design", () => {
  it("marks the business's cards as newer, wakes each of its phones once and writes it down", async () => {
    const r = await sendCardDesign(VA, "dev-1", SENT);
    expect(r).toEqual({ configured: true, cards: 2, phones: 3, sentAt: SENT.toISOString(), accepted: 3 });
    expect(h.woken).toHaveLength(1);
    expect([...h.woken[0]].sort()).toEqual(["tok-1", "tok-1b", "tok-2"]);
    expect(await passDesignStamps([VA, VB])).toEqual(new Map([[VA, SENT.getTime()]]));
    expect(h.state.tables.audit_log).toEqual([expect.objectContaining({ venue_id: VA, actor: "dev-1", action: "card_design_sent", detail: { cards: 2, phones: 3, accepted: 3 } })]);
    expect((await cardDesignStatus(VA)).sentAt).toBe(SENT.toISOString());
  });

  it("does nothing where Apple Wallet is not set up, or on a sample", async () => {
    h.configured = false;
    expect(await sendCardDesign(VA, "dev-1", SENT)).toEqual({ configured: false, cards: 0, phones: 0, sentAt: null, accepted: 0 });
    h.configured = true;
    process.env.ORBYN_DEMO = "1";
    expect((await cardDesignStatus(VA)).configured).toBe(false);
    expect((await sendCardDesign(VA, "dev-1", SENT)).configured).toBe(false);
    expect(h.woken).toEqual([]);
    expect(h.state.tables.venues.every((v) => v.pass_updated_at === null)).toBe(true);
  });

  it("a database that has not got the column yet answers nothing, without failing", async () => {
    h.state.failing.add("venues");
    expect(await passDesignStamps([VA])).toEqual(new Map());
  });
});

describe("what a woken phone is told", () => {
  const before = String(new Date("2026-12-01T00:00:00Z").getTime());

  it("nothing has changed until a design is sent; afterwards every card of that business has", async () => {
    expect((await wallet(["devices", "phone-1", "registrations", PASS_TYPE], undefined, `?passesUpdatedSince=${before}`)).status).toBe(204);
    await sendCardDesign(VA, "dev-1", SENT);
    const res = await wallet(["devices", "phone-1", "registrations", PASS_TYPE], undefined, `?passesUpdatedSince=${before}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ serialNumbers: [card(1)], lastUpdated: String(SENT.getTime()) });
    // The phone keeps that tag: asking again with it finds nothing new, so a card is fetched once per design.
    expect((await wallet(["devices", "phone-1", "registrations", PASS_TYPE], undefined, `?passesUpdatedSince=${SENT.getTime()}`)).status).toBe(204);
    // The other business's phone is not told anything.
    expect((await wallet(["devices", "phone-9", "registrations", PASS_TYPE], undefined, `?passesUpdatedSince=${before}`)).status).toBe(204);
  });

  it("hands the phone the card as it is built now, only to the card's own key", async () => {
    await sendCardDesign(VA, "dev-1", SENT);
    const held = new Date("2026-12-01T00:00:00Z").toUTCString();
    const res = await wallet(["passes", PASS_TYPE, card(1)], { headers: { authorization: "ApplePass secret-of-card-1", "if-modified-since": held } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/vnd.apple.pkpass");
    expect(res.headers.get("last-modified")).toBe(SENT.toUTCString());
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("the card as it is built now");
    // A phone that already holds this design is told so and fetches nothing.
    expect((await wallet(["passes", PASS_TYPE, card(1)], { headers: { authorization: "ApplePass secret-of-card-1", "if-modified-since": SENT.toUTCString() } })).status).toBe(304);
    expect((await wallet(["passes", PASS_TYPE, card(1)], { headers: { authorization: "ApplePass secret-of-card-2" } })).status).toBe(401);
  });
});
