import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// A guest uses their points for the venue's reward from the table page: spent at once, and the board says what to bring.
// Real routes against the in-memory database; the database's redeem function is replaced by a stand-in. Invented guests only.

const h = vi.hoisted(() => ({
  state: undefined as unknown as FakeState,
  staff: null as Staff | null,
  redeemed: [] as string[],
  failSpend: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});
vi.mock("../src/lib/staffAuth", () => ({ currentStaff: async () => h.staff }));
vi.mock("../src/lib/googleWallet", () => ({ googleWalletConfigured: () => false, updatePoints: async () => {} }));
vi.mock("../src/lib/apns", () => ({ notifyAppleDevices: async () => {} }));
vi.mock("../src/lib/ledgerDb", () => ({
  posSale: async () => ({}),
  posRefund: async () => ({}),
  redeemReward: async () => ({}),
  redeemByGuest: async (cardId: string) => {
    if (h.failSpend) throw new Error("not enough points to redeem");
    const card = h.state.tables.cards.find((c) => c.id === cardId)!;
    const goal = Number(h.state.tables.venues.find((v) => v.id === card.venue_id)!.reward_goal);
    card.points = Number(card.points) - goal;
    h.redeemed.push(cardId);
    return { ledger_id: h.redeemed.length, new_balance: card.points };
  },
}));

import { newState } from "./helpers/fakeDb";
import { GET as tableGET } from "../src/app/api/table/[code]/route";
import { POST as redeemPOST } from "../src/app/api/table/[code]/redeem/route";
import { POST as requestPOST } from "../src/app/api/table/[code]/request/route";
import { GET as boardGET } from "../src/app/api/staff/board/route";
import { POST as donePOST } from "../src/app/api/staff/board/request/route";

const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
const VA = id(1), VB = id(2);
const TA = id(11), TA2 = id(12);
const RICH = id(71), POOR = id(72), RICH2 = id(73), OTHER_VENUE = id(74);
const TOKEN = "token-of-venue-a-0001", TOKEN2 = "token-of-venue-a-0002";

const staffOf = (venueId: string): Staff => ({ id: id(99), name: "S", role: "staff", venueId, venueSlug: "a", venueName: "A" });
let ip = 0;
const req = (method: string, body?: unknown, card?: string) =>
  new Request("http://test.local/x", {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": `10.2.0.${++ip % 250}`, ...(card ? { cookie: `orbyn_card=${card}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const tok = (token: string) => ({ params: Promise.resolve({ code: token }) }) as never;
const ask = (card?: string, token = TOKEN) => redeemPOST(req("POST", undefined, card), tok(token));
const board = async () => (await boardGET()).json();
const points = (card: string) => Number(h.state.tables.cards.find((c) => c.id === card)!.points);

beforeEach(() => {
  h.staff = staffOf(VA);
  h.redeemed = [];
  h.failSpend = false;
  vi.stubEnv("TAP_SECRET_KEY", "");
  h.state = newState({
    venues: [
      { id: VA, slug: "a", name: "Venue A", active: true, points_per_bhd: 2, reward_goal: 500, reward_text: "A dessert on the house" },
      { id: VB, slug: "b", name: "Venue B", active: true, points_per_bhd: 2, reward_goal: 100, reward_text: "Tea" },
    ],
    members: [{ id: id(61), name: "Layla Ahmed", deleted_at: null }, { id: id(62), name: "Omar", deleted_at: null }, { id: id(63), name: "Noor", deleted_at: null }, { id: id(64), name: "Bea", deleted_at: null }],
    cards: [
      { id: RICH, venue_id: VA, member_id: id(61), code: "1111", points: 620 },
      { id: POOR, venue_id: VA, member_id: id(62), code: "2222", points: 120 },
      { id: RICH2, venue_id: VA, member_id: id(63), code: "3333", points: 900 },
      { id: OTHER_VENUE, venue_id: VB, member_id: id(64), code: "4444", points: 900 },
    ],
    venue_tables: [{ id: TA, venue_id: VA, label: "1", token: TOKEN, active: true }, { id: TA2, venue_id: VA, label: "2", token: TOKEN2, active: true }],
    menu_categories: [],
    menu_items: [],
    // The stand-in gives a new row no column defaults, so the open tab is seeded as the real table would make it.
    tabs: [{ id: id(21), venue_id: VA, table_id: TA, status: "open", opened_at: "2026-11-01T18:00:00Z", card_id: null, points_added: null }],
    orders: [],
    order_items: [],
    table_requests: [],
    payments: [],
    audit_log: [],
  });
});

describe("what the guest sees", () => {
  it("shows the card's points against the venue's reward", async () => {
    const rich = (await (await tableGET(req("GET", undefined, RICH), tok(TOKEN))).json()).tab;
    expect(rich.reward).toEqual({ points: 620, goal: 500, text: "A dessert on the house", ready: true });
    const poor = (await (await tableGET(req("GET", undefined, POOR), tok(TOKEN))).json()).tab;
    expect(poor.reward).toMatchObject({ points: 120, ready: false });
  });

  it("shows nothing for a phone with no card, or another venue's card", async () => {
    expect((await (await tableGET(req("GET"), tok(TOKEN))).json()).tab.reward).toBeNull();
    expect((await (await tableGET(req("GET", undefined, OTHER_VENUE), tok(TOKEN))).json()).tab.reward).toBeNull();
  });
});

describe("using the reward", () => {
  it("takes the points at once and tells the board what to bring", async () => {
    const res = await ask(RICH);
    expect(res.status).toBe(200);
    expect((await res.json()).tab.calls).toContain("reward");
    expect(points(RICH)).toBe(120);
    expect(h.redeemed).toEqual([RICH]);
    const b = await board();
    expect(b.calls).toHaveLength(1);
    expect(b.calls[0]).toMatchObject({ table: "1", kind: "reward", reward: "A dessert on the house", guest: "Layla" });
  });

  it("spends once while a reward is still to be served, and again after staff served it", async () => {
    await ask(RICH2);
    await ask(RICH2);
    expect(points(RICH2)).toBe(400);
    expect((await board()).calls).toHaveLength(1);
    const call = (await board()).calls[0];
    expect((await donePOST(req("POST", { requestId: call.id }))).status).toBe(200);
    expect((await board()).calls).toEqual([]);
    // 400 points left: below the goal of 500, so a new try is refused and nothing more is taken.
    expect((await ask(RICH2)).status).toBe(409);
    expect(points(RICH2)).toBe(400);
  });

  it("refuses without a card, without enough points, and for another venue's card", async () => {
    for (const [card, why] of [[undefined, "no_card"], [POOR, "not_enough"], [OTHER_VENUE, "no_card"]] as const) {
      const res = await ask(card);
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe(why);
    }
    expect((await board()).calls).toEqual([]);
    expect(h.redeemed).toEqual([]);
  });

  it("refuses when the table's bill is already on another guest's card", async () => {
    await ask(RICH);
    const res = await ask(RICH2);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("other_card");
    expect(points(RICH2)).toBe(900);
  });

  it("leaves no call on the board when the database refuses the spend", async () => {
    h.failSpend = true;
    const res = await ask(RICH);
    expect(res.status).toBe(409);
    expect(points(RICH)).toBe(620);
    expect((await board()).calls).toEqual([]);
  });

  it("cannot be sent through the general call route", async () => {
    const res = await requestPOST(req("POST", { kind: "reward" }, RICH), tok(TOKEN));
    expect(res.status).toBe(400);
  });
});
