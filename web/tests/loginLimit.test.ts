import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";

// Email + password sign-in is limited in the database before the password is even tried: 5 tries per account and 20 per
// address in 15 minutes. Invented accounts only.

const h = vi.hoisted(() => ({ state: undefined as unknown as FakeState, tried: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});
vi.mock("../src/lib/staffAuth", async (orig) => ({
  ...(await orig<typeof import("../src/lib/staffAuth")>()),
  signIn: async () => { h.tried++; return null; },
}));

import { newState } from "./helpers/fakeDb";
import { POST as login } from "../src/app/api/staff/login/route";

const req = (email: string, ip = "10.8.0.1") =>
  new Request("http://test.local/api/staff/login", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ email, password: "wrong-password" }) });

beforeEach(() => {
  h.state = newState({});
  h.tried = 0;
  vi.stubEnv("STAFF_SESSION_SECRET", "test-only-secret");
});

describe("email sign-in limits", () => {
  it("5 tries per account, then 429 without checking the password", async () => {
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await login(req("dev@example.com", `10.8.1.${i}`))).status);
    expect(codes).toEqual([401, 401, 401, 401, 401, 429]);
    expect(h.tried).toBe(5);
  });
  it("the same account in other capitals counts as the same account", async () => {
    for (let i = 0; i < 5; i++) await login(req("Dev@Example.com", `10.8.2.${i}`));
    expect((await login(req("dev@example.com", "10.8.2.9"))).status).toBe(429);
  });
  it("20 tries per address across accounts", async () => {
    const codes = [];
    for (let i = 0; i < 21; i++) codes.push((await login(req(`user${i}@example.com`, "10.8.3.1"))).status);
    expect(codes.filter((c) => c === 429)).toHaveLength(1);
    expect(codes[20]).toBe(429);
  });
  it("emails are stored only as hashes", async () => {
    await login(req("secret.person@example.com"));
    expect(JSON.stringify(h.state.tables.rate_hits)).not.toContain("secret.person");
  });
});
