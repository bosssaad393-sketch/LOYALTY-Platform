import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";

// What CALABOS may do through the bridge: status, people, give a PIN, add a member, add a business. Invented data.

const h = vi.hoisted(() => ({ state: undefined as unknown as FakeState }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});
vi.mock("../src/lib/staffAuth", () => ({ currentStaff: async () => null, loadStaffById: async () => null }));

const TOKEN = "t".repeat(40);
process.env.CALABOS_BRIDGE_TOKEN = TOKEN;
process.env.BRAND_DEFAULT_VENUE = "a";
process.env.STAFF_SESSION_SECRET = "test-secret-not-real";

import { newState } from "./helpers/fakeDb";
import { POST as adminPOST } from "../src/app/api/calabos/admin/route";
import { pinLookup, pinProblem } from "../src/lib/pin";

const VA = "venue-a";
const VB = "venue-b";
const call = (body: unknown, token: string | null = TOKEN) =>
  adminPOST(new Request("http://t/api", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));
const users = () => h.state.tables.staff_users;

beforeEach(() => {
  h.state = newState({
    venues: [{ id: VA, slug: "a", name: "Venue A", active: true }, { id: VB, slug: "b", name: "Venue B", active: true }],
    staff_users: [
      { id: "u-owner", venue_id: VA, name: "Demo owner", role: "owner", active: true, pin_lookup: pinLookup("482915") },
      { id: "u-sara", venue_id: VA, name: "Sara", role: "staff", active: true, pin_lookup: null },
      { id: "u-sam", venue_id: VA, name: "Samir", role: "staff", active: true, pin_lookup: null },
      { id: "u-bob", venue_id: VB, name: "Bob", role: "staff", active: true, pin_lookup: null },
      { id: "u-dev", venue_id: VA, name: "Dev", role: "developer", active: true, pin_lookup: null },
    ],
    cards: [{ id: "c1", venue_id: VA }, { id: "c2", venue_id: VA }, { id: "c3", venue_id: VB }],
    assistant_requests: [{ id: "r1", venue_id: VA, status: "open" }, { id: "r2", venue_id: VA, status: "done" }],
    pos_events: [],
    pin_attempts: [],
    audit_log: [],
  });
});

describe("bridge admin: access", () => {
  it("refuses without the token, with a wrong token, and when the bridge is off", async () => {
    expect((await call({ action: "status" }, null)).status).toBe(401);
    expect((await call({ action: "status" }, "x".repeat(40))).status).toBe(401);
    const saved = process.env.CALABOS_BRIDGE_TOKEN;
    delete process.env.CALABOS_BRIDGE_TOKEN;
    expect((await call({ action: "status" })).status).toBe(404);
    process.env.CALABOS_BRIDGE_TOKEN = saved;
  });
  it("refuses unknown actions and bad fields (no delete exists)", async () => {
    expect((await call({ action: "delete_everything" })).status).toBe(400);
    expect((await call({ action: "give_pin" })).status).toBe(400);
    expect((await call({ action: "add_business", name: "X", slug: "Bad Slug!" })).status).toBe(400);
  });
});

describe("bridge admin: actions", () => {
  it("status shows counts for this business only", async () => {
    const d = await (await call({ action: "status" })).json();
    expect(d).toMatchObject({ guests: 2, team: 4, openOwnerRequests: 1, lastTillEvent: null });
  });
  it("people lists names and whether they have a PIN, never a PIN, never developers", async () => {
    const text = JSON.stringify(await (await call({ action: "people" })).json());
    expect(text).toContain("Sara");
    expect(text).not.toContain("Dev\"");
    expect(text).not.toContain("Bob");
    expect(text).not.toContain("482915");
  });
  it("gives a PIN once, stores only its hash, and writes the audit line", async () => {
    const r = await call({ action: "give_pin", name: "Sara" });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.pin).toMatch(/^\d{4}$/);
    expect(pinProblem(d.pin, "staff")).toBeNull();
    expect(users().find((u) => u.id === "u-sara")!.pin_lookup).toBe(pinLookup(d.pin));
    expect(h.state.tables.audit_log.some((a) => a.actor === "calabos" && a.action === "calabos_give_pin")).toBe(true);
  });
  it("asks for the full name when two people match, and refuses a person of another business", async () => {
    const r = await call({ action: "give_pin", name: "Sa" });
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/More than one/);
    expect((await call({ action: "give_pin", name: "Bob" })).status).toBe(422);
  });
  it("adds a team member with a PIN of the right length", async () => {
    const m = await (await call({ action: "add_member", name: "Layla", role: "manager" })).json();
    expect(m.pin).toMatch(/^\d{6}$/);
    expect(users().find((u) => u.name === "Layla")).toMatchObject({ venue_id: VA, role: "manager" });
  });
  it("adds a business with its own owner PIN, and refuses a name already used", async () => {
    const r = await call({ action: "add_business", name: "Cafe Noor", slug: "cafe-noor", rewardGoal: 300 });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.joinPath).toBe("/join/cafe-noor");
    expect(d.ownerPin).toMatch(/^\d{6}$/);
    const venue = h.state.tables.venues.find((v) => v.slug === "cafe-noor")!;
    expect(venue).toMatchObject({ name: "Cafe Noor", reward_goal: 300, points_per_bhd: 2 });
    expect(users().find((u) => u.venue_id === venue.id)).toMatchObject({ role: "owner" });
    expect((await call({ action: "add_business", name: "Again", slug: "cafe-noor" })).status).toBe(422);
  });
});
