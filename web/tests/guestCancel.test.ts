import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// A guest takes back a round from their own phone, only before staff accept it. Real routes against the in-memory database.
// Invented data only.

const h = vi.hoisted(() => ({ state: undefined as unknown as FakeState, staff: null as Staff | null }));

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});
vi.mock("../src/lib/staffAuth", () => ({ currentStaff: async () => h.staff }));
vi.mock("../src/lib/googleWallet", () => ({ googleWalletConfigured: () => false, updatePoints: async () => {} }));
vi.mock("../src/lib/apns", () => ({ notifyAppleDevices: async () => {} }));

import { newState } from "./helpers/fakeDb";
import { GET as tableGET } from "../src/app/api/table/[code]/route";
import { POST as orderPOST } from "../src/app/api/table/[code]/order/route";
import { POST as cancelPOST } from "../src/app/api/table/[code]/cancel/route";
import { GET as boardGET } from "../src/app/api/staff/board/route";
import { POST as actPOST } from "../src/app/api/staff/board/order/route";
import { rememberSentOrder, sentOrdersFrom } from "../src/lib/table/sentOrders";

const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
const VA = id(1), VB = id(2);
const TA = id(11), TA2 = id(13), TB = id(12);
const CA = id(21), IA = id(31), IB = id(32);
const TOKEN_A = "token-of-venue-a-0001", TOKEN_A2 = "token-of-venue-a-0002", TOKEN_B = "token-of-venue-b-0001";

