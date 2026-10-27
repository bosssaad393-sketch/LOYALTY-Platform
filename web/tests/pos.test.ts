import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// The POS connector and the developer area, against an in-memory database. The SQL functions behind posSale / posRefund are mocked here
// (they are checked separately against a real Postgres). Invented data only.

const h = vi.hoisted(() => ({
  state: undefined as unknown as FakeState,
  staff: null as Staff | null,
  sales: [] as unknown[][],
  refunds: [] as unknown[][],
  saleImpl: null as null | ((...a: unknown[]) => unknown),
  seen: new Set<string>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});
vi.mock("../src/lib/staffAuth", () => ({ currentStaff: async () => h.staff }));
vi.mock("../src/lib/ledgerDb", () => ({
  posSale: async (...a: unknown[]) => {
    if (h.saleImpl) return h.saleImpl(...a);
    h.sales.push(a);
    const dup = h.seen.has(String(a[3]));
    h.seen.add(String(a[3]));
    return { ledger_id: 5, points_added: dup ? 0 : 25, new_balance: 125, duplicate: dup };
  },
  posRefund: async (...a: unknown[]) => (h.refunds.push(a), { ledger_id: 6, points_removed: 25, new_balance: 100, duplicate: false }),
}));
vi.mock("../src/lib/appleWallet", () => ({ appleWalletConfigured: () => false }));
vi.mock("../src/lib/apns", () => ({ notifyAppleTokens: async () => 0, notifyAppleDevices: async () => {} }));
vi.mock("../src/lib/googleWallet", () => ({ googleWalletConfigured: () => false, updatePoints: async () => {}, addOfferMessages: async () => ({ sent: 0, notSaved: 0, failed: 0 }) }));

import { newState } from "./helpers/fakeDb";
import { receiveEvent, generateKey, posStatus } from "../src/lib/pos/connector";
import { bearerKey, hashKey, newKey, sameHash } from "../src/lib/pos/keys";
import { POST as eventsPOST } from "../src/app/api/pos/events/route";
import { GET as posGET, POST as posPOST, PATCH as posPATCH } from "../src/app/api/dev/pos/route";
import { GET as reqGET, PATCH as reqPATCH } from "../src/app/api/dev/requests/route";

const VA = "venue-a";
const VB = "venue-b";
const dev = (venueId: string, role: Staff["role"] = "developer"): Staff => ({ id: `${role}-${venueId}`, name: role, role, venueId, venueSlug: venueId.slice(-1), venueName: "V" });
const DEV_A = dev(VA);
const REQ_A = "aaaaaaaa-0000-4000-8000-0000000000c1";
const REQ_B = "bbbbbbbb-0000-4000-8000-0000000000c2";

const bearer = (key: string) => `Bearer ${key}`;
const sale = (n = 1, extra = {}) => ({ type: "sale", receiptId: `R-${n}`, cardCode: "1111", billBhd: 12.5, ...extra });
const json = (body: unknown, method = "POST") => new Request("http://t.local/api", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  h.sales = [];
  h.refunds = [];
  h.saleImpl = null;
  h.seen = new Set();
  h.staff = DEV_A;
  h.state = newState({
    venues: [{ id: VA }, { id: VB }],
    cards: [{ id: "c-a", venue_id: VA, code: "1111", points: 100 }, { id: "c-b", venue_id: VB, code: "1111", points: 7 }],
    ledger: [],
    pos_connections: [],
    pos_events: [],
    assistant_requests: [
      { id: REQ_A, venue_id: VA, staff_id: "s", message: "connect my POS", why: "unsupported", status: "open", result: null, created_at: "2026-10-27T10:00:00Z" },
      { id: REQ_B, venue_id: VB, staff_id: "s", message: "secret request of B", why: "unsupported", status: "open", result: null, created_at: "2026-10-27T10:00:00Z" },
    ],
    audit_log: [],
  });
});

const keyFor = async (venueId = VA) => (await generateKey(dev(venueId))).key;

