import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "./helpers/fakeDb";
import type { Staff } from "../src/lib/staffAuth";

// A gift's own photo behind the arch of the card's picture (migration 0033). The photo here is made in memory (plain
// red), so nothing is fetched and no real picture is used.

const h = vi.hoisted(() => ({ state: undefined as unknown as FakeState }));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", async () => {
  const { makeDb } = await import("./helpers/fakeDb");
  return { db: () => makeDb(h.state) };
});

import { newState } from "./helpers/fakeDb";
import { archPath, composeGiftStrip, forgetGiftStrips, giftStripImages, nicheOf, photoSourceOk } from "../src/lib/giftPhoto";
import { listVouchers, setVoucherPhoto } from "../src/lib/vouchersDb";
import { STRIP_FILES, pngSize, stripPixels, type StripScale } from "../src/lib/appleWallet";

type Png = { width: number; height: number; data: Buffer };
const { PNG } = createRequire(import.meta.url)("pngjs") as { PNG: { sync: { read(file: Buffer): Png } } };
const px = (png: Png, x: number, y: number) => [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)];
const lit = readFileSync(path.join(process.cwd(), "passes", "roshinah", "lit", "strip@3x.png"));
const red = () => sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 220, g: 30, b: 30 } } }).jpeg().toBuffer();
const dataUrl = async () => `data:image/jpeg;base64,${(await red()).toString("base64")}`;
const scales = Object.keys(STRIP_FILES).map(Number) as StripScale[];
const STORE = "https://abcdefghijklmnop.supabase.co";

beforeEach(() => { forgetGiftStrips(); process.env.SUPABASE_URL = STORE; });
afterEach(() => vi.unstubAllGlobals());

describe("where the niche is", () => {
  it("is read for Al Roshinah and sits inside the strip, in its middle", () => {
    const n = nicheOf("roshinah")!;
    expect(n).toEqual({ l: 548, r: 783, floor: 372, spring: 165, tip: 46 });
    expect(n.l).toBeLessThan(1125 / 2);
    expect(n.r).toBeGreaterThan(1125 / 2);
  });

  it("is nothing for a venue without one, and for a name that is not a venue's", () => {
    expect(nicheOf("orbyn")).toBeNull();
    expect(nicheOf("../roshinah")).toBeNull();
    expect(nicheOf("")).toBeNull();
  });

  it("draws an arch: pointed at the top middle, full width at the shelf", () => {
    const d = archPath({ l: 0, r: 200, floor: 280, spring: 100, tip: 0 });
    expect(d.startsWith("M 0 280 L 0 100 C")).toBe(true);
    expect(d).toContain(" 100 0 C ");
    expect(d.endsWith("L 200 280 Z")).toBe(true);
  });
});

describe("which photos the server will read", () => {
  it("its own storage's public menu files, and a small picture held in the record", async () => {
    expect(photoSourceOk(`${STORE}/storage/v1/object/public/menu/venue-1/gift-abc-0011.webp`)).toBe(true);
    expect(photoSourceOk(await dataUrl())).toBe(true);
  });

  it("nothing else: another host, another bucket, a private file, a redirecting or odd address", () => {
    for (const url of [
      "https://evil.example/storage/v1/object/public/menu/x.webp",
      "https://other-project.supabase.co/storage/v1/object/public/menu/x.webp",
      `${STORE}/storage/v1/object/public/secret/x.webp`,
      `${STORE}/storage/v1/object/sign/menu/x.webp`,
      `${STORE}/storage/v1/object/public/menu/../../../auth/v1/admin/users`,
      `${STORE}/storage/v1/object/public/menu/x.webp?redirect=https://evil.example`,
      "http://169.254.169.254/latest/meta-data/",
      "file:///etc/passwd",
      "data:text/html;base64,PHNjcmlwdD4=",
      "",
    ]) expect(photoSourceOk(url), url).toBe(false);
    // Without this deployment's own storage address, no address at all is accepted.
    expect(photoSourceOk(`${STORE}/storage/v1/object/public/menu/x.webp`, {})).toBe(false);
  });
});

