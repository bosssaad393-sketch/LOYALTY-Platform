import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// The developer's chat with CALABOS: who may write, venue isolation, and the bridge token. Invented data.

const h = vi.hoisted(() => ({ state: undefined as unknown as FakeState, staff: null as Staff | null }));

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});
vi.mock("../src/lib/staffAuth", () => ({ currentStaff: async () => h.staff }));

const TOKEN = "t".repeat(40);
process.env.CALABOS_BRIDGE_TOKEN = TOKEN;
process.env.BRAND_DEFAULT_VENUE = "a";

import { newState } from "./helpers/fakeDb";
import { GET as chatGET, POST as chatPOST } from "../src/app/api/dev/calabos/route";
import { GET as inboxGET } from "../src/app/api/calabos/inbox/route";
import { POST as replyPOST } from "../src/app/api/calabos/reply/route";

const VA = "venue-a";
const VB = "venue-b";
const MSG_A = "aaaaaaaa-0000-4000-8000-0000000000f1";
const MSG_B = "bbbbbbbb-0000-4000-8000-0000000000f2";
const as = (role: Staff["role"]): Staff => ({ id: "11111111-1111-4111-8111-111111111111", name: role, role, venueId: VA, venueSlug: "a", venueName: "Venue A" });
const json = (body: unknown, token?: string) => new Request("http://t/api", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const bridge = (token?: string) => new Request("http://t/api", { headers: token ? { authorization: `Bearer ${token}` } : {} });

beforeEach(() => {
  h.state = newState({
    venues: [{ id: VA, slug: "a", name: "Venue A" }, { id: VB, slug: "b", name: "Venue B" }],
    dev_messages: [
      { id: MSG_A, venue_id: VA, author: "dev", body: "check the till link", status: "new", reply_to: null, created_at: "2026-10-30T10:00:00Z" },
      { id: MSG_B, venue_id: VB, author: "dev", body: "venue B secret", status: "new", reply_to: null, created_at: "2026-10-30T10:01:00Z" },
    ],
    audit_log: [],
  });
  h.staff = as("developer");
});

describe("developer chat", () => {
  it("only a developer can read or write; signed out 401, owner 403", async () => {
    h.staff = null;
    expect((await chatGET()).status).toBe(401);
    for (const role of ["owner", "manager", "staff"] as const) {
      h.staff = as(role);
      expect((await chatGET()).status).toBe(403);
      expect((await chatPOST(json({ message: "hi" }))).status).toBe(403);
    }
  });
  it("a developer sees this venue's messages only and can add one", async () => {
    const text = JSON.stringify(await (await chatGET()).json());
    expect(text).toContain("check the till link");
    expect(text).not.toContain("venue B secret");
    expect((await chatPOST(json({ message: "prepare an Eid card" }))).status).toBe(200);
    const row = h.state.tables.dev_messages.find((m) => m.body === "prepare an Eid card")!;
    expect(row).toMatchObject({ venue_id: VA, author: "dev", status: "new" });
  });
  it("refuses an empty or oversized message and a flood of unanswered ones", async () => {
    expect((await chatPOST(json({ message: "   " }))).status).toBe(400);
    expect((await chatPOST(json({ message: "x".repeat(2001) }))).status).toBe(400);
    for (let i = 0; i < 25; i++) h.state.tables.dev_messages.push({ id: `m${i}`, venue_id: VA, author: "dev", body: "x", status: "new", created_at: "2026-10-30T11:00:00Z" });
    expect((await chatPOST(json({ message: "one more" }))).status).toBe(429);
  });
});

describe("bridge for CALABOS", () => {
  it("is off or refuses without the right token", async () => {
    expect((await inboxGET(bridge())).status).toBe(401);
    expect((await inboxGET(bridge("wrong".repeat(10)))).status).toBe(401);
    expect((await replyPOST(json({ replyTo: MSG_A, body: "ok" }))).status).toBe(401);
    const saved = process.env.CALABOS_BRIDGE_TOKEN;
    delete process.env.CALABOS_BRIDGE_TOKEN;
    expect((await inboxGET(bridge(TOKEN))).status).toBe(404);
    process.env.CALABOS_BRIDGE_TOKEN = saved;
  });
  it("gives only new developer messages of its own venue, and a reply marks one done", async () => {
    const r = await inboxGET(bridge(TOKEN));
    expect(r.status).toBe(200);
    const text = JSON.stringify(await r.json());
    expect(text).toContain("check the till link");
    expect(text).not.toContain("venue B secret");
    expect((await replyPOST(json({ replyTo: MSG_A, body: "Noted, queued." }, TOKEN))).status).toBe(200);
    const rows = h.state.tables.dev_messages;
    expect(rows.find((m) => m.id === MSG_A)!.status).toBe("done");
    expect(rows.some((m) => m.author === "calabos" && m.reply_to === MSG_A && m.venue_id === VA)).toBe(true);
    expect(JSON.stringify(await (await inboxGET(bridge(TOKEN))).json())).not.toContain("check the till link");
  });
  it("cannot answer another venue's message or invent one", async () => {
    expect((await replyPOST(json({ replyTo: MSG_B, body: "nope" }, TOKEN))).status).toBe(404);
    expect(h.state.tables.dev_messages.find((m) => m.id === MSG_B)!.status).toBe("new");
    expect((await replyPOST(json({ replyTo: "cccccccc-0000-4000-8000-000000000009", body: "nope" }, TOKEN))).status).toBe(404);
    expect((await replyPOST(json({ replyTo: "not-a-uuid", body: "x" }, TOKEN))).status).toBe(400);
  });
});