let ip = 0;
const req = (method: string, body?: unknown, cookie?: string) =>
  new Request("http://test.local/x", {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": `10.2.0.${++ip % 250}`, ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const tok = (token: string) => ({ params: Promise.resolve({ code: token }) }) as never;
const cookieFrom = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];
const order = (o: string) => h.state.tables.orders.find((r) => r.id === o)!;

/** One phone sends a round; returns the order id and the cookie the phone now holds. */
async function send(token = TOKEN_A, cookie?: string) {
  const res = await orderPOST(req("POST", { items: [{ id: IA, qty: 2 }] }, cookie), tok(token));
  expect(res.status).toBe(200);
  const body = await res.json();
  return { orderId: body.orderId as string, cookie: cookieFrom(res), tab: body.tab };
}
const cancel = (orderId: string, cookie?: string, token = TOKEN_A) => cancelPOST(req("POST", { orderId }, cookie), tok(token));

beforeEach(() => {
  vi.stubEnv("STAFF_SESSION_SECRET", "test-only-secret");
  vi.stubEnv("TAP_SECRET_KEY", "");
  h.staff = { id: id(99), name: "S", role: "staff", venueId: VA, venueSlug: "a", venueName: "A" };
  h.state = newState({
    venues: [{ id: VA, slug: "a", name: "Venue A", active: true, points_per_bhd: 2 }, { id: VB, slug: "b", name: "Venue B", active: true, points_per_bhd: 2 }],
    venue_tables: [
      { id: TA, venue_id: VA, label: "1", token: TOKEN_A, active: true },
      { id: TA2, venue_id: VA, label: "2", token: TOKEN_A2, active: true },
      { id: TB, venue_id: VB, label: "1", token: TOKEN_B, active: true },
    ],
    menu_categories: [{ id: CA, venue_id: VA, name_en: "Tea", name_ar: null, sort: 0, active: true }],
    menu_items: [
      { id: IA, venue_id: VA, category_id: CA, name_en: "Karak", name_ar: null, note_en: null, note_ar: null, image_url: null, price_fils: 800, available: true, active: true, sort: 0 },
      { id: IB, venue_id: VB, category_id: CA, name_en: "B tea", name_ar: null, note_en: null, note_ar: null, image_url: null, price_fils: 800, available: true, active: true, sort: 0 },
    ],
    // The real database opens a tab with status "open" by default; the stand-in needs it already there.
    tabs: [{ id: id(41), venue_id: VA, table_id: TA, status: "open", opened_at: "2026-11-07T18:00:00Z", card_id: null, points_added: null }],
    orders: [],
    order_items: [],
    table_requests: [],
    payments: [],
    audit_log: [],
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("the phone's list of rounds it sent", () => {
  it("keeps signed ids and ignores anything tampered with", () => {
    const one = rememberSentOrder(null, id(501))!.split(";")[0];
    expect(sentOrdersFrom(one)).toEqual(new Set([id(501)]));
    const forged = `orbyn_sent=${encodeURIComponent(`${id(502)}.AAAAAAAAAAAAAAAAAAAAAA`)}`;
    expect(sentOrdersFrom(forged).size).toBe(0);
    expect(sentOrdersFrom("orbyn_sent=junk")).toEqual(new Set());
    expect(sentOrdersFrom(null)).toEqual(new Set());
  });
  it("adds to the list and keeps at most 12", () => {
    let cookie = "";
    for (let n = 1; n <= 14; n++) cookie = rememberSentOrder(cookie, id(600 + n))!.split(";")[0];
    const ids = sentOrdersFrom(cookie);
    expect(ids.size).toBe(12);
    expect(ids.has(id(614))).toBe(true);
    expect(ids.has(id(601))).toBe(false);
  });
  it("the cookie is for this site only and not readable by page scripts", () => {
    expect(rememberSentOrder(null, id(501))).toMatch(/HttpOnly; SameSite=Lax/);
  });
});

describe("a guest cancels a round", () => {
  it("the phone that sent a new round sees the button and can cancel it", async () => {
    const { orderId, cookie, tab } = await send();
    expect(tab.rounds[0]).toMatchObject({ id: orderId, status: "new", canCancel: true });
    const res = await cancel(orderId, cookie);
    expect(res.status).toBe(200);
    expect((await res.json()).tab.rounds[0]).toMatchObject({ status: "cancelled", canCancel: false });
    expect(order(orderId).status).toBe("cancelled");
    expect(h.state.tables.audit_log.some((a) => a.action === "order_cancelled_by_guest")).toBe(true);
  });
  it("another phone at the same table sees no button and cannot cancel it", async () => {
    const { orderId } = await send();
    const other = await (await tableGET(req("GET"), tok(TOKEN_A))).json();
    expect(other.tab.rounds[0].canCancel).toBe(false);
    expect((await cancel(orderId)).status).toBe(403);
    expect((await cancel(orderId, `orbyn_sent=${encodeURIComponent(`${orderId}.forgedsignature000000`)}`)).status).toBe(403);
    expect(order(orderId).status).toBe("new");
  });
  it("once staff accept it, the guest can no longer cancel and is told to ask a waiter", async () => {
    const { orderId, cookie } = await send();
    expect((await actPOST(req("POST", { orderId, action: "accept", minutes: 10 }))).status).toBe(200);
    const view = await (await tableGET(req("GET", undefined, cookie), tok(TOKEN_A))).json();
    expect(view.tab.rounds[0].canCancel).toBe(false);
    const res = await cancel(orderId, cookie);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("started");
    expect(order(orderId).status).toBe("accepted");
  });
  it("a round cannot be cancelled through another table's code, or another venue's", async () => {
    const { orderId, cookie } = await send();
    expect((await cancel(orderId, cookie, TOKEN_A2)).status).toBe(404);
    expect((await cancel(orderId, cookie, TOKEN_B)).status).toBe(404);
    expect(order(orderId).status).toBe("new");
  });
  it("a cancelled round does not count in the bill, and the next round can still be cancelled", async () => {
    const first = await send();
    await cancel(first.orderId, first.cookie);
    const second = await send(TOKEN_A, first.cookie);
    expect(second.tab.totalFils).toBe(1600);
    expect(second.tab.rounds.map((r: { canCancel: boolean }) => r.canCancel)).toEqual([false, true]);
    expect((await cancel(second.orderId, second.cookie)).status).toBe(200);
  });
  it("staff see the guest's cancellation on the board, and the round leaves the new list", async () => {
    const { orderId, cookie } = await send();
    await cancel(orderId, cookie);
    const board = await (await boardGET()).json();
    expect(board.orders.find((o: { id: string }) => o.id === orderId)).toBeUndefined();
    expect(board.guestCancelled).toEqual([expect.objectContaining({ id: orderId, table: "1", lines: [{ name: "Karak", qty: 2 }] })]);
  });
  it("refuses a request that is not a round id", async () => {
    expect((await cancelPOST(req("POST", { orderId: "x" }), tok(TOKEN_A))).status).toBe(400);
  });
});

describe("without a site secret", () => {
  it("ordering still works; the guest just gets no cancel button", async () => {
    vi.stubEnv("STAFF_SESSION_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    delete process.env.STAFF_SESSION_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await orderPOST(req("POST", { items: [{ id: IA, qty: 1 }] }), tok(TOKEN_A));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect((await res.json()).tab.rounds[0].canCancel).toBe(false);
  });
});
