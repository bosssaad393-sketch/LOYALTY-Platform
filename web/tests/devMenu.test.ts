import { describe, expect, it, vi, beforeEach } from "vitest";

const staff = vi.fn();
const tables = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/staffAuth", () => ({ currentStaff: staff }));
vi.mock("@/lib/staffApi", () => ({ fail: (error: string, status = 400) => Response.json({ error }, { status }) }));
vi.mock("@/lib/table/db", () => ({ listTables: tables }));

const { GET } = await import("@/app/dev/menu/route");
const call = () => GET();

describe("developer Menu button", () => {
  beforeEach(() => { staff.mockReset(); tables.mockReset(); });

  it("refuses anyone not signed in, and never looks up a table code", async () => {
    staff.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(tables).not.toHaveBeenCalled();
  });

  it("refuses an owner", async () => {
    staff.mockResolvedValue({ role: "owner", venueId: "v1" });
    expect((await call()).status).toBe(403);
    expect(tables).not.toHaveBeenCalled();
  });

  it("opens the first table of the developer's own venue", async () => {
    staff.mockResolvedValue({ role: "developer", venueId: "v1" });
    tables.mockResolvedValue([{ id: "t1", label: "1", token: "first-table-code" }, { id: "t2", label: "2", token: "second-table-code" }]);
    const r = await call();
    expect(tables).toHaveBeenCalledWith("v1");
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/t/first-table-code");
  });

  it("says so plainly when the venue has no tables", async () => {
    staff.mockResolvedValue({ role: "developer", venueId: "v1" });
    tables.mockResolvedValue([]);
    const r = await call();
    expect(r.status).toBe(404);
    expect(await r.text()).toMatch(/no tables/);
  });
});