describe("keys", () => {
  it("are random, have a clear prefix, and only the hash is stored", async () => {
    const a = newKey(), b = newKey();
    expect(a.key).toMatch(/^loy_pos_[A-Za-z0-9_-]{43}$/);
    expect(a.key).not.toBe(b.key);
    const key = await keyFor();
    const row = h.state.tables.pos_connections[0];
    expect(row.key_hash).toBe(hashKey(key));
    expect(JSON.stringify(row)).not.toContain(key);
    expect(JSON.stringify(h.state.tables.audit_log)).not.toContain(key);
  });

  it("are read only from a well-formed Bearer header", () => {
    const { key } = newKey();
    expect(bearerKey(bearer(key))).toBe(key);
    for (const bad of [null, "", key, `Basic ${key}`, "Bearer loy_pos_short", "Bearer " + key + "x"]) expect(bearerKey(bad as string | null)).toBeNull();
    expect(sameHash(hashKey("a"), hashKey("a"))).toBe(true);
    expect(sameHash(hashKey("a"), hashKey("b"))).toBe(false);
  });

  it("a new key replaces the old one at once", async () => {
    const k1 = await keyFor();
    const k2 = await keyFor();
    expect((await receiveEvent(bearer(k1), { type: "ping" })).status).toBe(401);
    expect((await receiveEvent(bearer(k2), { type: "ping" })).status).toBe(200);
    expect(h.state.tables.pos_connections).toHaveLength(1);
  });
});

