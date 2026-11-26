import { createPublicKey } from "node:crypto";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// Alerts on staff phones (migration 0031), against an in-memory database and a stand-in network. Nothing leaves this machine.

const h = vi.hoisted(() => ({ state: undefined as unknown as FakeState }));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});

import { newState } from "./helpers/fakeDb";
import { alertText, pushHostOk } from "../src/lib/staffAlerts";
import { forgetPushKeys, newPushKeys, notifyStaff, pushKeys, subscribe, vapidHeader, waitingNow } from "../src/lib/staffPush";

const VA = "venue-a";
const VB = "venue-b";
const staff = (venueId: string): Staff => ({ id: `s-${venueId}`, name: "Waiter", role: "staff", venueId, venueSlug: "v", venueName: "Al Roshinah" });
const FCM = "https://fcm.googleapis.com/fcm/send/abc123def456";
const APPLE = "https://web.push.apple.com/QGuQyavXutnMH9xyz";
const NOON = Date.parse("2026-11-26T12:00:00Z");
const publicKeyOf = (b64u: string) => {
  const p = Buffer.from(b64u, "base64url");
  return createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: p.subarray(1, 33).toString("base64url"), y: p.subarray(33, 65).toString("base64url") } });
};

beforeEach(() => {
  forgetPushKeys();
  delete process.env.PUSH_VAPID_PUBLIC;
  delete process.env.PUSH_VAPID_PRIVATE;
  h.state = newState({ venues: [{ id: VA }, { id: VB }], push_keys: [], push_subscriptions: [], venue_tables: [{ id: "t5", venue_id: VA, label: "5" }, { id: "t2", venue_id: VA, label: "2" }], table_requests: [], orders: [], bookings: [] });
});
afterEach(() => vi.unstubAllGlobals());

describe("what an alert says", () => {
  it("names the table and what it needs, calls first, in words short enough for a watch", () => {
    const a = alertText("Al Roshinah", { calls: [{ table: "5", kind: "waiter" }, { table: "2", kind: "bill" }], newOrders: ["7"], bookings: 1 });
    expect(a).toEqual({ title: "Al Roshinah", body: "Table 5 calls the waiter · Table 2 asks for the bill · Table 7: new order · +1 more", url: "/staff/board" });
    expect(alertText("V", { calls: [], newOrders: [], bookings: 2 })).toEqual({ title: "V", body: "2 table requests to answer", url: "/owner" });
    expect(alertText("V", { calls: [], newOrders: [], bookings: 0 }).body).toBe("Something needs you. Open the table board.");
  });

  it("reads what is waiting at one venue only", async () => {
    h.state.tables.table_requests.push(
      { id: "r1", venue_id: VA, table_id: "t5", kind: "waiter", handled_at: null, created_at: "2026-11-26T10:00:00Z" },
      { id: "r2", venue_id: VA, table_id: "t2", kind: "bill", handled_at: "2026-11-26T10:01:00Z", created_at: "2026-11-26T09:00:00Z" },
      { id: "r3", venue_id: VB, table_id: "x", kind: "waiter", handled_at: null, created_at: "2026-11-26T10:00:00Z" },
    );
    h.state.tables.orders.push({ id: "o1", venue_id: VA, table_id: "t2", status: "new", created_at: "2026-11-26T10:02:00Z" }, { id: "o2", venue_id: VA, table_id: "t2", status: "served", created_at: "2026-11-26T09:02:00Z" });
    expect(await waitingNow(VA)).toEqual({ calls: [{ table: "5", kind: "waiter" }], newOrders: ["2"], bookings: 0 });
  });
});

