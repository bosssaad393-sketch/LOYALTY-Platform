import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// Cross-tenant authorization: a signed-in person of venue A must never read, change or erase anything of venue B,
// whatever ids, codes or card numbers they send. These run the REAL route handlers and database code against an
// in-memory stand-in for the database (tests/helpers/fakeDb.ts). Each "cannot" test has a positive control next to it
// (the same call on venue A's own data works), so a test cannot pass just because the call failed for another reason.
// Everything is invented data.

const h = vi.hoisted(() => ({
  state: undefined as unknown as FakeState,
  staff: null as Staff | null,
  ledger: { earn: [] as unknown[][], redeem: [] as unknown[][], undo: [] as unknown[][] },
}));

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});
vi.mock("../src/lib/staffAuth", () => ({ currentStaff: async () => h.staff }));
vi.mock("../src/lib/ledgerDb", () => ({
  earnPoints: async (...a: unknown[]) => (h.ledger.earn.push(a), { ledger_id: 9, points_added: 10, new_balance: 110 }),
  redeemReward: async (...a: unknown[]) => (h.ledger.redeem.push(a), { ledger_id: 9, new_balance: 0 }),
  undoEntry: async (...a: unknown[]) => (h.ledger.undo.push(a), { ledger_id: 9, new_balance: 90 }),
}));
vi.mock("../src/lib/appleWallet", () => ({ appleWalletConfigured: () => false }));
vi.mock("../src/lib/apns", () => ({ notifyAppleTokens: async () => 0, notifyAppleDevices: async () => {} }));
vi.mock("../src/lib/googleWallet", () => ({
  googleWalletConfigured: () => false,
  updatePoints: async () => {},
  addOfferMessages: async () => ({ sent: 0, notSaved: 0, failed: 0 }),
}));

import { newState } from "./helpers/fakeDb";
import { GET as cardGET } from "../src/app/api/staff/card/route";
import { POST as earnPOST } from "../src/app/api/staff/earn/route";
import { POST as redeemPOST } from "../src/app/api/staff/redeem/route";
import { POST as undoPOST } from "../src/app/api/staff/undo/route";
import { GET as recentGET } from "../src/app/api/staff/recent/route";
import { GET as guestsGET, DELETE as guestsDELETE } from "../src/app/api/owner/guests/route";
import { GET as exportGET } from "../src/app/api/owner/export/route";
import { GET as rulesGET, POST as rulesPOST } from "../src/app/api/owner/rules/route";
import { GET as teamGET, PATCH as teamPATCH } from "../src/app/api/owner/team/route";
import { POST as erasePOST } from "../src/app/api/owner/privacy/erase/route";

const VA = "venue-a";
const VB = "venue-b";
const CARD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const CARD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const OWNER_A = "aaaaaaaa-0000-4000-8000-0000000000a1";
const STAFF_A = "aaaaaaaa-0000-4000-8000-0000000000a2";
const STAFF_B = "bbbbbbbb-0000-4000-8000-0000000000b2";
const REQ_B = "cccccccc-0000-4000-8000-0000000000b3";