describe("the POS webhook", () => {
  it("answers 401 without telling which part was wrong", async () => {
    await keyFor();
    for (const auth of [null, "Bearer nope", bearer(newKey().key)]) {
      const r = await receiveEvent(auth, sale());
      expect(r).toEqual({ status: 401, body: { error: "unauthorized" } });
    }
    expect(h.sales).toHaveLength(0);
  });

  it("a disabled connection is refused", async () => {
    const key = await keyFor();
    h.state.tables.pos_connections[0].status = "disabled";
    expect((await receiveEvent(bearer(key), sale())).status).toBe(401);
    expect(h.sales).toHaveLength(0);
  });

  it("ping works and is logged", async () => {
    const key = await keyFor();
    expect((await receiveEvent(bearer(key), { type: "ping" })).status).toBe(200);
    expect(h.state.tables.pos_events[0]).toMatchObject({ kind: "ping", outcome: "ok", venue_id: VA });
    expect(h.state.tables.pos_connections[0].last_event_at).toBeTruthy();
  });

  it("a sale gives points, for the venue of the KEY", async () => {
    const key = await keyFor(VA);
    const r = await receiveEvent(bearer(key), sale(1));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, duplicate: false, pointsAdded: 25 });
    expect(h.sales[0]).toEqual([VA, "1111", 12.5, "R-1"]);
  });

  it("a key cannot name another venue: any venue id in the body is ignored", async () => {
    const key = await keyFor(VA);
    await receiveEvent(bearer(key), { ...sale(2), venueId: VB, venue_id: VB });
    expect(h.sales[0][0]).toBe(VA);
  });

  it("the same receipt twice is a duplicate and adds nothing", async () => {
    const key = await keyFor();
    await receiveEvent(bearer(key), sale(3));
    const again = await receiveEvent(bearer(key), sale(3));
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ duplicate: true, pointsAdded: 0 });
    expect(h.state.tables.pos_events.map((e) => e.outcome)).toEqual(["ok", "duplicate"]);
  });

  it("a refund takes the points back", async () => {
    const key = await keyFor();
    const r = await receiveEvent(bearer(key), { type: "refund", receiptId: "R-1" });
    expect(r.body).toMatchObject({ ok: true, pointsRemoved: 25 });
    expect(h.refunds[0]).toEqual([VA, "R-1"]);
  });

  it("rejects bad messages (400) without calling the database function", async () => {
    const key = await keyFor();
    for (const bad of [{}, { type: "sale" }, sale(1, { cardCode: "12" }), sale(1, { billBhd: -5 }), sale(1, { billBhd: 99999 }), sale(1, { receiptId: "" }), sale(1, { receiptId: "x".repeat(65) }), { type: "refund" }, "text"]) {
      expect((await receiveEvent(bearer(key), bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(h.sales).toHaveLength(0);
  });

  it("explains a refused sale in plain words (422) and logs it", async () => {
    const key = await keyFor();
    h.saleImpl = async () => { throw new Error("card not found"); };
    const r = await receiveEvent(bearer(key), sale(7));
    expect(r).toEqual({ status: 422, body: { ok: false, error: "unknown card code" } });
    expect(h.state.tables.pos_events[0]).toMatchObject({ outcome: "rejected", detail: "unknown card code" });
  });

  it("hides a server failure behind a generic answer (500)", async () => {
    const key = await keyFor();
    h.saleImpl = async () => { throw new Error("connection to 10.0.0.5 refused"); };
    const r = await receiveEvent(bearer(key), sale(8));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("10.0.0.5");
  });

  it("slows down a flood (429)", async () => {
    const key = await keyFor();
    let last = 200;
    for (let i = 0; i < 125; i++) last = (await receiveEvent(bearer(key), { type: "ping" })).status;
    expect(last).toBe(429);
  });

  it("works through the real route too, with the answer never cached", async () => {
    const key = await keyFor();
    const res = await eventsPOST(new Request("http://t.local/api/pos/events", { method: "POST", headers: { authorization: bearer(key), "content-type": "application/json" }, body: JSON.stringify(sale(9)) }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await eventsPOST(new Request("http://t.local/api/pos/events", { method: "POST", body: "not json" }))).status).toBe(401);
  });
});

describe("the developer area", () => {
  it("is for developers only", async () => {
    for (const role of ["owner", "manager", "staff"] as const) {
      h.staff = dev(VA, role);
      expect((await posGET()).status, role).toBe(403);
      expect((await posPOST()).status, role).toBe(403);
      expect((await reqGET()).status, role).toBe(403);
    }
    h.staff = null;
    expect((await posGET()).status).toBe(401);
    expect(h.state.tables.pos_connections).toHaveLength(0);
  });

  it("makes a key once, then shows only its start", async () => {
    const made = await (await posPOST()).json();
    expect(made.key).toMatch(/^loy_pos_/);
    const status = await (await posGET()).json();
    expect(status).toMatchObject({ configured: true, status: "active", keyPrefix: made.prefix });
    expect(JSON.stringify(status)).not.toContain(made.key);
    expect(status.providers.find((p: { id: string }) => p.id === "generic").status).toBe("available");
    expect(status.providers.filter((p: { status: string }) => p.status === "planned").length).toBeGreaterThan(0);
  });

  it("switches the connection off and on, and refuses before a key exists", async () => {
    expect((await posPATCH(json({ status: "disabled" }, "PATCH"))).status).toBe(404);
    await posPOST();
    expect((await posPATCH(json({ status: "disabled" }, "PATCH"))).status).toBe(200);
    expect((await posGET().then((r) => r.json())).status).toBe("disabled");
    expect((await posPATCH(json({ status: "weird" }, "PATCH"))).status).toBe(400);
  });

  it("shows only its own business's events", async () => {
    const kA = await keyFor(VA), kB = await keyFor(VB);
    await receiveEvent(bearer(kA), sale(1));
    await receiveEvent(bearer(kB), sale(2));
    const s = await posStatus(DEV_A);
    expect(s.events.map((e) => e.receipt)).toEqual(["R-1"]);
  });

  it("the team inbox lists and updates only its own business's requests", async () => {
    const list = await (await reqGET()).json();
    expect(list.requests.map((r: { id: string }) => r.id)).toEqual([REQ_A]);
    expect(JSON.stringify(list)).not.toContain("secret request of B");
    expect((await reqPATCH(json({ id: REQ_B, status: "done", result: "x" }, "PATCH"))).status).toBe(404);
    expect(h.state.tables.assistant_requests.find((r) => r.id === REQ_B)?.status).toBe("open");
    expect((await reqPATCH(json({ id: REQ_A, status: "done", result: "POS connected" }, "PATCH"))).status).toBe(200);
    expect(h.state.tables.assistant_requests.find((r) => r.id === REQ_A)).toMatchObject({ status: "done", result: "POS connected" });
    expect((await reqPATCH(json({ id: "not-a-uuid", status: "done" }, "PATCH"))).status).toBe(400);
  });
});