describe("which devices may register", () => {
  it("only the phone makers' own push services, over https", () => {
    for (const ok of [FCM, APPLE, "https://updates.push.services.mozilla.com/wpush/v2/abc", "https://db5p.notify.windows.com/w/?token=abc"]) expect(pushHostOk(ok), ok).toBe(true);
    for (const bad of ["http://fcm.googleapis.com/fcm/send/x", "https://fcm.googleapis.com.evil.example/x", "https://evil.example/fcm.googleapis.com", "https://169.254.169.254/latest", "https://localhost/x", "not a url"]) expect(pushHostOk(bad), bad).toBe(false);
  });

  it("a device at any other address is refused and not stored", async () => {
    expect(await subscribe(staff(VA), { endpoint: "https://evil.example/hook" })).toBe(false);
    expect(await subscribe(staff(VA), { endpoint: FCM, keys: { p256dh: "p", auth: "a" } })).toBe(true);
    expect(await subscribe(staff(VB), { endpoint: FCM })).toBe(true); // the same phone signs in at another venue: it moves
    expect(h.state.tables.push_subscriptions.map((s) => [s.venue_id, s.endpoint])).toEqual([[VB, FCM]]);
  });
});

describe("the signature a push service checks", () => {
  it("is a short-lived token for that service only, signed with our key", () => {
    const keys = newPushKeys();
    expect(Buffer.from(keys.publicKey, "base64url")).toHaveLength(65);
    expect(Buffer.from(keys.privateKey, "base64url")).toHaveLength(32);
    const [, token, k] = vapidHeader(APPLE, keys, NOON).match(/^vapid t=([\w.-]+), k=([\w-]+)$/)!;
    expect(k).toBe(keys.publicKey);
    const claims = jwt.verify(token, publicKeyOf(keys.publicKey), { algorithms: ["ES256"], clockTimestamp: NOON / 1000 }) as Record<string, unknown>;
    expect(claims.aud).toBe("https://web.push.apple.com");
    expect(Number(claims.exp) - NOON / 1000).toBe(12 * 3600);
    expect(() => jwt.verify(token, publicKeyOf(newPushKeys().publicKey), { algorithms: ["ES256"], clockTimestamp: NOON / 1000 })).toThrow();
  });

  it("the key pair is made once and kept; the settings of the server win when present", async () => {
    const first = await pushKeys();
    forgetPushKeys();
    expect(await pushKeys()).toEqual(first);
    expect(h.state.tables.push_keys).toHaveLength(1);
    forgetPushKeys();
    const mine = newPushKeys();
    process.env.PUSH_VAPID_PUBLIC = mine.publicKey;
    process.env.PUSH_VAPID_PRIVATE = mine.privateKey;
    expect(await pushKeys()).toEqual(mine);
    forgetPushKeys();
    process.env.PUSH_VAPID_PRIVATE = "too-short";
    expect(await pushKeys()).toBeNull();
  });
});

describe("waking the staff phones", () => {
  it("sends an empty, signed wake-up to each device of the venue and forgets a device that is gone", async () => {
    await subscribe(staff(VA), { endpoint: FCM });
    await subscribe(staff(VA), { endpoint: APPLE });
    await subscribe(staff(VB), { endpoint: "https://fcm.googleapis.com/fcm/send/other-venue" });
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(null, { status: url === APPLE ? 410 : 201 }); }));
    expect(await notifyStaff(VA)).toEqual({ sent: 1, gone: 1 });
    expect(calls.map((c) => c.url).sort()).toEqual([FCM, APPLE].sort());
    for (const c of calls) {
      expect(c.init.method).toBe("POST");
      expect(c.init.body).toBeUndefined(); // no text ever goes through the push service
      expect((c.init.headers as Record<string, string>).authorization).toMatch(/^vapid t=/);
    }
    expect(h.state.tables.push_subscriptions.map((s) => s.endpoint).sort()).toEqual([FCM, "https://fcm.googleapis.com/fcm/send/other-venue"].sort());
  });

  it("never throws: a push service that does not answer, or a venue with no devices", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    expect(await notifyStaff(VA)).toEqual({ sent: 0, gone: 0 });
    await subscribe(staff(VA), { endpoint: FCM });
    expect(await notifyStaff(VA)).toEqual({ sent: 0, gone: 0 });
  });
});
