import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";

// The team join link: real staffAuth and PIN code against the in-memory database. Invented data.

const h = vi.hoisted(() => ({ state: undefined as unknown as FakeState, jar: {} as Record<string, string> }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (h.jar[n] ? { value: h.jar[n] } : undefined) }) }));
vi.mock("next/server", async (actual) => ({ ...(await actual<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});

process.env.STAFF_SESSION_SECRET = "test-secret-not-real";

import { newState } from "./helpers/fakeDb";
import { COOKIE_NAMES, makeSessionValue } from "../src/lib/staffAuth";
import { INVITE_DAYS, MAX_WAITING, makeInvite, readInvite } from "../src/lib/teamInvite";
import { GET as invite } from "../src/app/api/owner/team/invite/route";
import { POST as join } from "../src/app/api/staff/join/route";
import { DELETE as decline, GET as teamGET, PATCH as teamPATCH } from "../src/app/api/owner/team/route";
import { POST as pinLogin } from "../src/app/api/staff/pin-login/route";
import { pinLookup } from "../src/lib/pin";

const VA = "venue-a";
const VB = "venue-b";
const OWNER = "aaaaaaaa-0000-4000-8000-0000000000a1";
const GONE = "aaaaaaaa-0000-4000-8000-0000000000a2";
const OTHER_OWNER = "bbbbbbbb-0000-4000-8000-0000000000b1";

const req = (method: string, body: unknown) => new Request("http://t/api", { method, headers: { "content-type": "application/json", "x-forwarded-for": "1.1.1.1" }, body: JSON.stringify(body) });
const signInAs = (id: string) => { h.jar[COOKIE_NAMES.owner] = makeSessionValue(id, "owner").value; };
// The in-memory database makes ids like "row-3", and the real one makes UUIDs, which the routes check for.
let nextUuid = 0;
const joinAs = async (name: string, venue = VA) => {
  const r = await join(req("POST", { token: makeInvite(venue).token, name }));
  const row = h.state.tables.staff_users.find((u) => u.name === name);
  if (row && r.status === 200) {
    const uuid = `cccccccc-0000-4000-8000-${String(++nextUuid).padStart(12, "0")}`;
    for (const e of h.state.tables.audit_log) if ((e.detail as { staff?: string }).staff === row.id) (e.detail as { staff?: string }).staff = uuid;
    row.id = uuid;
  }
  return r;
};
const staffRow = (name: string) => h.state.tables.staff_users.find((u) => u.name === name)!;
const teamRow = async (name: string) => ((await (await teamGET()).json()).team as { name: string; waiting: boolean; active: boolean }[]).find((m) => m.name === name);
const login = (pin: string) => pinLogin(req("POST", { pin, area: "staff" }));

beforeEach(() => {
  h.jar = {};
  h.state = newState({
    venues: [{ id: VA, slug: "a", name: "Venue A" }, { id: VB, slug: "b", name: "Venue B" }],
    staff_users: [
      { id: OWNER, venue_id: VA, name: "Owner", role: "owner", active: true, pin_lookup: pinLookup("482915") },
      { id: GONE, venue_id: VA, name: "Left", role: "staff", active: false, pin_lookup: pinLookup("7391") },
      { id: OTHER_OWNER, venue_id: VB, name: "Other owner", role: "owner", active: true, pin_lookup: pinLookup("917304") },
    ],
    pin_attempts: [],
    audit_log: [{ id: 1, venue_id: VA, actor: OWNER, action: "staff_deactivated", detail: { staff: GONE } }],
  });
  signInAs(OWNER);
});

describe("the link itself", () => {
  it("reads back to its venue, and refuses an altered, swapped or out of date link", () => {
    const now = Date.now();
    const { token } = makeInvite(VA, now);
    expect(readInvite(token, now)).toBe(VA);
    expect(readInvite(token, now + (INVITE_DAYS + 1) * 86_400_000)).toBeNull();
    expect(readInvite(token.replace(VA, VB), now)).toBeNull();
    expect(readInvite(`${token}x`, now)).toBeNull();
    expect(readInvite("garbage", now)).toBeNull();
  });
  it("is made only for a signed-in owner", async () => {
    expect((await invite()).status).toBe(200);
    h.jar = {};
    expect((await invite()).status).toBe(401);
  });
});

describe("joining", () => {
  it("waits for approval: the PIN does not work until the owner approves", async () => {
    const r = await joinAs("Afraaz");
    expect(r.status).toBe(200);
    const { pin } = await r.json();
    expect(pin).toMatch(/^\d{4}$/);
    expect(staffRow("Afraaz")).toMatchObject({ venue_id: VA, role: "staff", active: false });
    expect((await login(pin)).status).toBe(401);
    expect(await teamRow("Afraaz")).toMatchObject({ waiting: true, active: false });

    expect((await teamPATCH(req("PATCH", { id: staffRow("Afraaz").id, active: true }))).status).toBe(200);
    expect(await teamRow("Afraaz")).toMatchObject({ waiting: false, active: true });
    expect((await login(pin)).status).toBe(200);
  });
  it("cannot choose a role or a PIN, and a bad link adds nobody", async () => {
    const before = h.state.tables.staff_users.length;
    const r = await join(req("POST", { token: "aaaaaaaaaaaa.1.x", name: "Mallory" }));
    expect(r.status).toBe(410);
    expect(h.state.tables.staff_users.length).toBe(before);
    await join(req("POST", { token: makeInvite(VA).token, name: "Mallory", role: "owner", pin: "1234" }));
    expect(staffRow("Mallory").role).toBe("staff");
    expect(staffRow("Mallory").pin_lookup).not.toBe(pinLookup("1234"));
  });
  it("stops once too many people are waiting", async () => {
    for (let i = 0; i < MAX_WAITING; i++) expect((await joinAs(`Person ${i}`)).status).toBe(200);
    expect((await joinAs("One more")).status).toBe(429);
  });
  it("a deactivated person is not shown as waiting, and goes back to deactivated after approval then removal", async () => {
    expect(await teamRow("Left")).toMatchObject({ waiting: false, active: false });
    await joinAs("Afraaz");
    const id = staffRow("Afraaz").id as string;
    await teamPATCH(req("PATCH", { id, active: true }));
    await teamPATCH(req("PATCH", { id, active: false }));
    expect(await teamRow("Afraaz")).toMatchObject({ waiting: false, active: false });
  });
});

describe("turning someone down", () => {
  it("removes a person who is waiting", async () => {
    await joinAs("Afraaz");
    expect((await decline(req("DELETE", { id: staffRow("Afraaz").id }))).status).toBe(200);
    expect(h.state.tables.staff_users.some((u) => u.name === "Afraaz")).toBe(false);
  });
  it("refuses anyone not waiting, and anyone from another business", async () => {
    expect((await decline(req("DELETE", { id: GONE }))).status).toBe(404);
    expect((await decline(req("DELETE", { id: OWNER }))).status).toBe(404);
    await joinAs("Bob", VB);
    expect((await decline(req("DELETE", { id: staffRow("Bob").id }))).status).toBe(404);
    expect(staffRow("Bob")).toBeTruthy();
  });
});
