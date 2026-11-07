import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// Points for a table's bill, added by themselves when the tab is paid. Real routes against the in-memory database; the
// database's points function is replaced by a stand-in that keeps its two promises (floor of BHD x rate, one earn per receipt).
// Invented guests only.

const h = vi.hoisted(() => ({
  state: undefined as unknown as FakeState,
  staff: null as Staff | null,
  sales: [] as { venue: string; code: string; bill: number; receipt: string }[],
  fail: null as string | null,
  pushed: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});
vi.mock("../src/lib/staffAuth", () => ({ currentStaff: async () => h.staff }));
vi.mock("../src/lib/googleWallet", () => ({ googleWalletConfigured: () => false, updatePoints: async () => {} }));
vi.mock("../src/lib/apns", () => ({ notifyAppleDevices: async (cardId: string) => { h.pushed.push(cardId); } }));
vi.mock("../src/lib/ledgerDb", () => ({
  posSale: async (venue: string, code: string, bill: number, receipt: string) => {
    if (h.fail) throw new Error(h.fail);
    const card = h.state.tables.cards.find((c) => c.venue_id === venue && c.code === code);
    if (!card) throw new Error("card not found");
    if (h.sales.some((s) => s.receipt === receipt && s.venue === venue)) return { ledger_id: 1, points_added: 0, new_balance: card.points, duplicate: true };
    const rate = Number(h.state.tables.venues.find((v) => v.id === venue)!.points_per_bhd);
    const pts = Math.floor(bill * rate);
    if (pts < 1) throw new Error("bill is too small to earn points");
    h.sales.push({ venue, code, bill, receipt });
    card.points = Number(card.points) + pts;
    return { ledger_id: h.sales.length, points_added: pts, new_balance: card.points, duplicate: false };
  },
  posRefund: async () => ({}),
}));

import { newState } from "./helpers/fakeDb";
import { GET as tableGET } from "../src/app/api/table/[code]/route";
import { GET as boardGET } from "../src/app/api/staff/board/route";
import { POST as closePOST } from "../src/app/api/staff/board/close/route";
import { POST as payPOST } from "../src/app/api/table/[code]/pay/route";
import { POST as checkPOST } from "../src/app/api/table/[code]/pay/check/route";
import { DELETE as forgetDELETE, POST as rememberPOST } from "../src/app/api/card/[cardId]/remember/route";
import { awardTabPoints, guestCardFrom, pointsFor } from "../src/lib/table/points";

const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
const VA = id(1), VB = id(2);
const TA = id(11), TB = id(12);
const TABA = id(41);
const OA = id(51);
const MA = id(61), MA2 = id(62), MB = id(63), MGONE = id(64);
const CARD_A = id(71), CARD_A2 = id(72), CARD_B = id(73), CARD_GONE = id(74);
const TOKEN_A = "token-of-venue-a-0001", TOKEN_B = "token-of-venue-b-0001";

const staffOf = (venueId: string): Staff => ({ id: id(99), name: "S", role: "staff", venueId, venueSlug: "a", venueName: "A" });
let ip = 0;
const req = (method: string, body?: unknown, card?: string) =>
  new Request("http://test.local/x", {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": `10.1.0.${++ip % 250}`, ...(card ? { cookie: `theme=dark; orbyn_card=${card}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const tok = (token: string) => ({ params: Promise.resolve({ code: token }) }) as never;
const cardParam = (cardId: string) => ({ params: Promise.resolve({ cardId }) }) as never;
const tab = () => h.state.tables.tabs.find((t) => t.id === TABA)!;
const view = async (card?: string, token = TOKEN_A) => (await (await tableGET(req("GET", undefined, card), tok(token))).json()).tab;

beforeEach(() => {
  h.staff = staffOf(VA);
  h.sales = [];
  h.fail = null;
  h.pushed = [];
  vi.stubEnv("TAP_SECRET_KEY", "");
  h.state = newState({
    venues: [{ id: VA, slug: "a", name: "Venue A", active: true, points_per_bhd: 2 }, { id: VB, slug: "b", name: "Venue B", active: true, points_per_bhd: 5 }],
    members: [
      { id: MA, name: "Layla Ahmed", deleted_at: null },
      { id: MA2, name: "Omar", deleted_at: null },
      { id: MB, name: "Bea", deleted_at: null },
      { id: MGONE, name: "Gone", deleted_at: "2026-11-01T00:00:00Z" },
    ],
    cards: [
      { id: CARD_A, venue_id: VA, member_id: MA, code: "1111", points: 10 },
      { id: CARD_A2, venue_id: VA, member_id: MA2, code: "2222", points: 0 },
      { id: CARD_B, venue_id: VB, member_id: MB, code: "1111", points: 0 },
      { id: CARD_GONE, venue_id: VA, member_id: MGONE, code: "3333", points: 0 },
    ],
    venue_tables: [{ id: TA, venue_id: VA, label: "1", token: TOKEN_A, active: true }, { id: TB, venue_id: VB, label: "1", token: TOKEN_B, active: true }],
    menu_categories: [],
    menu_items: [],
    tabs: [{ id: TABA, venue_id: VA, table_id: TA, status: "open", opened_at: "2026-11-07T10:00:00Z", card_id: null, points_added: null }],
    orders: [{ id: OA, venue_id: VA, tab_id: TABA, table_id: TA, status: "served", source: "guest", created_at: "2026-11-07T10:00:00Z" }],
    order_items: [{ id: id(81), venue_id: VA, order_id: OA, name_en: "Shisha", name_ar: null, price_fils: 6250, qty: 2, note: null }],
    table_requests: [],
    payments: [],
    audit_log: [],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("rules", () => {
  it("reads the phone's card from the cookie and ignores anything else", () => {
    expect(guestCardFrom(`a=1; orbyn_card=${CARD_A}; b=2`)).toBe(CARD_A);
    expect(guestCardFrom("orbyn_card=not-a-card")).toBeNull();
    expect(guestCardFrom("orbyn_card=")).toBeNull();
    expect(guestCardFrom(null)).toBeNull();
  });
  it("counts whole points the way the database does", () => {
    expect(pointsFor(12500, 2)).toBe(25);
    expect(pointsFor(999, 1)).toBe(0);
    expect(pointsFor(0, 2)).toBe(0);
  });
});

describe("linking a guest's card to the table's tab", () => {
  it("links the phone's card and shows the points the bill will earn", async () => {
    expect(await view(CARD_A)).toMatchObject({ points: { card: "mine", estimate: 25 } });
    expect(tab().card_id).toBe(CARD_A);
  });
  it("the first card keeps the tab: a second phone sees it is someone else's, without a name", async () => {
    await view(CARD_A);
    const other = await view(CARD_A2);
    expect(other.points).toEqual({ card: "other", estimate: 0 });
    expect(JSON.stringify(other)).not.toContain("Layla");
    expect(tab().card_id).toBe(CARD_A);
  });
  it("never links a card of another venue, or of a guest who deleted their data", async () => {
    expect((await view(CARD_B)).points.card).toBe("none");
    expect((await view(CARD_GONE)).points.card).toBe("none");
    expect(tab().card_id).toBeNull();
  });
  it("a phone without a card links nothing", async () => {
    expect((await view()).points.card).toBe("none");
    expect(tab().card_id).toBeNull();
  });
});

describe("points when the tab is paid", () => {
  it("staff closing the tab in cash adds the bill's points to the linked card, once, and refreshes the Wallet card", async () => {
    await view(CARD_A);
    expect((await closePOST(req("POST", { tabId: TABA }))).status).toBe(200);
    expect(h.sales).toEqual([{ venue: VA, code: "1111", bill: 12.5, receipt: `tab:${TABA}` }]);
    expect(tab().points_added).toBe(25);
    expect(h.state.tables.cards.find((c) => c.id === CARD_A)!.points).toBe(35);
    expect(h.pushed).toEqual([CARD_A]);
    expect(await awardTabPoints(VA, TABA)).toBeNull();
    expect(h.sales).toHaveLength(1);
  });
  it("works on a tab opened by an order, where the points column starts empty", async () => {
    delete tab().points_added;
    await view(CARD_A);
    expect((await closePOST(req("POST", { tabId: TABA }))).status).toBe(200);
    expect(tab().points_added).toBe(25);
  });
  it("adds nothing when no guest card is on the tab", async () => {
    expect((await closePOST(req("POST", { tabId: TABA }))).status).toBe(200);
    expect(h.sales).toHaveLength(0);
    expect(tab().points_added).toBeNull();
  });
  it("a bill too small for a point is fine; any other problem is logged and the tab still closes", async () => {
    await view(CARD_A);
    h.fail = "bill is too small to earn points";
    expect((await closePOST(req("POST", { tabId: TABA }))).status).toBe(200);
    expect(tab()).toMatchObject({ status: "paid", points_added: 0 });
    expect(h.state.tables.audit_log).toHaveLength(0);
  });
  it("logs a failure for the owner without stopping the close", async () => {
    await view(CARD_A);
    h.fail = "database is down";
    expect((await closePOST(req("POST", { tabId: TABA }))).status).toBe(200);
    expect(tab().status).toBe("paid");
    expect(h.state.tables.audit_log.map((a) => a.action)).toEqual(["tab_points_failed"]);
  });
  it("a card payment through Tap closes the tab and adds the points by themselves", async () => {
    vi.stubEnv("TAP_SECRET_KEY", "sk_test_INVENTEDinventedKEY123");
    vi.stubEnv("PUBLIC_BASE_URL", "https://orbyn.example.test");
    vi.stubEnv("TAP_VENUE", "a");
    const charges = new Map<string, Record<string, unknown>>();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (init.method === "POST") {
        const body = JSON.parse(String(init.body));
        const c = { id: "chg_TS00000001", status: "INITIATED", amount: body.amount, currency: "BHD", reference: body.reference, transaction: { url: "https://checkout.tap.company/x" } };
        charges.set(c.id, c);
        return new Response(JSON.stringify(c));
      }
      return new Response(JSON.stringify(charges.get(String(url).split("/").pop()!)));
    }));
    await view(CARD_A);
    expect((await payPOST(req("POST", { method: "card" }, CARD_A), tok(TOKEN_A))).status).toBe(200);
    const p = h.state.tables.payments[0];
    p.id = id(91);
    Object.assign(charges.get("chg_TS00000001")!, { status: "CAPTURED", reference: { transaction: id(91) } });
    const r = await checkPOST(req("POST", { paymentId: id(91) }, CARD_A), tok(TOKEN_A));
    expect((await r.json()).status).toBe("captured");
    expect(tab()).toMatchObject({ status: "paid", paid_method: "tap", points_added: 25 });
    expect(h.sales).toHaveLength(1);
  });
  it("shows staff whose card the points go to, by first name only", async () => {
    await view(CARD_A);
    const board = await (await boardGET()).json();
    expect(board.tabs[0].pointsTo).toBe("Layla");
  });
});

describe("the phone remembering a card", () => {
  it("is set only for a real card, private to the server, for a year, and can be undone", async () => {
    const r = await rememberPOST(req("POST"), cardParam(CARD_A));
    expect(r.status).toBe(204);
    const c = r.headers.get("set-cookie")!;
    expect(c).toContain(`orbyn_card=${CARD_A}`);
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Lax/);
    expect(c).toMatch(/Max-Age=31536000/);
    expect((await rememberPOST(req("POST"), cardParam(id(5)))).status).toBe(404);
    expect((await rememberPOST(req("POST"), cardParam("nope"))).status).toBe(404);
    expect((await rememberPOST(req("POST"), cardParam(CARD_GONE))).status).toBe(404);
    expect((await forgetDELETE()).headers.get("set-cookie")).toMatch(/orbyn_card=; .*Max-Age=0/);
  });
});
