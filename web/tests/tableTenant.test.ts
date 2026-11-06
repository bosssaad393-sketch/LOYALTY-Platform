import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// Table service: a QR code only ever reaches its own venue, and a signed-in person of venue A can never touch venue B.
// Real route handlers against the in-memory stand-in. Each "cannot" has a positive control on venue A's own data. Invented data only.

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
import { POST as requestPOST } from "../src/app/api/table/[code]/request/route";
import { GET as boardGET } from "../src/app/api/staff/board/route";
import { POST as actPOST } from "../src/app/api/staff/board/order/route";
import { POST as handledPOST } from "../src/app/api/staff/board/request/route";
import { POST as closePOST } from "../src/app/api/staff/board/close/route";
import { POST as itemPOST } from "../src/app/api/staff/board/item/route";
import { POST as addPOST } from "../src/app/api/staff/board/add/route";
import { GET as menuGET, PATCH as menuPATCH, DELETE as menuDELETE, POST as menuPOST } from "../src/app/api/owner/menu/route";
import { POST as photoPOST, DELETE as photoDELETE } from "../src/app/api/owner/menu/photo/route";
import { GET as tablesGET, DELETE as tablesDELETE } from "../src/app/api/owner/tables/route";
import { GET as serviceGET } from "../src/app/api/owner/service/route";

const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
const VA = id(1), VB = id(2);
const TA = id(11), TB = id(12);
const CA = id(21), CB = id(22);
const IA = id(31), IB = id(32);
const TABA = id(41), TABB = id(42);
const OA = id(51), OB = id(52);
const RA = id(61), RB = id(62);
const TOKEN_A = "token-of-venue-a-0001", TOKEN_B = "token-of-venue-b-0001";