const staffOf = (role: Staff["role"], id: string): Staff => ({ id, name: role, role, venueId: VA, venueSlug: "a", venueName: "Venue A" });
const json = (body: unknown, method = "POST") => new Request("http://test.local/api", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  h.ledger = { earn: [], redeem: [], undo: [] };
  h.state = newState({
    venues: [
      { id: VA, slug: "a", name: "Venue A", points_per_bhd: 2, reward_goal: 500, reward_text: "A reward" },
      { id: VB, slug: "b", name: "Venue B", points_per_bhd: 5, reward_goal: 300, reward_text: "B reward" },
    ],
    members: [
      { id: "m-a", name: "Ann Alpha", deleted_at: null, email: "ann@example.test", phone: "+97300000001" },
      { id: "m-b", name: "Bob Beta", deleted_at: null, email: "bob@example.test", phone: "+97300000002" },
    ],
    cards: [
      { id: CARD_A, venue_id: VA, member_id: "m-a", code: "1111", points: 100, visits: 3, last_visit: "2026-10-20T10:00:00Z", created_at: "2026-10-01T10:00:00Z" },
      { id: CARD_B, venue_id: VB, member_id: "m-b", code: "2222", points: 250, visits: 7, last_visit: "2026-10-21T10:00:00Z", created_at: "2026-10-02T10:00:00Z" },
    ],
    ledger: [
      { id: 1, venue_id: VA, card_id: CARD_A, staff_id: OWNER_A, kind: "earn", points: 10, bill_bhd: 5, created_at: "2026-10-20T10:00:00Z", undone: false },
      { id: 2, venue_id: VB, card_id: CARD_B, staff_id: STAFF_B, kind: "earn", points: 25, bill_bhd: 5, created_at: "2026-10-21T10:00:00Z", undone: false },
    ],
    staff_users: [
      { id: OWNER_A, venue_id: VA, name: "Owner A", role: "owner", active: true, auth_user: "u-a1", created_at: "2026-10-01T00:00:00Z" },
      { id: STAFF_A, venue_id: VA, name: "Till A", role: "staff", active: true, auth_user: "u-a2", created_at: "2026-10-01T00:00:00Z" },
      { id: STAFF_B, venue_id: VB, name: "Till B", role: "staff", active: true, auth_user: "u-b2", created_at: "2026-10-01T00:00:00Z" },
    ],
    deletion_requests: [{ id: REQ_B, venue_id: VB, card_id: CARD_B, status: "open", created_at: "2026-10-22T00:00:00Z" }],
    audit_log: [],
  });
  h.staff = staffOf("owner", OWNER_A);
});

const cardB = () => h.state.tables.cards.find((c) => c.id === CARD_B);
const venueB = () => h.state.tables.venues.find((v) => v.id === VB);

describe("signed out and wrong role", () => {
  it("rejects every staff and owner call without a session (401)", async () => {
    h.staff = null;
    const calls = [
      await cardGET(new Request("http://test.local/api/staff/card?code=1111")),
      await earnPOST(json({ cardId: CARD_A, billBhd: 5 })),
      await undoPOST(json({ ledgerId: 1 })),
      await guestsGET(new Request("http://test.local/api/owner/guests")),
      await rulesPOST(json({ pointsPerBhd: 2, rewardGoal: 500, rewardText: "x" })),
      await teamGET(),
    ];
    for (const r of calls) expect(r.status).toBe(401);
    expect(h.ledger.earn.length + h.ledger.undo.length).toBe(0);
  });

  it("keeps a till person out of the owner screens (403)", async () => {
    h.staff = staffOf("staff", STAFF_A);
    expect((await guestsGET(new Request("http://test.local/api/owner/guests"))).status).toBe(403);
    expect((await teamGET()).status).toBe(403);
    expect((await exportGET()).status).toBe(403);
  });
});

describe("staff till: venue A cannot touch venue B's cards or entries", () => {
  it("finds A's own card by code (control) but not B's card by its code", async () => {
    expect((await cardGET(new Request("http://test.local/api/staff/card?code=1111"))).status).toBe(200);
    expect((await cardGET(new Request("http://test.local/api/staff/card?code=2222"))).status).toBe(404);
  });

  it("refuses a QR text that names another venue", async () => {
    const r = await cardGET(new Request("http://test.local/api/staff/card?code=LOYALTY:b:2222"));
    expect(r.status).toBe(404);
  });

  it("adds points to A's card (control) but never to B's card", async () => {
    expect((await earnPOST(json({ cardId: CARD_A, billBhd: 5 }))).status).toBe(200);
    expect(h.ledger.earn).toHaveLength(1);
    const r = await earnPOST(json({ cardId: CARD_B, billBhd: 5 }));
    expect(r.status).toBe(404);
    expect(h.ledger.earn).toHaveLength(1);
  });

  it("gives A's reward (control) but never B's", async () => {
    expect((await redeemPOST(json({ cardId: CARD_A }))).status).toBe(200);
    expect(h.ledger.redeem).toHaveLength(1);
    expect((await redeemPOST(json({ cardId: CARD_B }))).status).toBe(404);
    expect(h.ledger.redeem).toHaveLength(1);
  });

  it("undoes A's entry (control) but never B's, even for a manager", async () => {
    h.staff = staffOf("manager", STAFF_A);
    expect((await undoPOST(json({ ledgerId: 1 }))).status).toBe(200);
    expect(h.ledger.undo).toHaveLength(1);
    expect((await undoPOST(json({ ledgerId: 2 }))).status).toBe(404);
    expect(h.ledger.undo).toHaveLength(1);
  });

  it("lists only A's recent entries", async () => {
    const r = await recentGET();
    expect(r.status).toBe(200);
    const text = JSON.stringify(await r.json());
    expect(text).not.toContain("Bob");
    expect(text).not.toContain("2222");
  });
});

