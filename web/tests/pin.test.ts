import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// PIN sign-in: correct PIN, wrong PIN, lock-out, role rules, venue isolation. REAL staffAuth/pin code against the in-memory database.

const h = vi.hoisted(() => ({ state: undefined as unknown as FakeState, staff: null as Staff | null }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});

process.env.STAFF_SESSION_SECRET = "test-secret-not-real";

import { newState } from "./helpers/fakeDb";
import { POST as loginPOST } from "../src/app/api/staff/pin-login/route";
import { pinLookup, pinProblem, generatePin } from "../src/lib/pin";

const VA = "venue-a";
const VB = "venue-b";
const OWNER = "aaaaaaaa-0000-4000-8000-0000000000a1";
const CASHIER = "aaaaaaaa-0000-4000-8000-0000000000a2";
const OFF = "aaaaaaaa-0000-4000-8000-0000000000a3";
const DEV = "aaaaaaaa-0000-4000-8000-0000000000a4";
const OTHER = "bbbbbbbb-0000-4000-8000-0000000000b2";

const login = (pin: string, ip = "1.1.1.1") => loginPOST(new Request("http://t/api", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ pin }) }));

beforeEach(() => {
  h.state = newState({
    venues: [
      { id: VA, slug: "a", name: "Venue A" },
      { id: VB, slug: "b", name: "Venue B" },
    ],
    staff_users: [
      { id: OWNER, venue_id: VA, name: "Owner", role: "owner", active: true, pin_lookup: pinLookup("482915") },
      { id: CASHIER, venue_id: VA, name: "Sara", role: "staff", active: true, pin_lookup: pinLookup("7391") },
      { id: OFF, venue_id: VA, name: "Gone", role: "staff", active: false, pin_lookup: pinLookup("5820") },
      { id: DEV, venue_id: VA, name: "Dev", role: "developer", active: true, pin_lookup: pinLookup("640173") },
      { id: OTHER, venue_id: VB, name: "Bob", role: "staff", active: true, pin_lookup: pinLookup("2846") },
    ],
    pin_attempts: [],
    audit_log: [],
  });
});

describe("PIN login", () => {
  it("signs in with the right PIN and sets a session cookie", async () => {
    const r = await login("7391");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ name: "Sara", role: "staff", venue: "Venue A" });
    expect(r.headers.get("set-cookie")).toMatch(/loyalty_staff=.+HttpOnly/);
    expect((await login("482915")).status).toBe(200);
  });
  it("refuses a wrong PIN, an inactive person and a developer PIN with the same plain message", async () => {
    for (const pin of ["1357", "5820", "640173"]) {
      const r = await login(pin, `9.9.9.${pin}`);
      expect(r.status).toBe(401);
      expect((await r.json()).error).toBe("That PIN is not right.");
    }
  });
  it("rejects a malformed PIN before looking anything up", async () => {
    expect((await login("12")).status).toBe(400);
    expect((await login("abcd")).status).toBe(400);
  });
  it("locks one caller out after 5 wrong tries, even for the right PIN, and others still work", async () => {
    for (let i = 0; i < 5; i++) expect((await login("1357", "5.5.5.5")).status).toBe(401);
    expect((await login("7391", "5.5.5.5")).status).toBe(429);
    expect((await login("7391", "6.6.6.6")).status).toBe(200);
  });
  it("locks everyone out when guessing is spread over many callers", async () => {
    for (let i = 0; i < 30; i++) await login("1357", `7.7.7.${i}`);
    expect((await login("7391", "8.8.8.8")).status).toBe(429);
  });
  it("two venues never share a session: the PIN finds only its own person", async () => {
    const r = await login("2846");
    expect(await r.json()).toMatchObject({ name: "Bob", venue: "Venue B" });
  });
});

describe("PIN rules", () => {
  it("staff 4+ digits, managers and owners 6+, digits only, no easy PINs", () => {
    expect(pinProblem("7391", "staff")).toBeNull();
    expect(pinProblem("7391", "owner")).toMatch(/6 digits/);
    expect(pinProblem("482915", "owner")).toBeNull();
    expect(pinProblem("1111", "staff")).toMatch(/easy/);
    expect(pinProblem("1234", "staff")).toMatch(/easy/);
    expect(pinProblem("987654", "owner")).toMatch(/easy/);
    expect(pinProblem("12a4", "staff")).toMatch(/digits/);
    expect(pinProblem("123456789", "owner")).toMatch(/6 digits/);
  });
  it("generated PINs always follow the rules", () => {
    for (let i = 0; i < 200; i++) {
      expect(pinProblem(generatePin("staff"), "staff")).toBeNull();
      expect(pinProblem(generatePin("manager"), "manager")).toBeNull();
    }
  });
  it("the stored value is a keyed hash, never the PIN", () => {
    const lookup = pinLookup("7391");
    expect(lookup).not.toContain("7391");
    expect(lookup).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(h.state.tables.staff_users)).not.toContain('"7391"');
  });
});
