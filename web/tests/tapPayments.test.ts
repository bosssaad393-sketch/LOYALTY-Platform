import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// Tap payments: real route handlers and the real Tap client against the in-memory database, with Tap's API replaced by a
// stand-in on fetch. Nothing reaches Tap. The key below is invented and only has the shape of a test key.

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
import { POST as payPOST } from "../src/app/api/table/[code]/pay/route";
import { POST as checkPOST } from "../src/app/api/table/[code]/pay/check/route";
import { POST as requestPOST } from "../src/app/api/table/[code]/request/route";
import { POST as webhookPOST } from "../src/app/api/tap/webhook/route";
import { GET as boardGET } from "../src/app/api/staff/board/route";
import { POST as closePOST } from "../src/app/api/staff/board/close/route";
import {
  chargeBody, fromTapAmount, judgeCharge, keyMode, payState, safePayUrl, statusOf, tapHash, tapHashOk, toTapAmount, type TapCharge,
} from "../src/lib/tap/rules";
import { tapConfig } from "../src/lib/tap/client";

const KEY = "sk_test_INVENTEDinventedKEY123";
const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
const VA = id(1), VB = id(2);
const TA = id(11), TA2 = id(13), TB = id(12);
const TABA = id(41), TABB = id(42);
const OA = id(51);
const PAY = id(81);
const TOKEN_A = "token-of-venue-a-0001", TOKEN_A2 = "token-of-venue-a-0002", TOKEN_B = "token-of-venue-b-0001";

const staffOf = (venueId: string): Staff => ({ id: id(99), name: "S", role: "staff", venueId, venueSlug: "a", venueName: "A" });
let ip = 0;
const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://test.local/x", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${++ip % 250}`, ...headers }, body: JSON.stringify(body) });
const tok = (token: string) => ({ params: Promise.resolve({ code: token }) }) as never;
const rows = (table: string) => h.state.tables[table] ?? [];
const tabA = () => rows("tabs").find((t) => t.id === TABA)!;

// ---- Tap stand-in: POST /v2/charges makes a charge, GET /v2/charges/{id} reads it back -----------------------------------
type Fake = { charges: Map<string, TapCharge>; posts: { body: Record<string, unknown>; auth: string | null }[]; next: number };
let tap: Fake;
function installTap() {
  tap = { charges: new Map(), posts: [], next: 0 };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const u = String(url);
    if (!u.startsWith("https://api.tap.company/v2/charges")) throw new Error(`unexpected fetch ${u}`);
    const auth = new Headers(init.headers).get("authorization");
    if (init.method === "POST") {
      const body = JSON.parse(String(init.body));
      tap.posts.push({ body, auth });
      const charge: TapCharge = {
        id: `chg_TS${String(++tap.next).padStart(8, "0")}`,
        status: "INITIATED",
        amount: body.amount,
        currency: body.currency,
        reference: { ...body.reference, gateway: "gw1", payment: "pay1" },
        transaction: { url: `https://checkout.tap.company/?mode=page&token=x${tap.next}`, created: "1762500000000" },
      };
      tap.charges.set(charge.id, charge);
      return new Response(JSON.stringify(charge), { status: 200 });
    }
    const c = tap.charges.get(u.split("/").pop()!);
    return c ? new Response(JSON.stringify(c), { status: 200 }) : new Response(JSON.stringify({ errors: [{ description: "not found" }] }), { status: 404 });
  }));
}
const lastCharge = () => [...tap.charges.values()].at(-1)!;
const setTap = (patch: Partial<TapCharge>) => Object.assign(lastCharge(), patch);

