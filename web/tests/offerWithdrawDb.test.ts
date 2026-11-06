import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState, Row } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// Withdrawing an offer, end to end through the request handler, the database code and the Apple pass code,
// with an in-memory stand-in for the database (tests/helpers/fakeDb.ts). Nothing here touches a network, a real
// database, Apple's push service or Google.

const h = vi.hoisted(() => ({
  state: undefined as unknown as FakeState,
  staff: null as Staff | null,
  apple: { configured: true, pushes: [] as string[][], pushThrows: false },
  google: { configured: true, added: 0 },
}));

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});
vi.mock("../src/lib/staffAuth", () => ({ currentStaff: async () => h.staff }));
vi.mock("../src/lib/appleWallet", () => ({ appleWalletConfigured: () => h.apple.configured }));
vi.mock("../src/lib/apns", () => ({
  notifyAppleTokens: async (tokens: string[]) => {
    if (h.apple.pushThrows) throw new Error("apns down");
    h.apple.pushes.push([...tokens].sort());
    return tokens.length;
  },
  notifyAppleDevices: async () => {},
}));
vi.mock("../src/lib/googleWallet", () => ({
  googleWalletConfigured: () => h.google.configured,
  updatePoints: async () => {},
  addOfferMessages: async () => {
    h.google.added++;
    return { sent: 0, notSaved: 0, failed: 0 };
  },
}));

import { newState } from "./helpers/fakeDb";
import { withdrawOfferResponse } from "../src/lib/offersApi";
import { offersOverview, sendOffer } from "../src/lib/offersDb";
import { offerStateForCard, offerStampsByVenue } from "../src/lib/passOffer";

