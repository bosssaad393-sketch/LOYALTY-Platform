import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { throwawayCertificate, unzip } from "./helpers/throwawayPass";

// The Apple Wallet pass for a guest, built for real with passkit-generator and a THROWAWAY certificate made in memory,
// then unzipped and read back. Nothing touches Supabase, Apple or any network.

const h = vi.hoisted(() => ({ offer: null as { message: string | null; alert: boolean } | null }));

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", () => ({
  // authTokenFor() only reads the card's stored token.
  db: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { apple_auth_token: "0123456789abcdef0123456789abcdef0123456789abcdef" }, error: null }) }) }) }) }),
}));
vi.mock("../src/lib/passOffer", () => ({ offerStateForCard: async () => h.offer }));

import { STRIP, STRIP_FILES, buildPass, pngSize, stripPixels, stripProblems } from "../src/lib/appleWallet";
import type { Card, Venue } from "../src/lib/supabase";

const venue: Venue = { id: "v1", slug: "demo", name: "Demo Venue", points_per_bhd: 2, reward_goal: 500, reward_text: "A dessert on the house." };
const card = (points: number): Card => ({ id: "11111111-1111-4111-8111-111111111111", venue_id: "v1", member_id: "m1", code: "7523", points, visits: 3 });

type Field = { key: string; label: string; value: string | number; textAlignment?: string; changeMessage?: string };
type Json = {
  backgroundColor: string;
  foregroundColor: string;
  labelColor: string;
  barcodes?: { format: string; message: string; altText?: string }[];
  storeCard?: Record<string, Field[] | undefined>;
  posterGeneric?: Record<string, Field[] | undefined>;
};

async function pass(points: number, name = "Sara Hasan") {
  const files = unzip(await buildPass(venue, card(points), name, "https://example.test"));
  const json = JSON.parse(files.get("pass.json")!.toString("utf8")) as Json;
  return { files, json, store: json.storeCard! };
}
const keys = (fields: Field[] | undefined) => (fields ?? []).map((f) => f.key);
const get = (fields: Field[] | undefined, key: string) => (fields ?? []).find((f) => f.key === key)!;

beforeAll(() => {
  const signer = throwawayCertificate("Throwaway test signer");
  const wwdr = throwawayCertificate("Throwaway test WWDR");
  vi.stubEnv("APPLE_PASS_CERT", signer.cert);
  vi.stubEnv("APPLE_PASS_KEY", signer.key);
  vi.stubEnv("APPLE_WWDR_CERT", wwdr.cert);
  vi.stubEnv("APPLE_PASS_TYPE_ID", "pass.test.throwaway");
  vi.stubEnv("APPLE_TEAM_ID", "TESTTEAM00");
  vi.stubEnv("PUBLIC_BASE_URL", "https://example.test");
});
afterEach(() => {
  h.offer = null;
  vi.stubEnv("APPLE_POSTER_PASS", "");
});

