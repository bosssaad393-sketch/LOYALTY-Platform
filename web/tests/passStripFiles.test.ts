import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// The strip images of every venue folder in web/passes: right size, and real transparency around the card
// (the strip is the card artwork only, so the pass background shows through the margins and the rounded corners).

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", () => ({ db: () => ({}) }));

import { STRIP_FILES, pngSize, stripPixels, stripProblems, type StripScale } from "../src/lib/appleWallet";

type Png = { width: number; height: number; data: Buffer };
// pngjs ships with the qrcode package; it has no type package here.
const { PNG } = createRequire(import.meta.url)("pngjs") as { PNG: { sync: { read(file: Buffer): Png } } };

const root = path.join(process.cwd(), "passes");
const venues = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(path.join(root, d.name, STRIP_FILES[1])));
const scales = Object.keys(STRIP_FILES).map(Number) as StripScale[];
const alphaAt = (png: Png, x: number, y: number) => png.data[(y * png.width + x) * 4 + 3];

describe.each(venues.map((v) => v.name))("strip images of %s", (slug) => {
  const files = Object.fromEntries(scales.map((s) => [STRIP_FILES[s], readFileSync(path.join(root, slug, STRIP_FILES[s]))]));

  it("has the three files at exactly the strip size times 1, 2 and 3", () => {
    expect(stripProblems(files)).toEqual([]);
    for (const s of scales) expect(pngSize(files[STRIP_FILES[s]])).toEqual(stripPixels(s));
  });

  it.each(scales)("is transparent in the four corners and the left and right margins, opaque in the middle (%ix)", (s) => {
    const png = PNG.sync.read(files[STRIP_FILES[s]]);
    const { width: w, height: h } = png;
    for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [1, h >> 1], [w - 2, h >> 1]]) expect(alphaAt(png, x, y)).toBe(0);
    expect(alphaAt(png, w >> 1, h >> 1)).toBe(255);
  });
});