const NOW = Date.parse("2026-10-16T12:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const VENUE = "venue-sample";
const OTHER = "venue-other";
const OFFER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // 5 days old, live
const OFFER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // 1 hour old, live
const OFFER_OLD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // 20 days old
const OFFER_GOOGLE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"; // for Google only
const OFFER_OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"; // another venue's

const staffOf = (role: Staff["role"]): Staff => ({ id: `staff-${role}`, name: role, role, venueId: VENUE, venueSlug: "orbyn", venueName: "Orbyn" });

const offerRow = (id: string, message: string, sentAgo: number, extra: Row = {}): Row => ({
  id,
  venue_id: VENUE,
  message,
  audience: "all",
  sent_at: ago(sentAgo),
  recipients: 2,
  withdrawn_at: null,
  withdrawn_by: null,
  ...extra,
});

function seed(): Record<string, Row[]> {
  return {
    offers: [
      offerRow(OFFER_A, "Double points on Friday", 5 * DAY),
      offerRow(OFFER_B, "50% off everything today", 1 * HOUR),
      offerRow(OFFER_OTHER, "Other venue offer", 2 * HOUR, { venue_id: OTHER }),
    ],
    members: [
      { id: "m1", consent_news: true, deleted_at: null },
      { id: "m2", consent_news: true, deleted_at: null },
      { id: "m3", consent_news: false, deleted_at: null }, // did not agree to offers
      { id: "m4", consent_news: true, deleted_at: "2026-10-01T00:00:00Z" }, // erased guest
      { id: "m5", consent_news: true, deleted_at: null }, // guest of another venue
    ],
    cards: [
      { id: "c1", venue_id: VENUE, member_id: "m1" },
      { id: "c2", venue_id: VENUE, member_id: "m2" },
      { id: "c3", venue_id: VENUE, member_id: "m3" },
      { id: "c4", venue_id: VENUE, member_id: "m4" },
      { id: "c5", venue_id: OTHER, member_id: "m5" },
    ],
    apple_registrations: [
      { device_id: "d1", push_token: "t1", card_id: "c1" },
      { device_id: "d2", push_token: "t2", card_id: "c1" }, // second phone of the same guest
      { device_id: "d3", push_token: "t3", card_id: "c2" },
      { device_id: "d4", push_token: "t4", card_id: "c3" }, // did not agree: no push
      { device_id: "d5", push_token: "t5", card_id: "c4" }, // erased: no push
      { device_id: "d6", push_token: "t6", card_id: "c5" }, // other venue: no push
    ],
    audit_log: [],
  };
}

const rows = (table: string) => h.state.tables[table] ?? [];
const offer = (id: string) => rows("offers").find((r) => r.id === id)!;
const audit = () => rows("audit_log").filter((r) => r.action === "offer_withdrawn");
const offerCalls = () => h.state.calls.filter((c) => c.table === "offers");
const post = async (id: string) => {
  const res = await withdrawOfferResponse(id);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  h.state = newState(seed());
  h.staff = staffOf("owner");
  h.apple = { configured: true, pushes: [], pushThrows: false };
  h.google = { configured: true, added: 0 };
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /api/owner/offers/[id]/withdraw", () => {
  it("withdraws an offer of this venue and answers { ok, withdrawnAt }", async () => {
    const { status, json } = await post(OFFER_B);
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true, withdrawnAt: new Date(NOW).toISOString() });
    expect(Object.keys(json).sort()).toEqual(["ok", "withdrawnAt"]);
    expect(offer(OFFER_B).withdrawn_at).toBe(new Date(NOW).toISOString());
    expect(offer(OFFER_B).withdrawn_by).toBe("staff-owner");
    expect(offer(OFFER_A).withdrawn_at).toBeNull(); // nothing else changed
  });

  it("writes one audit_log row, offer_withdrawn", async () => {
    await post(OFFER_B);
    expect(audit()).toHaveLength(1);
    expect(audit()[0]).toMatchObject({ venue_id: VENUE, actor: "staff-owner", action: "offer_withdrawn", detail: { offer: OFFER_B, audience: "all" } });
  });

  it("wakes the Apple devices of guests who agreed (every phone, none of the others)", async () => {
    await post(OFFER_B);
    expect(h.apple.pushes).toEqual([["t1", "t2", "t3"]]);
  });

  it("does not touch Google: no message is added, and none is claimed to be removed", async () => {
    await post(OFFER_B);
    expect(h.google.added).toBe(0);
  });

  it("answers 404 for an offer of another venue and changes nothing", async () => {
    const { status, json } = await post(OFFER_OTHER);
    expect(status).toBe(404);
    expect(json).toEqual({ error: "That message was not found." });
    expect(offer(OFFER_OTHER).withdrawn_at).toBeNull();
    expect(audit()).toHaveLength(0);
    expect(h.apple.pushes).toHaveLength(0);
  });

  it("answers 404 for an id that is a uuid but no offer", async () => {
    const { status, json } = await post("99999999-9999-4999-8999-999999999999");
    expect(status).toBe(404);
    expect(json).toEqual({ error: "That message was not found." });
  });

  it("answers 409 the second time, with no second audit row and no second push", async () => {
    expect((await post(OFFER_B)).status).toBe(200);
    const firstTime = offer(OFFER_B).withdrawn_at;
    vi.setSystemTime(NOW + 60_000);
    const again = await post(OFFER_B);
    expect(again.status).toBe(409);
    expect(again.json).toEqual({ error: "That message was already withdrawn." });
    expect(offer(OFFER_B).withdrawn_at).toBe(firstTime); // the first withdrawal time is kept
    expect(audit()).toHaveLength(1);
    expect(h.apple.pushes).toHaveLength(1);
  });

  it("two taps at the same moment: one wins (200), the other gets 409", async () => {
    const results = await Promise.all([post(OFFER_B), post(OFFER_B)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(audit()).toHaveLength(1);
    expect(h.apple.pushes).toHaveLength(1);
  });

  it("answers 400 for an id that is not a uuid, before reading the database", async () => {
    for (const bad of ["", "abc", "123", "not-a-uuid", "' or 1=1 --", "bbbbbbbb-bbbb-4bbb-8bbb"]) {
      const { status, json } = await post(bad);
      expect(status).toBe(400);
      expect(typeof json.error).toBe("string");
    }
    expect(offerCalls()).toHaveLength(0);
    expect(offer(OFFER_B).withdrawn_at).toBeNull();
  });

  it("answers 401 when nobody is signed in", async () => {
    h.staff = null;
    expect((await post(OFFER_B)).status).toBe(401);
    expect(offerCalls()).toHaveLength(0);
  });

  it("answers 403 to a manager (and to staff and developers), and changes nothing", async () => {
    for (const role of ["manager", "staff", "developer"] as const) {
      h.staff = staffOf(role);
      const { status, json } = await post(OFFER_B);
      expect(status).toBe(403);
      expect(json).toEqual({ error: "Only the owner can open this." });
    }
    expect(offer(OFFER_B).withdrawn_at).toBeNull();
    expect(offerCalls()).toHaveLength(0);
    expect(audit()).toHaveLength(0);
    expect(h.apple.pushes).toHaveLength(0);
  });

  it("works when Apple Wallet is not set up: the offer is withdrawn, nobody is pushed", async () => {
    h.apple.configured = false;
    expect((await post(OFFER_B)).status).toBe(200);
    expect(offer(OFFER_B).withdrawn_at).not.toBeNull();
    expect(h.apple.pushes).toHaveLength(0);
    expect(h.state.calls.some((c) => c.table === "apple_registrations")).toBe(false);
  });

  it("never fails because the push list cannot be read", async () => {
    h.state.failing.add("apple_registrations");
    const { status } = await post(OFFER_B);
    expect(status).toBe(200);
    expect(offer(OFFER_B).withdrawn_at).not.toBeNull();
  });

  it("never fails because Apple's push service throws", async () => {
    h.apple.pushThrows = true;
    expect((await post(OFFER_B)).status).toBe(200);
    expect(offer(OFFER_B).withdrawn_at).not.toBeNull();
  });

  it("an offer that is past its 14 days is marked withdrawn but nobody is woken (no card shows it)", async () => {
    h.state.tables.offers.push(offerRow(OFFER_OLD, "Old news", 20 * DAY));
    expect((await post(OFFER_OLD)).status).toBe(200);
    expect(offer(OFFER_OLD).withdrawn_at).not.toBeNull();
    expect(h.apple.pushes).toHaveLength(0);
  });

  it("an offer for Google only is marked withdrawn but no Apple device is woken", async () => {
    h.state.tables.offers.push(offerRow(OFFER_GOOGLE, "Android news", 1 * HOUR, { audience: "google" }));
    expect((await post(OFFER_GOOGLE)).status).toBe(200);
    expect(h.apple.pushes).toHaveLength(0);
    expect(h.google.added).toBe(0);
  });

  it("with nobody who agreed to offers there is nothing to wake, and it still succeeds", async () => {
    h.state.tables.members.forEach((m) => (m.consent_news = false));
    expect((await post(OFFER_B)).status).toBe(200);
    expect(h.apple.pushes).toHaveLength(0);
  });
});

