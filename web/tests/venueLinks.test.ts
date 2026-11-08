import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// The venue's Instagram and Google review links on the guest home page: only real addresses, owner-only, empty = hidden.

const h = vi.hoisted(() => ({ state: undefined as unknown as FakeState, staff: null as Staff | null }));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/staffAuth", () => ({ currentStaff: async () => h.staff }));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});

import { newState } from "./helpers/fakeDb";
import { GET, POST } from "../src/app/api/owner/links/route";
import { googleReviewOk, instagramOk, readLinks } from "../src/lib/venueLinks";

const VA = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const post = (body: unknown) => POST(new Request("http://t/api/owner/links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  h.staff = { id: "s", name: "Owner", role: "owner", venueId: VA, venueSlug: "a", venueName: "A" };
  h.state = newState({ venues: [{ id: VA, slug: "a", name: "A", instagram_url: null, google_review_url: null }], audit_log: [] });
});

describe("link checks", () => {
  it("accept real Instagram and Google review addresses only", () => {
    expect(instagramOk("https://www.instagram.com/kayabahrain")).toBe(true);
    expect(instagramOk("http://instagram.com/x")).toBe(false);
    expect(instagramOk("https://instagram.com.evil.example/x")).toBe(false);
    expect(googleReviewOk("https://g.page/r/CabcXYZ/review")).toBe(true);
    expect(googleReviewOk("https://search.google.com/local/writereview?placeid=abc")).toBe(true);
    expect(googleReviewOk("https://maps.app.goo.gl/abc")).toBe(true);
    expect(googleReviewOk("https://google.com.attacker.example")).toBe(false);
  });
});

describe("owner links", () => {
  it("the owner saves them; empty hides one", async () => {
    expect((await post({ instagram: "https://www.instagram.com/orbyn", googleReview: "" })).status).toBe(200);
    expect(await readLinks(VA)).toEqual({ instagram: "https://www.instagram.com/orbyn", googleReview: null });
    expect(h.state.tables.audit_log.some((a) => a.action === "links_changed")).toBe(true);
    expect(await (await GET()).json()).toEqual({ instagram: "https://www.instagram.com/orbyn", googleReview: null });
  });
  it("refuses other addresses", async () => {
    expect((await post({ instagram: "https://evil.example/x", googleReview: "" })).status).toBe(400);
  });
  it("only the owner may change them", async () => {
    h.staff = { ...h.staff!, role: "manager" };
    expect((await post({ instagram: "", googleReview: "" })).status).toBe(403);
  });
  it("reading never throws, even before the columns exist", async () => {
    h.state.failing.add("venues");
    expect(await readLinks(VA)).toEqual({ instagram: null, googleReview: null });
  });
});