beforeEach(() => {
  vi.stubEnv("TAP_SECRET_KEY", KEY);
  vi.stubEnv("PUBLIC_BASE_URL", "https://orbyn.example.test");
  vi.stubEnv("TAP_VENUE", "a");
  vi.stubEnv("TAP_FAKE", "");
  installTap();
  h.staff = staffOf(VA);
  h.state = newState({
    venues: [{ id: VA, slug: "a", name: "Venue A", active: true }, { id: VB, slug: "b", name: "Venue B", active: true }],
    venue_tables: [
      { id: TA, venue_id: VA, label: "1", token: TOKEN_A, active: true },
      { id: TA2, venue_id: VA, label: "2", token: TOKEN_A2, active: true },
      { id: TB, venue_id: VB, label: "1", token: TOKEN_B, active: true },
    ],
    menu_categories: [],
    menu_items: [],
    tabs: [
      { id: TABA, venue_id: VA, table_id: TA, status: "open", opened_at: "2026-11-07T10:00:00Z" },
      { id: TABB, venue_id: VB, table_id: TB, status: "open", opened_at: "2026-11-07T10:00:00Z" },
    ],
    orders: [{ id: OA, venue_id: VA, tab_id: TABA, table_id: TA, status: "served", source: "guest", created_at: "2026-11-07T10:00:00Z" }],
    order_items: [{ id: id(71), venue_id: VA, order_id: OA, name_en: "Shisha", name_ar: null, price_fils: 2600, qty: 2, note: null }],
    table_requests: [{ id: id(61), venue_id: VA, tab_id: TABA, table_id: TA, kind: "coal", created_at: "2026-11-07T10:05:00Z", handled_at: null }],
    payments: [],
    audit_log: [],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const startPay = async (method = "benefit", token = TOKEN_A) => payPOST(json({ method }), tok(token));
const check = async (paymentId: string, token = TOKEN_A) => checkPOST(json({ paymentId }), tok(token));
/** Our payment row, given a UUID so the check route (which only takes UUIDs) can reach it. */
const startedPayment = async (method = "benefit") => {
  expect((await startPay(method)).status).toBe(200);
  const p = rows("payments").at(-1)!;
  p.id = PAY;
  tap.charges.get(p.charge_id as string)!.reference!.transaction = PAY;
  return p;
};

// ---- pure rules -----------------------------------------------------------------------------------------------------

describe("Tap rules", () => {
  it("turns fils into Tap's 3-decimal BHD and back without rounding errors", () => {
    expect(toTapAmount(5200)).toBe(5.2);
    expect(toTapAmount(1)).toBe(0.001);
    expect(fromTapAmount(5.2)).toBe(5200);
    expect(fromTapAmount(0.1 + 0.2)).toBe(300);
  });
  it("reads Tap's status words, and holds anything unknown for a person", () => {
    expect(statusOf("CAPTURED")).toBe("captured");
    expect(statusOf("declined")).toBe("failed");
    expect(statusOf("ABANDONED")).toBe("failed");
    expect(statusOf("INITIATED")).toBe("initiated");
    expect(statusOf("SOMETHING_NEW")).toBe("review");
  });
  it("counts a charge as paid only with our id, reference, currency and amount", () => {
    const ours = { id: PAY, tabId: TABA, chargeId: "chg_TS00000001", amountFils: 5200, currency: "BHD" };
    const good: TapCharge = { id: "chg_TS00000001", status: "CAPTURED", amount: 5.2, currency: "BHD", reference: { transaction: PAY } };
    expect(judgeCharge(ours, good).status).toBe("captured");
    expect(judgeCharge(ours, { ...good, id: "chg_OTHER0001" }).status).toBe("review");
    expect(judgeCharge(ours, { ...good, reference: { transaction: id(5) } }).status).toBe("review");
    expect(judgeCharge(ours, { ...good, currency: "USD" }).status).toBe("review");
    expect(judgeCharge(ours, { ...good, amount: 0.52 }).status).toBe("review");
    expect(judgeCharge(ours, { ...good, status: "DECLINED" }).status).toBe("failed");
  });
  it("only ever sends a guest to Tap's own https pages", () => {
    expect(safePayUrl("https://checkout.tap.company/?x=1")).toBeTruthy();
    expect(safePayUrl("https://tap.company/pay")).toBeTruthy();
    expect(safePayUrl("http://checkout.tap.company/")).toBeNull();
    expect(safePayUrl("https://tap.company.evil.example/")).toBeNull();
    expect(safePayUrl("https://eviltap.company/")).toBeNull();
    expect(safePayUrl("javascript:alert(1)")).toBeNull();
    expect(safePayUrl(null)).toBeNull();
  });
  it("knows a test key from a live key, and refuses anything else", () => {
    expect(keyMode(KEY)).toBe("test");
    expect(keyMode("sk_live_INVENTEDinvented99")).toBe("live");
    expect(keyMode("pk_test_INVENTEDinvented99")).toBeNull();
    expect(keyMode("")).toBeNull();
    expect(keyMode(undefined)).toBeNull();
  });
  it("signs the webhook the way Tap describes, with 3 decimals for BHD", () => {
    const c: TapCharge = { id: "chg_TS00000001", status: "CAPTURED", amount: 5.2, currency: "BHD", reference: { gateway: "gw1", payment: "pay1" }, transaction: { created: "1762500000000" } };
    const want = createHmac("sha256", KEY).update("x_idchg_TS00000001x_amount5.200x_currencyBHDx_gateway_referencegw1x_payment_referencepay1x_statusCAPTUREDx_created1762500000000").digest("hex");
    expect(tapHash(c, KEY)).toBe(want);
    expect(tapHashOk(c, want, KEY)).toBe(true);
    expect(tapHashOk(c, want.toUpperCase(), KEY)).toBe(true);
    expect(tapHashOk({ ...c, amount: 0.001 }, want, KEY)).toBe(false);
    expect(tapHashOk(c, null, KEY)).toBe(false);
    expect(tapHashOk(c, "zz", KEY)).toBe(false);
  });
  it("sends BENEFIT straight to BENEFIT, and card to Tap's page with Apple Pay; nothing saved", () => {
    const base = { paymentId: PAY, tabId: TABA, amountFils: 5200, description: "x", redirectUrl: "https://a/r", webhookUrl: "https://a/w" };
    expect(chargeBody({ ...base, method: "benefit" }).source).toEqual({ id: "src_bh.benefit" });
    expect(chargeBody({ ...base, method: "card" }).source).toEqual({ id: "src_all" });
    expect(chargeBody({ ...base, method: "card" })).toMatchObject({ amount: 5.2, currency: "BHD", save_card: false, reference: { transaction: PAY } });
  });
  it("says what the guest may do with the bill", () => {
    expect(payState({ enabled: false, balanceFils: 100, canClose: true, paying: false })).toBe("off");
    expect(payState({ enabled: true, balanceFils: 0, canClose: true, paying: false })).toBe("nothing");
    expect(payState({ enabled: true, balanceFils: 100, canClose: false, paying: false })).toBe("wait");
    expect(payState({ enabled: true, balanceFils: 100, canClose: true, paying: true })).toBe("paying");
    expect(payState({ enabled: true, balanceFils: 100, canClose: true, paying: false })).toBe("ready");
  });
  it("is off without a proper key or a public https address, and the fake never runs in production", () => {
    expect(tapConfig({ TAP_SECRET_KEY: KEY, PUBLIC_BASE_URL: "https://x.test" })?.mode).toBe("test");
    expect(tapConfig({ TAP_SECRET_KEY: KEY, PUBLIC_BASE_URL: "http://x.test" })).toBeNull();
    expect(tapConfig({ TAP_SECRET_KEY: "nope", PUBLIC_BASE_URL: "https://x.test" })).toBeNull();
    expect(tapConfig({ TAP_FAKE: "1", LOYALTY_FAKE_DB: "1", NODE_ENV: "production" })).toBeNull();
    expect(tapConfig({ TAP_FAKE: "1", LOYALTY_FAKE_DB: "1", NODE_ENV: "development" }, "http://localhost:3030")?.mode).toBe("fake");
  });
});

// ---- starting a payment ---------------------------------------------------------------------------------------------

describe("starting a payment", () => {
  it("charges what the tab comes to, worked out on the server, and sends the guest to Tap's page", async () => {
    const r = await payPOST(json({ method: "benefit", amount: 0.001 }), tok(TOKEN_A));
    expect(r.status).toBe(200);
    const { url } = await r.json();
    expect(url).toMatch(/^https:\/\/checkout\.tap\.company\//);
    expect(tap.posts).toHaveLength(1);
    const { body, auth } = tap.posts[0];
    expect(auth).toBe(`Bearer ${KEY}`);
    const p = rows("payments")[0];
    expect(body).toMatchObject({ amount: 5.2, currency: "BHD", source: { id: "src_bh.benefit" }, reference: { transaction: p.id, order: TABA } });
    expect(body.redirect).toEqual({ url: `https://orbyn.example.test/t/${TOKEN_A}?pay=${p.id}` });
    expect(body.post).toEqual({ url: "https://orbyn.example.test/api/tap/webhook" });
    expect(p).toMatchObject({ venue_id: VA, tab_id: TABA, amount_fils: 5200, status: "initiated", method: "benefit", charge_id: lastCharge().id });
  });
  it("a second tap on Pay reuses the same Tap page instead of making a second charge", async () => {
    const first = await (await startPay()).json();
    const again = await (await startPay()).json();
    expect(again.url).toBe(first.url);
    expect(tap.posts).toHaveLength(1);
  });
  it("waits while a round is still being made, and has nothing to charge on an empty tab", async () => {
    rows("orders")[0].status = "accepted";
    const r = await startPay();
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe("wait");
    rows("orders")[0].status = "cancelled";
    expect((await (await startPay()).json()).error).toBe("nothing");
    expect(tap.posts).toHaveLength(0);
  });
  it("is off without a key, and off for any venue other than the one the Tap account belongs to", async () => {
    vi.stubEnv("TAP_SECRET_KEY", "");
    expect((await startPay()).status).toBe(503);
    vi.stubEnv("TAP_SECRET_KEY", KEY);
    expect((await startPay("benefit", TOKEN_B)).status).toBe(503);
    expect(tap.posts).toHaveLength(0);
  });
  it("refuses an unknown method or table", async () => {
    expect((await startPay("crypto")).status).toBe(400);
    expect((await startPay("benefit", "no-such-table-token-x")).status).toBe(404);
  });
  it("marks the payment failed, and says so, when Tap refuses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errors: [{ description: "Invalid amount" }] }), { status: 400 })));
    const r = await startPay();
    expect(r.status).toBe(502);
    expect(rows("payments")[0]).toMatchObject({ status: "failed", note: "Tap: Invalid amount" });
  });
  it("never sends a guest to a page that is not Tap's", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ id: "chg_TS99999999", status: "INITIATED", amount: body.amount, currency: "BHD", transaction: { url: "https://evil.example/pay" } }), { status: 200 });
    }));
    expect((await startPay()).status).toBe(502);
    expect(rows("payments")[0].status).toBe("failed");
  });
});

