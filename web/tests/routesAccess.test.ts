import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// Access and venue scoping for the owner chat and the developer routes. Real route handlers against the in-memory database.
// Each "cannot" has a positive control next to it. Invented data only.

const h = vi.hoisted(() => ({ state: undefined as unknown as FakeState, staff: null as Staff | null }));

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});
vi.mock("../src/lib/staffAuth", () => ({ currentStaff: async () => h.staff }));
vi.mock("../src/lib/ledgerDb", () => ({ adjustPoints: async () => ({}), posSale: async () => ({}), posRefund: async () => ({}) }));
vi.mock("../src/lib/appleWallet", () => ({ appleWalletConfigured: () => false }));
vi.mock("../src/lib/apns", () => ({ notifyAppleTokens: async () => 0, notifyAppleDevices: async () => {} }));
vi.mock("../src/lib/googleWallet", () => ({
  googleWalletConfigured: () => false,
  updatePoints: async () => {},
  addOfferMessages: async () => ({ sent: 0, notSaved: 0, failed: 0 }),
}));

import { newState } from "./helpers/fakeDb";
import { GET as asstGET, POST as asstPOST } from "../src/app/api/owner/assistant/route";
import { GET as reqGET, PATCH as reqPATCH } from "../src/app/api/dev/requests/route";
import { GET as posGET } from "../src/app/api/dev/pos/route";

const VA = "venue-a";
const VB = "venue-b";
const REQ_A = "aaaaaaaa-0000-4000-8000-0000000000c1";
const REQ_B = "bbbbbbbb-0000-4000-8000-0000000000c2";

const as = (role: Staff["role"]): Staff => ({ id: "11111111-1111-4111-8111-111111111111", name: role, role, venueId: VA, venueSlug: "a", venueName: "Venue A" });
const json = (body: unknown, method = "POST") => new Request("http://test.local/api", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  h.state = newState({
    venues: [
      { id: VA, slug: "a", name: "Venue A", points_per_bhd: 2, reward_goal: 500, reward_text: "A reward" },
      { id: VB, slug: "b", name: "Venue B", points_per_bhd: 5, reward_goal: 300, reward_text: "B reward" },
    ],
    assistant_requests: [
      { id: REQ_A, venue_id: VA, message: "connect my website", why: "unsupported", status: "open", result: null, created_at: "2026-10-26T10:00:00Z" },
      { id: REQ_B, venue_id: VB, message: "secret of venue B", why: "unsupported", status: "open", result: null, created_at: "2026-10-26T11:00:00Z" },
    ],
    assistant_pending: [],
    pos_connections: [],
    pos_events: [],
    audit_log: [],
  });
  h.staff = as("owner");
});

describe("owner chat access", () => {
  it("401 signed out, 403 for a till person", async () => {
    h.staff = null;
    expect((await asstPOST(json({ message: "hello" }))).status).toBe(401);
    h.staff = as("staff");
    expect((await asstPOST(json({ message: "hello" }))).status).toBe(403);
  });

  it("owner answered (control) and a request for something unsupported is forwarded, never an error", async () => {
    const r = await asstPOST(json({ message: "please redesign my logo" }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.forwarded).toBe(true);
    expect(body.reply).toMatch(/development team/i);
    expect(body.reply).not.toMatch(/error|permission/i);
  });

  it("lists only this venue's requests", async () => {
    const body = await (await asstGET()).json();
    const text = JSON.stringify(body);
    expect(text).toContain("connect my website");
    expect(text).not.toContain("secret of venue B");
  });
});

describe("developer routes", () => {
  it("refuse signed out (401) and owner/manager/staff (403)", async () => {
    h.staff = null;
    expect((await reqGET()).status).toBe(401);
    expect((await posGET()).status).toBe(401);
    for (const role of ["owner", "manager", "staff"] as const) {
      h.staff = as(role);
      expect((await reqGET()).status).toBe(403);
      expect((await posGET()).status).toBe(403);
    }
  });

  it("developer sees own venue's requests only", async () => {
    h.staff = as("developer");
    const r = await reqGET();
    expect(r.status).toBe(200);
    const text = JSON.stringify(await r.json());
    expect(text).toContain("connect my website");
    expect(text).not.toContain("secret of venue B");
  });

  it("developer can update own request (control) but not another venue's", async () => {
    h.staff = as("developer");
    expect((await reqPATCH(json({ id: REQ_A, status: "done", result: "done" }, "PATCH"))).status).toBe(200);
    expect(h.state.tables.assistant_requests.find((x) => x.id === REQ_A)?.status).toBe("done");
    expect((await reqPATCH(json({ id: REQ_B, status: "done" }, "PATCH"))).status).toBe(404);
    expect(h.state.tables.assistant_requests.find((x) => x.id === REQ_B)?.status).toBe("open");
  });
});