const staffOf = (venueId: string, role: Staff["role"] = "owner"): Staff => ({ id: "s", name: "S", role, venueId, venueSlug: "x", venueName: "X" });
const json = (body: unknown) => new Request("http://test.local/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const tok = (token: string) => ({ params: Promise.resolve({ code: token }) }) as never;

beforeEach(() => {
  h.staff = staffOf(VA);
  h.state = newState({
    venues: [{ id: VA, slug: "a", name: "A", active: true }, { id: VB, slug: "b", name: "B", active: true }],
    venue_tables: [
      { id: TA, venue_id: VA, label: "1", token: TOKEN_A, active: true },
      { id: TB, venue_id: VB, label: "1", token: TOKEN_B, active: true },
    ],
    menu_categories: [{ id: CA, venue_id: VA, name_en: "Drinks", name_ar: null, sort: 0, active: true }, { id: CB, venue_id: VB, name_en: "Secret B", name_ar: null, sort: 0, active: true }],
    menu_items: [
      { id: IA, venue_id: VA, category_id: CA, name_en: "Tea", name_ar: null, price_fils: 1000, available: true, active: true, sort: 0 },
      { id: IB, venue_id: VB, category_id: CB, name_en: "B item", name_ar: null, price_fils: 2000, available: true, active: true, sort: 0 },
    ],
    tabs: [{ id: TABA, venue_id: VA, table_id: TA, status: "open", opened_at: "2026-11-06T10:00:00Z" }, { id: TABB, venue_id: VB, table_id: TB, status: "open", opened_at: "2026-11-06T10:00:00Z" }],
    orders: [
      { id: OA, venue_id: VA, tab_id: TABA, table_id: TA, status: "new", source: "guest", created_at: "2026-11-06T10:00:00Z" },
      { id: OB, venue_id: VB, tab_id: TABB, table_id: TB, status: "new", source: "guest", created_at: "2026-11-06T10:00:00Z" },
    ],
    order_items: [
      { id: id(71), venue_id: VA, order_id: OA, name_en: "Tea", name_ar: null, price_fils: 1000, qty: 2, note: null, created_at: "2026-11-06T10:00:00Z" },
      { id: id(72), venue_id: VB, order_id: OB, name_en: "B item", name_ar: null, price_fils: 2000, qty: 1, note: null, created_at: "2026-11-06T10:00:00Z" },
    ],
    table_requests: [
      { id: RA, venue_id: VA, tab_id: TABA, table_id: TA, kind: "coal", created_at: "2026-11-06T10:00:00Z", handled_at: null },
      { id: RB, venue_id: VB, tab_id: TABB, table_id: TB, kind: "coal", created_at: "2026-11-06T10:00:00Z", handled_at: null },
    ],
  });
});

const row = (table: string, rowId: string) => h.state.tables[table].find((r) => r.id === rowId)!;

describe("guest page through the QR code", () => {
  it("shows only its own venue's menu and tab", async () => {
    const body = JSON.stringify(await (await tableGET(new Request("http://t.local"), tok(TOKEN_A))).json());
    expect(body).toContain("Tea");
    expect(body).not.toContain("Secret B");
    expect(body).not.toContain("B item");
  });
  it("answers 404 for an unknown or removed table", async () => {
    expect((await tableGET(new Request("http://t.local"), tok("no-such-token-at-all"))).status).toBe(404);
    row("venue_tables", TA).active = false;
    expect((await tableGET(new Request("http://t.local"), tok(TOKEN_A))).status).toBe(404);
  });
  it("orders from its own menu at the menu's price", async () => {
    const r = await orderPOST(json({ items: [{ id: IA, qty: 2, price_fils: 1 }] }), tok(TOKEN_A));
    expect(r.status).toBe(200);
    expect(h.state.tables.order_items.at(-1)).toMatchObject({ venue_id: VA, price_fils: 1000, qty: 2 });
  });
  it("cannot order another venue's item", async () => {
    const before = h.state.tables.orders.length;
    const r = await orderPOST(json({ items: [{ id: IB, qty: 1 }] }), tok(TOKEN_A));
    expect(r.status).toBe(409);
    expect(h.state.tables.orders.length).toBe(before);
  });
  it("cannot order something sold out", async () => {
    row("menu_items", IA).available = false;
    expect((await orderPOST(json({ items: [{ id: IA, qty: 1 }] }), tok(TOKEN_A))).status).toBe(409);
  });
  it("a second tap on a call keeps the first time", async () => {
    await requestPOST(json({ kind: "coal" }), tok(TOKEN_A));
    expect(h.state.tables.table_requests.filter((r) => r.venue_id === VA && r.kind === "coal").length).toBe(1);
    await requestPOST(json({ kind: "bill" }), tok(TOKEN_A));
    expect(h.state.tables.table_requests.filter((r) => r.venue_id === VA).length).toBe(2);
  });
});

describe("staff board", () => {
  it("needs a sign-in", async () => {
    h.staff = null;
    expect((await boardGET()).status).toBe(401);
    expect((await actPOST(json({ orderId: OA, action: "cancel" }))).status).toBe(401);
  });
  it("shows only its own venue", async () => {
    const b = await (await boardGET()).json();
    expect(b.orders.map((o: { id: string }) => o.id)).toEqual([OA]);
    expect(b.calls.map((c: { id: string }) => c.id)).toEqual([RA]);
    expect(b.tabs[0].totalFils).toBe(2000);
    expect(JSON.stringify(b)).not.toContain("B item");
  });
  it("moves its own order, not another venue's", async () => {
    expect((await actPOST(json({ orderId: OA, action: "accept", minutes: 10 }))).status).toBe(200);
    expect(row("orders", OA).status).toBe("accepted");
    expect((await actPOST(json({ orderId: OB, action: "accept", minutes: 10 }))).status).toBe(404);
    expect(row("orders", OB).status).toBe("new");
  });
  it("marks its own call done, not another venue's", async () => {
    expect((await handledPOST(json({ requestId: RA }))).status).toBe(200);
    expect((await handledPOST(json({ requestId: RB }))).status).toBe(404);
    expect(row("table_requests", RB).handled_at).toBeNull();
  });
  it("sold-out switch stays inside the venue", async () => {
    expect((await itemPOST(json({ itemId: IA, available: false }))).status).toBe(200);
    expect((await itemPOST(json({ itemId: IB, available: false }))).status).toBe(404);
    expect(row("menu_items", IB).available).toBe(true);
  });
  it("cannot add a round to another venue's table", async () => {
    expect((await addPOST(json({ tableId: TA, items: [{ id: IA, qty: 1 }] }))).status).toBe(200);
    expect((await addPOST(json({ tableId: TB, items: [{ id: IB, qty: 1 }] }))).status).toBe(404);
  });
  it("closes a tab only when its rounds are finished, and never another venue's", async () => {
    expect((await closePOST(json({ tabId: TABA }))).status).toBe(409);
    row("orders", OA).status = "served";
    expect((await closePOST(json({ tabId: TABA }))).status).toBe(200);
    expect(row("tabs", TABA)).toMatchObject({ status: "paid", paid_method: "cash" });
    expect(row("table_requests", RA).handled_at).not.toBeNull();
    row("orders", OB).status = "served";
    expect((await closePOST(json({ tabId: TABB }))).status).toBe(404);
    expect(row("tabs", TABB).status).toBe("open");
  });
});

describe("owner screens", () => {
  const patch = (body: unknown) => new Request("http://t.local", { method: "PATCH", body: JSON.stringify(body) });
  const del = (body: unknown) => new Request("http://t.local", { method: "DELETE", body: JSON.stringify(body) });

  it("menu shows and changes only its own venue", async () => {
    expect(JSON.stringify(await (await menuGET()).json())).not.toContain("Secret B");
    expect((await menuPATCH(patch({ id: IA, nameEn: "Black tea", price: "1.250" }))).status).toBe(200);
    expect(row("menu_items", IA)).toMatchObject({ name_en: "Black tea", price_fils: 1250 });
    expect((await menuPATCH(patch({ id: IB, nameEn: "Hacked", price: "0" }))).status).toBe(404);
    expect(row("menu_items", IB).name_en).toBe("B item");
    expect((await menuDELETE(del({ id: IB }))).status).toBe(404);
    expect(row("menu_items", IB).active).toBe(true);
  });
  it("cannot add an item to another venue's section", async () => {
    expect((await menuPOST(json({ kind: "item", categoryId: CA, nameEn: "New", price: "1" }))).status).toBe(200);
    expect((await menuPOST(json({ kind: "item", categoryId: CB, nameEn: "New", price: "1" }))).status).toBe(404);
  });
  it("a photo goes only on its own venue's item, and only a real image is accepted", async () => {
    process.env.LOYALTY_FAKE_DB = "1";
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 "), Buffer.alloc(20)]);
    const good = `data:image/webp;base64,${webp.toString("base64")}`;
    expect((await photoPOST(json({ id: IA, image: good }))).status).toBe(200);
    expect(row("menu_items", IA).image_url).toBe(good);
    expect((await photoPOST(json({ id: IB, image: good }))).status).toBe(404);
    expect(row("menu_items", IB).image_url).toBeUndefined();
    expect((await photoDELETE(del({ id: IB }))).status).toBe(404);
    const fakeImage = `data:image/webp;base64,${Buffer.from("<script>alert(1)</script>").toString("base64")}`;
    expect((await photoPOST(json({ id: IA, image: fakeImage }))).status).toBe(400);
    expect((await photoPOST(json({ id: IA, image: "https://evil.example/x.webp" }))).status).toBe(400);
    expect(row("menu_items", IA).image_url).toBe(good);
    expect((await photoDELETE(del({ id: IA }))).status).toBe(200);
    expect(row("menu_items", IA).image_url).toBeNull();
    delete process.env.LOYALTY_FAKE_DB;
  });
  it("refuses a bad price", async () => {
    expect((await menuPOST(json({ kind: "item", categoryId: CA, nameEn: "New", price: "cheap" }))).status).toBe(400);
  });
  it("tables and their QR tokens stay inside the venue", async () => {
    const list = JSON.stringify(await (await tablesGET()).json());
    expect(list).toContain(TOKEN_A);
    expect(list).not.toContain(TOKEN_B);
    expect((await tablesDELETE(del({ id: TB }))).status).toBe(404);
    expect(row("venue_tables", TB).active).toBe(true);
  });
  it("a table with an open tab cannot be removed", async () => {
    expect((await tablesDELETE(del({ id: TA }))).status).toBe(409);
  });
  it("report counts only its own venue, and staff cannot open it", async () => {
    h.state.tables.orders[0].created_at = new Date().toISOString();
    h.state.tables.orders[1].created_at = new Date().toISOString();
    h.state.tables.order_items[0].created_at = new Date().toISOString();
    h.state.tables.order_items[1].created_at = new Date().toISOString();
    const r = await (await serviceGET(new Request("http://t.local/x?range=today"))).json();
    expect(r.rounds).toBe(1);
    expect(r.sales.totalFils).toBe(2000);
    h.staff = staffOf(VA, "staff");
    expect((await serviceGET(new Request("http://t.local/x"))).status).toBe(403);
  });
});