// ---- coming back, and the webhook -------------------------------------------------------------------------------------

describe("confirming a payment", () => {
  it("closes the tab as soon as Tap confirms the money, and the guest sees it paid", async () => {
    await startedPayment("card");
    setTap({ status: "CAPTURED", source: { payment_method: "APPLE_PAY" } });
    const r = await check(PAY);
    expect(r.status).toBe(200);
    expect((await r.json()).status).toBe("captured");
    expect(rows("payments")[0]).toMatchObject({ status: "captured", method: "APPLE_PAY" });
    expect(tabA()).toMatchObject({ status: "paid", paid_method: "tap" });
    expect(rows("table_requests").every((q) => q.handled_at)).toBe(true);
    expect(rows("audit_log").map((a) => a.action)).toContain("payment_captured");
    const tab = (await (await tableGET(new Request("http://t.local"), tok(TOKEN_A))).json()).tab;
    expect(tab.rounds).toEqual([]);
    const board = await (await boardGET()).json();
    expect(board.tabs.find((t: { id: string }) => t.id === TABA)).toBeUndefined();
    expect(board.cardPaid).toMatchObject([{ table: "1", amountFils: 5200, method: "APPLE_PAY", closed: true }]);
  });
  it("leaves everything open while Tap still says initiated, and marks a declined card failed", async () => {
    await startedPayment();
    expect((await (await check(PAY)).json()).status).toBe("initiated");
    expect(tabA().status).toBe("open");
    setTap({ status: "DECLINED" });
    expect((await (await check(PAY)).json()).status).toBe("failed");
    expect(tabA().status).toBe("open");
  });
  it("never counts a charge for a different amount; it is held for a person", async () => {
    await startedPayment();
    setTap({ status: "CAPTURED", amount: 0.52 });
    expect((await (await check(PAY)).json()).status).toBe("review");
    expect(tabA().status).toBe("open");
    expect(rows("audit_log").map((a) => a.action)).toContain("payment_review");
  });
  it("cannot be checked from another table or another venue", async () => {
    await startedPayment();
    setTap({ status: "CAPTURED" });
    expect((await check(PAY, TOKEN_A2)).status).toBe(404);
    expect((await check(PAY, TOKEN_B)).status).toBe(404);
    expect((await check(id(5))).status).toBe(404);
    expect(rows("payments")[0].status).toBe("initiated");
  });
  it("keeps the tab open with the rest to pay when a round was added after paying, then staff close it as mixed", async () => {
    await startedPayment();
    rows("order_items").push({ id: id(72), venue_id: VA, order_id: OA, name_en: "Tea", name_ar: null, price_fils: 1000, qty: 1, note: null });
    setTap({ status: "CAPTURED" });
    expect((await (await check(PAY)).json()).status).toBe("captured");
    expect(tabA().status).toBe("open");
    const tab = (await (await tableGET(new Request("http://t.local"), tok(TOKEN_A))).json()).tab;
    expect(tab).toMatchObject({ totalFils: 6200, paidFils: 5200, balanceFils: 1000, pay: "ready" });
    const board = await (await boardGET()).json();
    expect(board.tabs[0]).toMatchObject({ paidFils: 5200, balanceFils: 1000 });
    expect((await closePOST(json({ tabId: TABA }))).status).toBe(200);
    expect(tabA()).toMatchObject({ status: "paid", paid_method: "mixed" });
  });
  it("a payment that lands after staff closed the tab is logged so the owner can refund it", async () => {
    await startedPayment();
    expect((await closePOST(json({ tabId: TABA }))).status).toBe(200);
    setTap({ status: "CAPTURED" });
    await check(PAY);
    expect(rows("audit_log").map((a) => a.action)).toContain("payment_after_close");
  });
});

