import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";

// One sign-in cookie per screen: the developer, the owner and the till can be signed in at the same time in one browser,
// and a cookie made for one screen is worthless on another. REAL staffAuth code against the in-memory database.

const h = vi.hoisted(() => ({ state: undefined as unknown as FakeState, jar: {} as Record<string, string> }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (h.jar[n] ? { value: h.jar[n] } : undefined) }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});

process.env.STAFF_SESSION_SECRET = "test-secret-not-real";
process.env.LOGIN_MODE = "pin";

import { newState } from "./helpers/fakeDb";
import { areaFor, COOKIE_NAMES, currentStaff, makeSessionValue, readSession } from "../src/lib/staffAuth";
import { POST as pinLogin } from "../src/app/api/staff/pin-login/route";
import { POST as logout } from "../src/app/api/staff/logout/route";
import { pinLookup } from "../src/lib/pin";

const VA = "venue-a";
const row = (id: string, name: string, role: string, pin: string | null) => ({ id, venue_id: VA, name, role, active: true, pin_lookup: pin ? pinLookup(pin) : null });

beforeEach(() => {
  h.jar = {};
  h.state = newState({
    venues: [{ id: VA, slug: "a", name: "Venue A" }],
    staff_users: [row("u-owner", "Owner", "owner", "482915"), row("u-sara", "Sara", "staff", "7391"), row("u-dev", "Dev", "developer", null)],
    pin_attempts: [],
    audit_log: [],
  });
});

const login = (pin: string, area?: string, ip = "1.1.1.1") =>
  pinLogin(new Request("http://t/api", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ pin, area }) }));
const cookieOf = (r: Response) => r.headers.get("set-cookie") ?? "";

describe("session values", () => {
  it("only work on the screen they were made for, and not when tampered with", () => {
    const owner = makeSessionValue("u-owner", "owner").value;
    expect(readSession(owner, "owner")).toBe("u-owner");
    expect(readSession(owner, "dev")).toBeNull();
    expect(readSession(owner, "staff")).toBeNull();
    // relabel the cookie as a developer cookie: the signature no longer fits
    expect(readSession(owner.replace(".owner.", ".dev."), "dev")).toBeNull();
    expect(readSession("garbage", "owner")).toBeNull();
  });
  it("the screen follows the role unless a screen is asked for", () => {
    expect(areaFor("developer")).toBe("dev");
    expect(areaFor("developer", "owner")).toBe("dev");
    expect(areaFor("owner")).toBe("owner");
    expect(areaFor("manager")).toBe("owner");
    expect(areaFor("staff")).toBe("staff");
    expect(areaFor("owner", "staff")).toBe("staff");
  });
});

describe("PIN sign-in stores one cookie per screen", () => {
  it("an owner PIN on the owner screen sets the owner cookie, on the till it sets the staff cookie", async () => {
    expect(cookieOf(await login("482915", "owner"))).toMatch(new RegExp(`^${COOKIE_NAMES.owner}=`));
    expect(cookieOf(await login("482915", "staff", "2.2.2.2"))).toMatch(new RegExp(`^${COOKIE_NAMES.staff}=`));
    expect(cookieOf(await login("7391", undefined, "3.3.3.3"))).toMatch(new RegExp(`^${COOKIE_NAMES.staff}=`));
  });
  it("three people can be signed in at once and each screen sees only its own", async () => {
    h.jar = {
      [COOKIE_NAMES.dev]: makeSessionValue("u-dev", "dev").value,
      [COOKIE_NAMES.owner]: makeSessionValue("u-owner", "owner").value,
      [COOKIE_NAMES.staff]: makeSessionValue("u-sara", "staff").value,
    };
    expect((await currentStaff("dev"))?.role).toBe("developer");
    expect((await currentStaff("owner"))?.role).toBe("owner");
    expect((await currentStaff("staff"))?.name).toBe("Sara");
  });
  it("the developer cookie does not open the owner screen", async () => {
    h.jar = { [COOKIE_NAMES.dev]: makeSessionValue("u-dev", "dev").value };
    expect(await currentStaff("owner")).toBeNull();
    expect(await currentStaff("staff")).toBeNull();
    // even if the same value is copied into the owner cookie
    h.jar = { [COOKIE_NAMES.owner]: makeSessionValue("u-dev", "dev").value };
    expect(await currentStaff("owner")).toBeNull();
  });
});

describe("sign out", () => {
  const out = (body: unknown, referer?: string) => logout(new Request("http://t/api", { method: "POST", headers: { "content-type": "application/json", ...(referer ? { referer } : {}) }, body: JSON.stringify(body) }));
  it("clears only the screen named", async () => {
    const c = (await out({ area: "owner" })).headers.getSetCookie();
    expect(c).toHaveLength(1);
    expect(c[0]).toContain(`${COOKIE_NAMES.owner}=;`);
  });
  it("finds the screen from the page it was sent from", async () => {
    expect((await out({}, "https://x.example/dev")).headers.getSetCookie()[0]).toContain(`${COOKIE_NAMES.dev}=;`);
    expect((await out({}, "https://x.example/staff")).headers.getSetCookie()[0]).toContain(`${COOKIE_NAMES.staff}=;`);
  });
  it("clears all three when it cannot tell", async () => {
    expect((await out({})).headers.getSetCookie()).toHaveLength(3);
  });
});