describe("store card layout (the default)", () => {
  it("prints nothing over the strip: no primary fields", async () => {
    const { store } = await pass(320);
    expect(store.primaryFields ?? []).toEqual([]);
  });

  it("keeps ONE row of three: MEMBER and POINTS (secondary), YOUR CODE (auxiliary); the way to the reward is on the back", async () => {
    const { store } = await pass(320);
    expect(keys(store.secondaryFields)).toEqual(["member", "points"]);
    expect(keys(store.auxiliaryFields)).toEqual(["code"]);
    expect(get(store.secondaryFields, "member")).toMatchObject({ label: "MEMBER", value: "Sara Hasan" });
    expect(get(store.secondaryFields, "points")).toMatchObject({ label: "POINTS", value: 320, textAlignment: "PKTextAlignmentCenter" });
    expect(get(store.auxiliaryFields, "code")).toMatchObject({ label: "YOUR CODE", value: "7523", textAlignment: "PKTextAlignmentRight" });
    expect(get(store.backFields, "togo")).toMatchObject({ label: "To your reward", value: 180 });
  });

  it("keeps the header (Powered by Orbyn) and the logo file", async () => {
    const { store, files } = await pass(320);
    expect(store.headerFields).toEqual([{ key: "by", label: "POWERED BY", value: "Orbyn" }]);
    expect(files.has("logo.png") && files.has("logo@2x.png") && files.has("logo@3x.png")).toBe(true);
  });

  it("says Reward ready once the goal is reached (and 0 points to go is not shown as a number)", async () => {
    expect(get((await pass(499)).store.backFields, "togo").value).toBe(1);
    expect(get((await pass(500)).store.backFields, "togo")).toMatchObject({ label: "To your reward", value: "Reward ready" });
    expect(get((await pass(1500)).store.backFields, "togo").value).toBe("Reward ready");
  });

  it("keeps the points alert: a changed points value announces itself on the lock screen", async () => {
    const { store } = await pass(320);
    expect(get(store.secondaryFields, "points").changeMessage).toBe("You now have %@ points.");
  });

  it("a new points total gives a different pass (this is what Wallet fetches after the push)", async () => {
    const before = await pass(320);
    const after = await pass(340);
    expect(get(before.store.secondaryFields, "points").value).toBe(320);
    expect(get(after.store.secondaryFields, "points").value).toBe(340);
    expect(before.files.get("pass.json")!.equals(after.files.get("pass.json")!)).toBe(false);
  });

  it("uses a tinted black background, cream text and gold labels", async () => {
    const { json } = await pass(320);
    expect(json.backgroundColor).toBe("rgb(8, 7, 6)");
    expect(json.foregroundColor).toBe("rgb(243, 233, 210)");
    expect(json.labelColor).toBe("rgb(205, 165, 91)");
  });

  it("keeps the QR (card code inside) and its alt text", async () => {
    const { json } = await pass(320);
    expect(json.barcodes?.[0]).toMatchObject({ format: "PKBarcodeFormatQR", message: "LOYALTY:demo:7523", altText: "7523" });
  });

  it("keeps the back fields, and the offer first for a guest who agreed to offers", async () => {
    expect(keys((await pass(320)).store.backFields)).toEqual(["togo", "open", "how", "reward", "terms", "powered"]);
    h.offer = { message: "Double points on Friday.", alert: true };
    const { store } = await pass(320);
    expect(keys(store.backFields)).toEqual(["offer", "togo", "open", "how", "reward", "terms", "powered"]);
    expect(get(store.backFields, "offer")).toMatchObject({ value: "Double points on Friday.", changeMessage: "%@" });
  });

  it("is signed: manifest and signature are in the package, and the three strip files are in the manifest", async () => {
    const { files } = await pass(320);
    expect(files.has("signature") && files.has("manifest.json")).toBe(true);
    const manifest = JSON.parse(files.get("manifest.json")!.toString("utf8")) as Record<string, string>;
    for (const name of Object.values(STRIP_FILES)) {
      expect(files.has(name)).toBe(true);
      expect(manifest[name]).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});

describe("poster style (off unless APPLE_POSTER_PASS=1)", () => {
  it("is not in the pass by default", async () => {
    const { json, files } = await pass(320);
    expect(json.posterGeneric).toBeUndefined();
    expect(files.has("artwork.png")).toBe(false);
  });

  it("is added next to the store card when switched on, and the store card keeps the same layout", async () => {
    vi.stubEnv("APPLE_POSTER_PASS", "1");
    const { json, files } = await pass(320);
    expect(json.posterGeneric).toBeDefined();
    expect(keys(json.storeCard!.secondaryFields)).toEqual(["member", "points"]);
    expect(keys(json.storeCard!.auxiliaryFields)).toEqual(["code"]);
    expect(files.has("artwork.png")).toBe(true);
  });
});

describe("the strip size constant", () => {
  it("is 375 x 144 pt, i.e. 1125 x 432 px at 3x", () => {
    expect(STRIP).toEqual({ w: 375, h: 144 });
    expect(stripPixels(1)).toEqual({ width: 375, height: 144 });
    expect(stripPixels(2)).toEqual({ width: 750, height: 288 });
    expect(stripPixels(3)).toEqual({ width: 1125, height: 432 });
  });

  const png = (w: number, h: number) => {
    const b = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
    b.writeUInt32BE(13, 8);
    b.write("IHDR", 12, "ascii");
    b.writeUInt32BE(w, 16);
    b.writeUInt32BE(h, 20);
    return b;
  };

  it("reads a PNG header and refuses anything else", () => {
    expect(pngSize(png(1125, 432))).toEqual({ width: 1125, height: 432 });
    expect(pngSize(Buffer.from("not a png at all, just some text here"))).toBeNull();
    expect(pngSize(Buffer.alloc(4))).toBeNull();
  });

  it("names every wrong, missing or non-PNG strip file", () => {
    const right = { "strip.png": png(375, 144), "strip@2x.png": png(750, 288), "strip@3x.png": png(1125, 432) };
    expect(stripProblems(right)).toEqual([]);
    expect(stripProblems({ ...right, "strip@3x.png": png(1125, 369) })).toEqual(["strip@3x.png is 1125x369, expected 1125x432"]);
    expect(stripProblems({ ...right, "strip.png": Buffer.from("junk junk junk junk junk junk junk") })).toEqual(["strip.png is not a PNG"]);
    const { "strip@2x.png": gone, ...rest } = right;
    void gone;
    expect(stripProblems(rest)).toEqual(["strip@2x.png is missing"]);
  });
});
