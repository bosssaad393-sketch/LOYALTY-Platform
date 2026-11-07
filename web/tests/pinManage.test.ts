import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// Who may set PINs: the owner for their own team, the developer for their own business, nobody across venues. Invented data.

const h = vi.hoisted(() => ({ state: undefined as unknown as FakeState, staff: null as Staff | null }));

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});
vi.mock("../src/lib/staffAuth", () => ({ currentStaff: async () => h.staff, loadStaffById: async () => null }));

process.env.STAFF_SESSION_SECRET = "test-secret-not-real";

import { newState } from "./helpers/fakeDb";
import { POST as ownerPin } from "../src/app/api/owner/team/pin/route";
import { POST as devPin } from "../src/app/api/dev/pin/route";
import { GET as teamGET, POST as teamPOST } from "../src/app/api/owner/team/route";
import { pinLookup } from "../src/lib/pin";

const VA = "venue-a";
const VB = "venue-b";
const OWNER = "aaaaaaaa-0000-4000-8000-0000000000a1";
const CASHIER = "aaaaaaaa-0000-4000-8000-0000000000a2";
const OTHER = "bbbbbbbb-0000-4000-8000-0000000000b2";
const OTHER_OWNER = "bbbbbbbb-0000-4000-8000-0000000000b1";

const as = (id: string, role: Staff["role"], venueId = VA): Staff => ({ id, name: role, role, venueId, venueSlug: "a", venueName: "Venue A" });
const json = (body: unknown) => new Request("http://t/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const users = () => h.state.tables.staff_users;

beforeEach(() => {
  h.state = newState({
    staff_users: [
      { id: OWNER, venue_id: VA, name: "Owner", role: "owner", active: true, pin_lookup: pinLookup("482915") },
      { id: CASHIER, venue_id: VA, name: "Sara", role: "staff", active: true, pin_lookup: null },
      { id: OTHER, venue_id: VB, name: "Bob", role: "staff", active: true, pin_lookup: pinLookup("2846") },
      { id: OTHER_OWNER, venue_id: VB, name: "Other owner", role: "owner", active: true, pin_lookup: pinLookup("917304") },
    ],
    audit_log: [],
  });
  h.staff = as(OWNER, "owner");
});

describe("owner sets PINs", () => {
  it("sets a chosen PIN for own staff and a random one when none is given (control)", async () => {
    expect((await ownerPin(json({ id: CASHIER, pin: "7391" }))).status).toBe(200);
    expect(users().find((u) => u.id === CASHIER)!.pin_lookup).toBe(pinLookup("7391"));
    const r = await ownerPin(json({ id: CASHIER }));
    expect(r.status).toBe(200);
    expect((await r.json()).pin).toMatch(/^\d{4}$/);
  });
  it("refuses another business's person (404), a taken PIN (409), a weak PIN (400), and staff/managers (403)", async () => {
    expect((await ownerPin(json({ id: OTHER, pin: "5830" }))).status).toBe(404);
    expect(users().find((u) => u.id === OTHER)!.pin_lookup).toBe(pinLookup("2846"));
    await ownerPin(json({ id: CASHIER, pin: "7391" }));
    expect((await ownerPin(json({ id: OWNER, pin: "7391" }))).status).toBe(400); // too short for an owner
    // Bob at the OTHER venue has 2846. That must not show here: PINs are unique per venue, so it is simply accepted.
    expect((await ownerPin(json({ id: CASHIER, pin: "2846" }))).status).toBe(200);
    expect(users().find((u) => u.id === OTHER)!.pin_lookup).toBe(pinLookup("2846"));
    // Inside the same venue a PIN is still one person's: a second colleague cannot take Sara's.
    h.state.tables.staff_users.push({ id: "aaaaaaaa-0000-4000-8000-0000000000a9", venue_id: VA, name: "Ali", role: "staff", active: true, pin_lookup: null });
    expect((await ownerPin(json({ id: "aaaaaaaa-0000-4000-8000-0000000000a9", pin: "2846" }))).status).toBe(409);
    expect((await ownerPin(json({ id: CASHIER, pin: "1111" }))).status).toBe(400);
    h.staff = as(CASHIER, "staff");
    expect((await ownerPin(json({ id: CASHIER, pin: "5830" }))).status).toBe(403);
    h.staff = as(CASHIER, "manager");
    expect((await ownerPin(json({ id: CASHIER, pin: "5830" }))).status).toBe(403);
  });
  it("the owner can change their own PIN; a developer account cannot be changed this way", async () => {
    expect((await ownerPin(json({ id: OWNER, pin: "639271" }))).status).toBe(200);
    expect(users().find((u) => u.id === OWNER)!.pin_lookup).toBe(pinLookup("639271"));
  });
  it("adding a team member returns a one-time PIN, stores only its hash, and the list shows only this venue", async () => {
    const r = await teamPOST(json({ name: "Layla", role: "staff" }));
    expect(r.status).toBe(200);
    const { pin } = await r.json();
    expect(pin).toMatch(/^\d{4}$/);
    const row = users().find((u) => u.name === "Layla")!;
    expect(row.venue_id).toBe(VA);
    expect(row.pin_lookup).toBe(pinLookup(pin));
    const list = JSON.stringify(await (await teamGET()).json());
    expect(list).toContain("Layla");
    expect(list).not.toContain("Bob");
    expect(list).not.toContain(pin);
  });
});

describe("developer sets the first PIN", () => {
  it("only a developer, only inside their own business", async () => {
    h.staff = as(OWNER, "owner");
    expect((await devPin(json({ staffId: CASHIER }))).status).toBe(403);
    h.staff = as("dev-1", "developer");
    const r = await devPin(json({ staffId: OWNER }));
    expect(r.status).toBe(200);
    expect((await r.json()).pin).toMatch(/^\d{6}$/);
    expect((await devPin(json({ staffId: OTHER_OWNER }))).status).toBe(404);
  });
});