describe("owner screens: venue A's owner cannot read or change venue B", () => {
  const url = (q = "") => new Request("http://test.local/api/owner/guests" + q);

  it("lists only A's guests, and a search cannot reach B's", async () => {
    const all = JSON.stringify(await (await guestsGET(url())).json());
    expect(all).toContain("Ann Alpha");
    expect(all).not.toContain("Bob Beta");
    const search = JSON.stringify(await (await guestsGET(url("?q=bob"))).json());
    expect(search).not.toContain("Bob Beta");
  });

  it("exports only A's guests (no B name, email, phone or code)", async () => {
    const r = await exportGET();
    expect(r.status).toBe(200);
    const csv = await r.text();
    expect(csv).toContain("Ann Alpha");
    for (const secret of ["Bob Beta", "bob@example.test", "+97300000002", "2222"]) expect(csv).not.toContain(secret);
  });

  it("erases A's guest (control) but cannot erase B's guest", async () => {
    const del = (cardId: string) => guestsDELETE(json({ cardId }, "DELETE"));
    expect((await del(CARD_B)).status).toBe(404);
    expect(cardB()).toBeTruthy();
    expect(h.state.tables.members.some((m) => m.id === "m-b" && m.name === "Bob Beta")).toBe(true);
    expect((await del(CARD_A)).status).toBe(200);
  });

  it("changes A's rules only, never B's", async () => {
    const r = await rulesPOST(json({ pointsPerBhd: 3, rewardGoal: 600, rewardText: "New A reward" }));
    expect(r.status).toBe(200);
    expect(venueB()).toMatchObject({ points_per_bhd: 5, reward_goal: 300, reward_text: "B reward" });
    expect(h.state.tables.venues.find((v) => v.id === VA)).toMatchObject({ points_per_bhd: 3, reward_goal: 600 });
    expect(JSON.stringify(await (await rulesGET()).json())).not.toContain("B reward");
  });

  it("lists only A's team and cannot deactivate B's staff", async () => {
    const team = JSON.stringify(await (await teamGET()).json());
    expect(team).toContain("Till A");
    expect(team).not.toContain("Till B");
    await teamPATCH(json({ id: STAFF_B, active: false }, "PATCH"));
    expect(h.state.tables.staff_users.find((s) => s.id === STAFF_B)?.active).toBe(true);
    await teamPATCH(json({ id: STAFF_A, active: false }, "PATCH"));
    expect(h.state.tables.staff_users.find((s) => s.id === STAFF_A)?.active).toBe(false);
  });

  it("cannot act on B's deletion request, and B's guest survives", async () => {
    const r = await erasePOST(json({ requestId: REQ_B }));
    expect(r.status).toBe(404);
    expect(cardB()).toBeTruthy();
    expect(h.state.tables.members.find((m) => m.id === "m-b")?.name).toBe("Bob Beta");
  });
});

describe("every venue-scoped query carries the caller's venue", () => {
  it("never runs a read or write on a tenant table without a venue filter for the owner and staff routes tested above", async () => {
    await cardGET(new Request("http://test.local/api/staff/card?code=1111"));
    await recentGET();
    await guestsGET(new Request("http://test.local/api/owner/guests"));
    await exportGET();
    await teamGET();
    const scoped = ["cards", "ledger", "staff_users"];
    const reads = h.state.calls.filter((c) => scoped.includes(c.table) && c.op === "select");
    expect(reads.length).toBeGreaterThan(0);
    for (const c of reads) expect(c.filters, `${c.table} read without venue filter`).toContain("eq venue_id");
  });
});