describe("the card after a withdrawal (Apple pass data)", () => {
  it("shows the newest live offer, with the alert", async () => {
    expect(await offerStateForCard("c1", VENUE, NOW)).toEqual({ message: "50% off everything today", alert: true });
  });

  it("after withdrawing the newest, the previous live offer shows again, without an alert", async () => {
    await post(OFFER_B);
    expect(await offerStateForCard("c1", VENUE, NOW)).toEqual({ message: "Double points on Friday", alert: false });
  });

  it("when nothing live is left the card says 'No offer right now.' (message null, no alert)", async () => {
    await post(OFFER_B);
    await post(OFFER_A);
    expect(await offerStateForCard("c1", VENUE, NOW)).toEqual({ message: null, alert: false });
  });

  it("the previous offer is not brought back when it is past the 14 days", async () => {
    offer(OFFER_A).sent_at = ago(15 * DAY);
    await post(OFFER_B);
    expect(await offerStateForCard("c1", VENUE, NOW)).toEqual({ message: null, alert: false });
  });

  it("a guest who did not agree to offers, or was erased, still gets no offer field at all", async () => {
    await post(OFFER_B);
    expect(await offerStateForCard("c3", VENUE, NOW)).toBeNull();
    expect(await offerStateForCard("c4", VENUE, NOW)).toBeNull();
  });

  it("offers of another venue never show", async () => {
    h.state.tables.offers = [offerRow(OFFER_OTHER, "Other venue offer", 2 * HOUR, { venue_id: OTHER })];
    expect(await offerStateForCard("c1", VENUE, NOW)).toEqual({ message: null, alert: false });
  });

  it("edit and resend: send the corrected text first, then withdraw the original; the card keeps an offer and alerts", async () => {
    h.apple.configured = false; // sending needs no wallet for this check
    h.google.configured = false;
    await sendOffer(staffOf("owner"), { message: "50% off all drinks today", audience: "all" });
    await post(OFFER_B);
    expect(await offerStateForCard("c1", VENUE, NOW)).toEqual({ message: "50% off all drinks today", alert: true });
  });

  it("is best effort: if the lookup fails the pass is simply built without the field", async () => {
    h.state.failing.add("offers");
    expect(await offerStateForCard("c1", VENUE, NOW)).toBeNull();
  });
});

