import { describe, expect, it, vi } from "vitest";

// A salon on stamps (Spaloon) does not see the restaurant parts of the owner app; a café on points still does.

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", () => ({
  db: () => ({ from: () => ({ select: () => ({ eq: (_c: string, slug: string) => ({ maybeSingle: async () => ({ data: slug === "salon" ? { stamp_tiers: [{ at: 3, text: "10% off" }] } : { stamp_tiers: null } }) }) }) }) }),
}));
import { visibleTabs } from "../src/app/owner/OwnerApp";
import { isStampVenue } from "../src/lib/venueKind";

const ids = (owner: boolean, stamps: boolean) => visibleTabs(owner, stamps).map((t) => t.id);

describe("owner sections by venue kind", () => {
  it("a stamp venue has no tables, menu or points assistant", () => {
    expect(ids(true, true)).toEqual(["overview", "guests", "feedback", "rules", "offers", "team", "privacy"]);
  });
  it("a points venue keeps everything; managers never see owner-only sections", () => {
    expect(ids(true, false)).toContain("service");
    expect(ids(true, false)).toContain("assistant");
    expect(ids(false, true)).toEqual(["overview", "guests", "feedback", "rules", "offers"]);
  });
  it("a visit-card venue keeps tables and menu, drops the points assistant, and gets branches, gifts, messages and activity", () => {
    const v = visibleTabs(true, false, true).map((t) => t.id);
    expect(v).toEqual(["overview", "service", "bookings", "guests", "feedback", "rules", "offers", "branches", "gifts", "messages", "team", "activity", "privacy"]);
    // a manager sees branches, gifts and messages (read only) but not the owner-only activity log
    expect(visibleTabs(false, false, true).map((t) => t.id)).toEqual(["overview", "service", "bookings", "guests", "feedback", "rules", "offers", "branches", "gifts", "messages"]);
    // points and stamp venues never see the visit sections
    for (const stamps of [true, false]) expect(ids(true, stamps)).not.toContain("branches");
  });
  it("tells a stamp venue from a points venue", async () => {
    expect(await isStampVenue("salon")).toBe(true);
    expect(await isStampVenue("cafe")).toBe(false);
  });
});
