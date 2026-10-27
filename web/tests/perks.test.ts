import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// Staff perks ("shift over, enjoy this"): venue isolation, who may give, who may use, one use only. Invented data.

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
import { GET as ownerGET, POST as ownerPOST, DELETE as ownerDELETE } from "../src/app/api/owner/perks/route";
import { GET as staffGET, POST as staffPOST } from "../src/app/api/staff/perks/route";

const VA = "venue-a";
const VB = "venue-b";
const OWNER_A = "aaaaaaaa-0000-4000-8000-0000000000a1";
const STAFF_A1 = "aaaaaaaa-0000-4000-8000-0000000000a2";
const STAFF_A2 = "aaaaaaaa-0000-4000-8000-0000000000a3";
const STAFF_B = "bbbbbbbb-0000-4000-8000-0000000000b2";
const PERK_B = "bbbbbbbb-0000-4000-8000-0000000000e1";

const who = (id: string, role: Staff["role"], venueId = VA): Staff => ({ id, name: id.slice(-2), role, venueId, venueSlug: "a", venueName: "Venue A" });
const json = (body: unknown, method = "POST") => new Request("http://test.local/api", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const perks = () => h.state.tables.staff_perks;
// The in-memory database numbers new rows simply; the routes require real UUIDs, so give each new row one.
const uuidify = () => perks().forEach((p, i) => { if (!/^[0-9a-f-]{36}$/.test(String(p.id))) p.id = `cccccccc-0000-4000-8000-${String(i + 1).padStart(12, "0")}`; });
const titleOf = (p: Record<string, unknown>) => String(p.title);

beforeEach(() => {
  h.state = newState({
    staff_users: [
      { id: OWNER_A, venue_id: VA, name: "Owner A", role: "owner", active: true },
      { id: STAFF_A1, venue_id: VA, name: "Sara", role: "staff", active: true },
      { id: STAFF_A2, venue_id: VA, name: "Omar", role: "staff", active: false },
      { id: STAFF_B, venue_id: VB, name: "Bob", role: "staff", active: true },
    ],
    staff_perks: [{ id: PERK_B, venue_id: VB, staff_id: STAFF_B, title: "Venue B secret", note: null, valid_until: null, status: "ready", created_at: "2026-10-20T00:00:00Z" }],
    audit_log: [],
  });
  h.staff = who(OWNER_A, "owner");
});

describe("owner gives a reward", () => {
  it("gives it to an active team member of this venue; skips inactive people and other venues' staff", async () => {
    const r = await ownerPOST(json({ staffIds: [STAFF_A1, STAFF_A2, STAFF_B], title: "Free dinner for two", note: "Thank you for the long shift" }));
    expect(r.status).toBe(200);
    expect((await r.json()).given).toBe(1);
    const mine = perks().filter((p) => p.title === "Free dinner for two");
    expect(mine.map((p) => p.staff_id)).toEqual([STAFF_A1]);
    expect(mine[0].venue_id).toBe(VA);
  });
  it("refuses staff, managers, signed-out, past dates and empty titles", async () => {
    h.staff = who(STAFF_A1, "staff");
    expect((await ownerPOST(json({ staffIds: [STAFF_A1], title: "Free dinner" }))).status).toBe(403);
    h.staff = who(STAFF_A1, "manager");
    expect((await ownerPOST(json({ staffIds: [STAFF_A1], title: "Free dinner" }))).status).toBe(403);
    h.staff = null;
    expect((await ownerPOST(json({ staffIds: [STAFF_A1], title: "Free dinner" }))).status).toBe(401);
    h.staff = who(OWNER_A, "owner");
    expect((await ownerPOST(json({ staffIds: [STAFF_A1], title: "x" }))).status).toBe(400);
    expect((await ownerPOST(json({ staffIds: [STAFF_A1], title: "Free dinner", validUntil: "2020-01-01" }))).status).toBe(400);
    expect(perks().length).toBe(1);
  });
  it("the owner list shows only this venue's rewards", async () => {
    await ownerPOST(json({ staffIds: [STAFF_A1], title: "Free dinner" }));
    const text = JSON.stringify(await (await ownerGET()).json());
    expect(text).toContain("Free dinner");
    expect(text).toContain("Sara");
    expect(text).not.toContain("Venue B secret");
  });
  it("can take back an unused reward (control) but not another venue's", async () => {
    await ownerPOST(json({ staffIds: [STAFF_A1], title: "Free dinner" }));
    uuidify();
    const id = perks().find((p) => p.title === "Free dinner")!.id as string;
    expect((await ownerDELETE(json({ id }, "DELETE"))).status).toBe(200);
    expect(perks().find((p) => p.id === id)!.status).toBe("cancelled");
    expect((await ownerDELETE(json({ id: PERK_B }, "DELETE"))).status).toBe(404);
    expect(perks().find((p) => p.id === PERK_B)!.status).toBe("ready");
  });
});

describe("staff sees and uses their own reward", () => {
  beforeEach(async () => {
    await ownerPOST(json({ staffIds: [STAFF_A1], title: "20% off your next visit" }));
    uuidify();
    h.staff = who(STAFF_A1, "staff");
  });
  it("sees only their own ready rewards", async () => {
    const text = JSON.stringify(await (await staffGET()).json());
    expect(text).toContain("20% off");
    expect(text).not.toContain("Venue B secret");
    h.staff = who(STAFF_B, "staff", VB);
    const other = JSON.stringify(await (await staffGET()).json());
    expect(other).not.toContain("20% off");
  });
  it("uses it once; the second try and another person's try are refused", async () => {
    const id = perks().find((p) => titleOf(p).startsWith("20%"))!.id as string;
    h.staff = who(STAFF_B, "staff", VB);
    expect((await staffPOST(json({ id }))).status).toBe(404);
    h.staff = who(STAFF_A1, "staff");
    expect((await staffPOST(json({ id }))).status).toBe(200);
    expect((await staffPOST(json({ id }))).status).toBe(404);
    expect(perks().find((p) => p.id === id)!.status).toBe("claimed");
    expect(JSON.stringify(await (await staffGET()).json())).not.toContain("20% off");
  });
  it("an expired reward is not shown or usable", async () => {
    const p = perks().find((x) => titleOf(x).startsWith("20%"))!;
    p.valid_until = "2020-01-01";
    expect(JSON.stringify(await (await staffGET()).json())).not.toContain("20% off");
    expect((await staffPOST(json({ id: p.id }))).status).toBe(404);
  });
});