describe("when Apple should fetch the card again (stamps)", () => {
  it("is the send time of the newest live offer", async () => {
    const stamps = await offerStampsByVenue([VENUE, OTHER, "venue-empty"], NOW);
    expect(stamps.get(VENUE)).toBe(NOW - 1 * HOUR);
    expect(stamps.get(OTHER)).toBe(NOW - 2 * HOUR);
    expect(stamps.has("venue-empty")).toBe(false); // no offers: left out
  });

  it("a withdrawal moves it forward past a check made before the withdrawal, even though the card now shows an OLDER offer", async () => {
    const checkedAt = NOW + 5 * 60_000; // the device last asked 5 minutes from now
    vi.setSystemTime(checkedAt + 60_000);
    await post(OFFER_B); // withdrawn at checkedAt + 1 minute
    const stamps = await offerStampsByVenue([VENUE], checkedAt + 120_000);
    expect(stamps.get(VENUE)).toBe(checkedAt + 60_000);
    expect(stamps.get(VENUE)!).toBeGreaterThan(checkedAt);
  });

  it("never goes backwards when the newest offer is withdrawn", async () => {
    const before = (await offerStampsByVenue([VENUE], NOW)).get(VENUE)!;
    await post(OFFER_B);
    const after = (await offerStampsByVenue([VENUE], NOW)).get(VENUE)!;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it("a withdrawn offer for Google only does not move the Apple stamp", async () => {
    h.state.tables.offers.push(offerRow(OFFER_GOOGLE, "Android news", 10 * 60_000, { audience: "google" }));
    const before = (await offerStampsByVenue([VENUE], NOW)).get(VENUE);
    await post(OFFER_GOOGLE);
    expect((await offerStampsByVenue([VENUE], NOW)).get(VENUE)).toBe(before);
  });
});

describe("GET /api/owner/offers", () => {
  it("lists newest first, withdrawn ones stay as history with their withdrawal time, live ones have null", async () => {
    await post(OFFER_B);
    const view = await offersOverview(VENUE);
    expect(view.offers.map((o) => o.id)).toEqual([OFFER_B, OFFER_A]);
    expect(view.offers[0]).toEqual({
      id: OFFER_B,
      message: "50% off everything today",
      audience: "all",
      sentAt: ago(1 * HOUR),
      recipients: 2,
      withdrawnAt: new Date(NOW).toISOString(),
    });
    expect(view.offers[1].withdrawnAt).toBeNull();
    for (const o of view.offers) expect(Object.keys(o).sort()).toEqual(["audience", "id", "message", "recipients", "sentAt", "withdrawnAt"]);
  });

  it("eligible and total are unchanged by a withdrawal", async () => {
    const before = await offersOverview(VENUE);
    await post(OFFER_B);
    const after = await offersOverview(VENUE);
    expect({ eligible: after.eligible, total: after.total }).toEqual({ eligible: before.eligible, total: before.total });
    expect({ eligible: after.eligible, total: after.total }).toEqual({ eligible: 2, total: 3 });
  });

  it("does not list another venue's offers", async () => {
    expect((await offersOverview(VENUE)).offers.some((o) => o.id === OFFER_OTHER)).toBe(false);
  });
});

describe("sending after a withdrawal", () => {
  const send = (message: string) => sendOffer(staffOf("owner"), { message, audience: "all" });
  beforeEach(() => {
    h.apple.configured = false;
    h.google.configured = false;
  });

  it("sending the text of an offer that was just withdrawn is a new send, not a double tap", async () => {
    await post(OFFER_B);
    vi.setSystemTime(NOW + 10_000);
    const before = rows("offers").length;
    const sent = await send("50% off everything today");
    expect(sent.id).not.toBe(OFFER_B);
    expect(rows("offers")).toHaveLength(before + 1);
  });

  it("control: the same text while the first copy is still live is still treated as a double tap", async () => {
    const first = await send("Brand new text");
    const before = rows("offers").length;
    const again = await send("Brand new text");
    expect(again.id).toBe(first.id);
    expect(rows("offers")).toHaveLength(before);
  });
});
