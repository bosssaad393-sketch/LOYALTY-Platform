import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// Trusted tills (migration 0029) against an in-memory database. Invented data only.

const h = vi.hoisted(() => ({ state: undefined as unknown as FakeState }));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});

import { newState } from "./helpers/fakeDb";
import { TILL_COOKIE, listTills, removeTill, setTillsLocked, staffPinAllowed, tillCookie, tillKeyFrom, trustThisDevice } from "../src/lib/trustedTills";

const VA = "venue-a";
const VB = "venue-b";
const owner = (venueId: string): Staff => ({ id: `owner-${venueId}`, name: "Owner", role: "owner", venueId, venueSlug: "v", venueName: "V" });
const cookie = (key: string) => `other=1; ${TILL_COOKIE}=${key}; loyalty_staff=abc`;

beforeEach(() => {
  h.state = newState({ venues: [{ id: VA, tills_locked: false }, { id: VB, tills_locked: false }], trusted_devices: [], audit_log: [] });
});

describe("trusted tills", () => {
  it("with the rule off, a staff PIN works anywhere", async () => {
    expect(await staffPinAllowed(VA, null)).toBe(true);
    expect(await staffPinAllowed(VA, "loyalty_staff=abc")).toBe(true);
  });

  it("the rule cannot go on while there is no till", async () => {
    expect(await setTillsLocked(owner(VA), true)).toBe("no_tills");
    expect(h.state.tables.venues[0].tills_locked).toBe(false);
  });

  it("with the rule on, only a device the owner added lets a staff PIN in", async () => {
    const key = await trustThisDevice(owner(VA), "Sanad counter iPad");
    expect(await setTillsLocked(owner(VA), true)).toBe("ok");
    expect(await staffPinAllowed(VA, cookie(key))).toBe(true);
    expect(await staffPinAllowed(VA, null)).toBe(false);
    expect(await staffPinAllowed(VA, cookie("x".repeat(43)))).toBe(false);
    // the key itself is never stored, only its hash
    expect(JSON.stringify(h.state.tables)).not.toContain(key);
    expect(h.state.tables.trusted_devices[0].last_seen_at).toBeTruthy();
  });

  it("a till of one venue opens nothing at another", async () => {
    const key = await trustThisDevice(owner(VA), "A till");
    await trustThisDevice(owner(VB), "B till");
    await setTillsLocked(owner(VB), true);
    expect(await staffPinAllowed(VB, cookie(key))).toBe(false);
    expect((await listTills(VB, cookie(key))).map((d) => [d.name, d.thisDevice])).toEqual([["B till", false]]);
    expect((await listTills(VA, cookie(key))).map((d) => [d.name, d.thisDevice])).toEqual([["A till", true]]);
    expect(await removeTill(owner(VB), String(h.state.tables.trusted_devices[0].id))).toBe(false);
  });

  it("a removed till stops working, and removing the last one switches the rule off", async () => {
    const first = await trustThisDevice(owner(VA), "Counter");
    const second = await trustThisDevice(owner(VA), "Terrace");
    await setTillsLocked(owner(VA), true);
    const [a, b] = h.state.tables.trusted_devices;
    expect(await removeTill(owner(VA), String(a.id))).toBe(true);
    expect(await staffPinAllowed(VA, cookie(first))).toBe(false);
    expect(await staffPinAllowed(VA, cookie(second))).toBe(true);
    expect(h.state.tables.venues[0].tills_locked).toBe(true);
    expect(await removeTill(owner(VA), String(b.id))).toBe(true);
    expect(h.state.tables.venues[0].tills_locked).toBe(false);
    expect(await staffPinAllowed(VA, null)).toBe(true);
    expect(h.state.tables.audit_log.map((l) => l.action)).toEqual(["till_added", "till_added", "tills_switch", "till_removed", "till_removed"]);
  });

  it("reads only a well-formed device key, and the cookie is hidden from the page", () => {
    const key = "A".repeat(43);
    expect(tillKeyFrom(cookie(key))).toBe(key);
    expect(tillKeyFrom(`${TILL_COOKIE}=short`)).toBeNull();
    expect(tillKeyFrom(`x${TILL_COOKIE}=${key}`)).toBeNull();
    expect(tillKeyFrom(null)).toBeNull();
    expect(tillCookie(key)).toMatch(/HttpOnly; SameSite=Lax/);
  });
});
