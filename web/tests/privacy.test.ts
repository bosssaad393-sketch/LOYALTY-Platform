import { describe, expect, it } from "vitest";
import { EraseInput, requestLabel, requestView } from "../src/lib/privacy";
import { ACCESS, roleAllowed, type Role } from "../src/lib/roles";
import { createRateLimiter, clientKey } from "../src/lib/rateLimit";
import { mapPool } from "../src/lib/pool";

describe("requestLabel (no personal data)", () => {
  it("is 'Guest from <day> <month>' in Bahrain time", () => {
    expect(requestLabel("2026-10-12T09:00:00Z")).toBe("Guest from 12 Oct");
    expect(requestLabel(new Date("2026-01-05T10:00:00Z"))).toBe("Guest from 5 Jan");
  });
  it("uses the Bahrain day, which starts 3 hours before UTC midnight", () => {
    expect(requestLabel("2026-10-12T21:30:00Z")).toBe("Guest from 13 Oct");
    expect(requestLabel("2026-10-12T20:59:59Z")).toBe("Guest from 12 Oct");
  });
  it("falls back to a plain label for a broken date", () => {
    expect(requestLabel("garbage")).toBe("Guest request");
  });
});

describe("requestView", () => {
  const row = {
    id: "11111111-1111-4111-8111-111111111111",
    card_id: "22222222-2222-4222-8222-222222222222",
    requested_at: "2026-10-13T09:00:00+00:00",
    status: "pending",
    // fields that must never come out, even if a query selected too much:
    name: "Sara Ahmed",
    phone: "+97333123456",
    email: "sara@example.com",
  };
  it("returns exactly the contract fields", () => {
    const v = requestView(row);
    expect(Object.keys(v).sort()).toEqual(["cardId", "id", "label", "requestedAt", "status"]);
    expect(v).toEqual({ id: row.id, cardId: row.card_id, label: "Guest from 13 Oct", requestedAt: "2026-10-13T09:00:00.000Z", status: "pending" });
  });
  it("never leaks a name, phone or email", () => {
    const text = JSON.stringify(requestView(row));
    for (const secret of ["Sara", "Ahmed", "97333", "sara@", "example.com"]) expect(text).not.toContain(secret);
  });
  it("status is pending or erased only", () => {
    expect(requestView({ ...row, status: "erased" }).status).toBe("erased");
    expect(requestView({ ...row, status: "whatever" }).status).toBe("pending");
  });
});

describe("EraseInput", () => {
  it("needs a uuid", () => {
    expect(EraseInput.safeParse({ requestId: "11111111-1111-4111-8111-111111111111" }).success).toBe(true);
    expect(EraseInput.safeParse({ requestId: "123" }).success).toBe(false);
    expect(EraseInput.safeParse({}).success).toBe(false);
    expect(EraseInput.safeParse(null).success).toBe(false);
  });
});

describe("roles", () => {
  const roles: Role[] = ["staff", "manager", "owner", "developer"];
  it("owner-only actions allow the owner and nobody else", () => {
    expect(roles.filter((r) => roleAllowed(r, true))).toEqual(["owner"]);
  });
  it("shared actions allow owner and manager only", () => {
    expect(roles.filter((r) => roleAllowed(r, false))).toEqual(["manager", "owner"]);
  });
  it("a manager can look at offers but not send them, erase guests, read requests or edit terms", () => {
    expect(roleAllowed("manager", ACCESS.offersView)).toBe(true);
    expect(roleAllowed("manager", ACCESS.offersSend)).toBe(false);
    expect(roleAllowed("manager", ACCESS.privacyView)).toBe(false);
    expect(roleAllowed("manager", ACCESS.privacyErase)).toBe(false);
    expect(roleAllowed("manager", ACCESS.guestErase)).toBe(false);
    expect(roleAllowed("manager", ACCESS.termsEdit)).toBe(false);
  });
  it("the owner can do all of it; staff and developers none", () => {
    for (const level of Object.values(ACCESS)) {
      expect(roleAllowed("owner", level)).toBe(true);
      expect(roleAllowed("staff", level)).toBe(false);
      expect(roleAllowed("developer", level)).toBe(false);
    }
  });
});

describe("rate limiter", () => {
  it("allows the limit and blocks the next call inside the window", () => {
    const l = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect([l.allow("a", 0), l.allow("a", 1), l.allow("a", 2), l.allow("a", 3)]).toEqual([true, true, true, false]);
  });
  it("counts callers separately", () => {
    const l = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(l.allow("a", 0)).toBe(true);
    expect(l.allow("b", 0)).toBe(true);
    expect(l.allow("a", 1)).toBe(false);
  });
  it("lets a caller back in once the window has passed", () => {
    const l = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(l.allow("a", 0)).toBe(true);
    expect(l.allow("a", 999)).toBe(false);
    expect(l.allow("a", 1000)).toBe(true);
  });
  it("does not grow without bound", () => {
    const l = createRateLimiter({ limit: 1, windowMs: 10_000, maxKeys: 50 });
    for (let i = 0; i < 500; i++) l.allow(`ip-${i}`, i);
    expect(l.size()).toBeLessThanOrEqual(50);
  });
  it("clientKey takes the first forwarded address, then x-real-ip, then 'unknown'", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientKey(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientKey(new Headers())).toBe("unknown");
  });
});

describe("mapPool", () => {
  it("keeps order, never runs more than `size` at once, and survives a failing item", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapPool([1, 2, 3, 4, 5, 6], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      if (n === 4) throw new Error("boom");
      return n * 10;
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect(out.map((r) => (r.status === "fulfilled" ? r.value : "x"))).toEqual([10, 20, 30, "x", 50, 60]);
  });
  it("handles an empty list", async () => {
    expect(await mapPool([], 4, async () => 1)).toEqual([]);
  });
});