describe("the card's picture with a gift's photo", () => {
  it("shows the photo inside the arch and leaves the rest of the picture exactly as it was", async () => {
    const n = nicheOf("roshinah")!;
    const out = PNG.sync.read(await composeGiftStrip(lit, await red(), n));
    const before = PNG.sync.read(lit);
    expect([out.width, out.height]).toEqual([1125, 432]);
    // The middle of the niche is now the photo's red.
    const [r, g, b] = px(out, (n.l + n.r) >> 1, n.spring + 60);
    expect(r).toBeGreaterThan(150);
    expect(g).toBeLessThan(80);
    expect(b).toBeLessThan(80);
    // The wall beside the niche, the shelf below it and the corner above the arch are untouched.
    for (const [x, y] of [[300, 200], [n.l - 12, 200], [n.r + 12, 200], [(n.l + n.r) >> 1, n.floor + 8], [n.l + 4, n.tip + 4], [n.r - 4, n.tip + 4]]) expect(px(out, x, y), `${x},${y}`).toEqual(px(before, x, y));
    // The corner is as it was (opaque: this picture runs edge to edge).
    expect(px(out, 0, 0)).toEqual(px(before, 0, 0));
  });

  it("gives the three Wallet files at the strip's exact sizes, from a picture held in the record", async () => {
    const files = await giftStripImages("roshinah", await dataUrl());
    expect(Object.keys(files).sort()).toEqual(Object.values(STRIP_FILES).sort());
    for (const s of scales) expect(pngSize(files[STRIP_FILES[s]])).toEqual(stripPixels(s));
  });

  it("fetches a photo from its own storage once, then remembers the picture", async () => {
    const photo = await red();
    const fetched = vi.fn(async () => new Response(new Uint8Array(photo), { status: 200 }));
    vi.stubGlobal("fetch", fetched);
    const url = `${STORE}/storage/v1/object/public/menu/venue-1/gift-1-aa11.jpg`;
    expect(Object.keys(await giftStripImages("roshinah", url))).toHaveLength(3);
    expect(Object.keys(await giftStripImages("roshinah", url))).toHaveLength(3);
    expect(fetched).toHaveBeenCalledTimes(1);
  });

  it("keeps the plain lit niche, without failing, when there is no photo or it cannot be used", async () => {
    const fetched = vi.fn(async () => new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetched);
    expect(await giftStripImages("roshinah", null)).toEqual({});
    expect(await giftStripImages("roshinah", "https://evil.example/x.jpg")).toEqual({});
    expect(fetched).not.toHaveBeenCalled();
    expect(await giftStripImages("roshinah", `${STORE}/storage/v1/object/public/menu/gone.jpg`)).toEqual({});
    expect(await giftStripImages("orbyn", await dataUrl())).toEqual({});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("this is not a picture", { status: 200 })));
    expect(await giftStripImages("roshinah", `${STORE}/storage/v1/object/public/menu/broken.jpg`)).toEqual({});
  });
});

describe("saving a gift's photo", () => {
  const owner = (venueId: string): Staff => ({ id: `owner-${venueId}`, name: "Owner", role: "owner", venueId, venueSlug: "v", venueName: "V" });
  const URL_A = `${STORE}/storage/v1/object/public/menu/venue-a/gift-g1-aa11.webp`;

  beforeEach(() => {
    h.state = newState({
      vouchers: [
        { id: "g1", venue_id: "venue-a", title: "50% off at Asmak", trigger: "first_visit", active: true, created_at: "2026-11-01T00:00:00Z", image_url: null },
        { id: "g9", venue_id: "venue-b", title: "Other venue's gift", trigger: "manual", active: true, created_at: "2026-11-01T00:00:00Z", image_url: null },
      ],
      card_vouchers: [
        { id: "cv1", venue_id: "venue-a", voucher_id: "g1", card_id: "c1", status: "issued" },
        { id: "cv2", venue_id: "venue-a", voucher_id: "g1", card_id: "c2", status: "issued" },
        { id: "cv3", venue_id: "venue-a", voucher_id: "g1", card_id: "c3", status: "redeemed" },
      ],
      audit_log: [],
    });
  });

  it("sets it on the owner's own gift, says how many guests are holding the gift, and writes it down", async () => {
    expect(await setVoucherPhoto(owner("venue-a"), "g1", URL_A)).toEqual({ waiting: 2 });
    expect((await listVouchers("venue-a"))[0].imageUrl).toBe(URL_A);
    expect(h.state.tables.audit_log).toEqual([expect.objectContaining({ venue_id: "venue-a", action: "voucher_photo_set", detail: { voucher: "g1" } })]);
    expect(await setVoucherPhoto(owner("venue-a"), "g1", null)).toEqual({ waiting: 2 });
    expect((await listVouchers("venue-a"))[0].imageUrl).toBeNull();
  });

  it("never touches another business's gift", async () => {
    expect(await setVoucherPhoto(owner("venue-a"), "g9", URL_A)).toBe("not_found");
    expect(h.state.tables.vouchers.find((v) => v.id === "g9")!.image_url).toBeNull();
    expect(h.state.tables.audit_log).toEqual([]);
  });
});
