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
  it("tells a stamp venue from a points venue", async () => {
    expect(await isStampVenue("salon")).toBe(true);
    expect(await isStampVenue("cafe")).toBe(false);
  });
});