describe("Tap's webhook", () => {
  const signed = (c: TapCharge, key = KEY) => json(c, { hashstring: tapHash(c, key) });

  it("refuses a call without Tap's signature, or signed with another key", async () => {
    await startedPayment();
    const c = { ...lastCharge(), status: "CAPTURED" };
    expect((await webhookPOST(json(c))).status).toBe(401);
    expect((await webhookPOST(signed(c, "sk_test_SOMEoneELSEkey99"))).status).toBe(401);
    expect(rows("payments")[0].status).toBe("initiated");
  });
  it("a signed call only makes us ask Tap again: a body that says CAPTURED changes nothing while Tap says otherwise", async () => {
    await startedPayment();
    const r = await webhookPOST(signed({ ...lastCharge(), status: "CAPTURED" }));
    expect(r.status).toBe(200);
    expect(rows("payments")[0].status).toBe("initiated");
    expect(tabA().status).toBe("open");
  });
  it("closes the tab when Tap confirms, and a repeat of the same call changes nothing more", async () => {
    await startedPayment();
    setTap({ status: "CAPTURED" });
    expect((await webhookPOST(signed(lastCharge()))).status).toBe(200);
    expect(tabA()).toMatchObject({ status: "paid", paid_method: "tap" });
    expect((await webhookPOST(signed(lastCharge()))).status).toBe(200);
    expect(rows("audit_log").filter((a) => a.action === "payment_captured")).toHaveLength(1);
  });
  it("ignores charges that are not ours, and junk", async () => {
    const stranger: TapCharge = { id: "chg_STRANGER01", status: "CAPTURED", amount: 1, currency: "BHD" };
    expect((await webhookPOST(signed(stranger))).status).toBe(200);
    expect((await webhookPOST(new Request("http://t/x", { method: "POST", body: "not json" }))).status).toBe(400);
    expect((await webhookPOST(json({ id: "../../etc" }))).status).toBe(400);
  });
});

describe("paying cash", () => {
  it("calls staff with the bill: the board shows a cash call and what to collect", async () => {
    expect((await requestPOST(json({ kind: "cash" }), tok(TOKEN_A))).status).toBe(200);
    const board = await (await boardGET()).json();
    expect(board.calls.map((c: { kind: string }) => c.kind)).toContain("cash");
    expect(board.tabs[0]).toMatchObject({ balanceFils: 5200 });
    const tab = (await (await tableGET(new Request("http://t.local"), tok(TOKEN_A))).json()).tab;
    expect(tab.calls).toContain("cash");
    expect(tap.posts).toHaveLength(0);
  });
});
