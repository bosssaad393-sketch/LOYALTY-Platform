import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// The guest Wi-Fi: the owner sets it, the public guest page reads it (CORS open, read only), empty name = no button.

const h = vi.hoisted(() => ({ state: undefined as unknown as FakeState, staff: null as Staff | null }));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/staffAuth", () => ({ currentStaff: async () => h.staff }));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});

import { newState } from "./helpers/fakeDb";
import { GET, POST } from "../src/app/api/owner/wifi/route";
import { GET as guestGET } from "../src/app/api/venue/[slug]/guest/route";

const VA = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const post = (body: unknown) => POST(new Request("http://t/api/owner/wifi", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const guest = (slug: string) => guestGET(new Request(`http://t/api/venue/${slug}/guest`), { params: Promise.resolve({ slug }) });

beforeEach(() => {
  h.staff = { id: "s", name: "Owner", role: "owner", venueId: VA, venueSlug: "spaloon", venueName: "Spaloon" };
  h.state = newState({ venues: [{ id: VA, slug: "spaloon", name: "Spaloon", active: true, wifi_ssid: null, wifi_password: null }], audit_log: [] });
});

describe("guest Wi-Fi", () => {
  it("the owner saves it and the guest page reads it, open to the guest site", async () => {
    expect((await post({ name: " Spaloon-Guest ", password: "welcome2026" })).status).toBe(200);
    expect(await (await GET()).json()).toEqual({ name: "Spaloon-Guest", password: "welcome2026" });
    const r = await guest("spaloon");
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(await r.json()).toEqual({ wifi: { name: "Spaloon-Guest", password: "welcome2026" } });
  });
  it("an empty name hides the button and drops the password", async () => {
    await post({ name: "", password: "left-over" });
    expect(await (await guest("spaloon")).json()).toEqual({ wifi: null });
    expect(h.state.tables.venues[0].wifi_password).toBeNull();
  });
  it("never logs the password", async () => {
    await post({ name: "Net", password: "secret-pass" });
    expect(JSON.stringify(h.state.tables.audit_log)).not.toContain("secret-pass");
  });
  it("only the owner can change it; unknown or odd venues are not found", async () => {
    h.staff = { ...h.staff!, role: "manager" };
    expect((await post({ name: "x", password: "y" })).status).toBe(403);
    expect((await guest("nope")).status).toBe(404);
    expect((await guest("../etc")).status).toBe(404);
  });
});
