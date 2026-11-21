import { afterEach, describe, expect, it, vi } from "vitest";

// Google reviews on the owner Feedback screen: place id from the review link, Google's answer mapped safely, no key = nothing fetched.

vi.mock("server-only", () => ({}));
import { mapPlace, placeIdFrom, readGoogleReviews } from "../src/lib/googleReviews";

const LINK = "https://search.google.com/local/writereview?placeid=ChIJy0K4r4ylST4R0aHsm5BT4n8";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("placeIdFrom", () => {
  it("reads the place id from review and maps links", () => {
    expect(placeIdFrom(LINK)).toBe("ChIJy0K4r4ylST4R0aHsm5BT4n8");
    expect(placeIdFrom("https://www.google.com/maps/place/?q=place_id:ChIJy0K4r4ylST4R0aHsm5BT4n8")).toBe("ChIJy0K4r4ylST4R0aHsm5BT4n8");
  });
  it("refuses links without a clean place id", () => {
    expect(placeIdFrom(null)).toBeNull();
    expect(placeIdFrom("https://g.page/r/abc/review")).toBeNull();
    expect(placeIdFrom("https://search.google.com/local/writereview?placeid=../../x")).toBeNull();
    expect(placeIdFrom("not a url")).toBeNull();
  });
});

describe("mapPlace", () => {
  it("keeps at most 5 reviews, clamps ratings and drops non-https links", () => {
    const reviews = Array.from({ length: 7 }, (_, i) => ({ rating: 9, text: { text: ` r${i} ` }, relativePublishTimeDescription: "a week ago", authorAttribution: { displayName: "Ali", uri: i ? "https://maps.google.com/u" : "javascript:alert(1)" } }));
    const v = mapPlace({ rating: 4.7, userRatingCount: 370, googleMapsUri: "https://maps.google.com/?cid=1", reviews }, LINK);
    expect(v.rating).toBe(4.7);
    expect(v.count).toBe(370);
    expect(v.reviews).toHaveLength(5);
    expect(v.reviews[0]).toEqual({ author: "Ali", authorUrl: null, rating: 5, text: "r0", when: "a week ago" });
    expect(v.reviews[1].authorUrl).toBe("https://maps.google.com/u");
  });
  it("copes with an empty answer", () => {
    const v = mapPlace({}, LINK);
    expect(v).toMatchObject({ rating: null, count: 0, mapsUrl: null, reviews: [] });
  });
});

describe("readGoogleReviews", () => {
  it("does not call Google without a key", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect(await readGoogleReviews(LINK)).toEqual({ configured: false, reason: "no_key" });
    expect(f).not.toHaveBeenCalled();
  });
  it("needs a review link with a place id", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "k");
    expect(await readGoogleReviews(null)).toEqual({ configured: false, reason: "no_place" });
  });
  it("sends the key in a header, never in the URL, and reports Google errors", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "secret-key");
    const f = vi.fn(async () => new Response("no", { status: 403 })); vi.stubGlobal("fetch", f);
    const v = await readGoogleReviews(LINK);
    expect(v).toMatchObject({ configured: true, ok: false });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("secret-key");
    expect((init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("secret-key");
  });
});
