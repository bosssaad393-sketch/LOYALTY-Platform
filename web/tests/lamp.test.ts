import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// The living card: the lamp in the niche burns brighter with visits (lib/lamp.ts), and the Wallet card's picture
// follows it (web/passes/<venue>/lamp/<level>/, made by scripts/card-lamp.mjs).

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", () => ({ db: () => ({}) }));

import { LAMP_GLOW, LAMP_VISITS, lampGlow, lampLevel, type LampLevel } from "../src/lib/lamp";
import { STRIP_FILES, lampStripImages, pngSize, stripPixels, type StripScale } from "../src/lib/appleWallet";

type Png = { width: number; height: number; data: Buffer };
const { PNG } = createRequire(import.meta.url)("pngjs") as { PNG: { sync: { read(file: Buffer): Png } } };
const scales = Object.keys(STRIP_FILES).map(Number) as StripScale[];

describe("how bright the lamp is", () => {
  it("is dark for a guest who has just joined, and grows at the first, third and sixth visit", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 40, 500].map((v) => lampLevel(v, false))).toEqual([0, 1, 1, 2, 2, 2, 3, 3, 3, 3]);
    expect(LAMP_VISITS).toEqual({ 1: 1, 2: 3, 3: 6 });
  });

  it("is fully lit while a gift is waiting, whatever the visits, and only then", () => {
    for (const v of [0, 1, 5, 80]) expect(lampLevel(v, true)).toBe(4);
    expect(Math.max(...[0, 1, 5, 80, 5000].map((v) => lampLevel(v, false)))).toBe(3);
  });

  it("never fails on a bad count", () => {
    for (const v of [-3, Number.NaN, Number.POSITIVE_INFINITY, 2.9]) expect([0, 1, 2, 3]).toContain(lampLevel(v, false));
    expect(lampLevel(Number.NaN, false)).toBe(0);
    expect(lampLevel(2.9, false)).toBe(1);
  });

  it("each level shows more of the lit picture than the one before", () => {
    const glows = ([0, 1, 2, 3, 4] as LampLevel[]).map(lampGlow);
    expect(glows).toEqual([...LAMP_GLOW]);
    expect(glows[0]).toBe(0);
    expect(glows[4]).toBe(1);
    for (let i = 1; i < glows.length; i++) expect(glows[i]).toBeGreaterThan(glows[i - 1]);
  });
});

describe("the Wallet card's picture at each level (Al Roshinah)", () => {
  // The lamp sits low in the niche, in the middle window of the picture: how warm that spot is (red above blue) is the light.
  const warmth = (file: Buffer) => {
    const png = PNG.sync.read(file);
    const x0 = Math.round(png.width * 0.51), x1 = Math.round(png.width * 0.56), y0 = Math.round(png.height * 0.7), y1 = Math.round(png.height * 0.8);
    let sum = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * png.width + x) * 4; sum += png.data[i] - png.data[i + 2]; n++; }
    return sum / n;
  };
  const dark = readFileSync(path.join(process.cwd(), "passes", "roshinah", STRIP_FILES[2]));

  it("keeps the venue's dark picture at level 0", () => {
    expect(lampStripImages("roshinah", 0)).toEqual({});
  });

  it.each([1, 2, 3, 4] as LampLevel[])("level %i has the three files at the strip's exact sizes", (level) => {
    const files = lampStripImages("roshinah", level);
    expect(Object.keys(files).sort()).toEqual(Object.values(STRIP_FILES).sort());
    for (const s of scales) expect(pngSize(files[STRIP_FILES[s]])).toEqual(stripPixels(s));
  });

  it("is warmer in the niche at every level, from the dark picture to the lit one", () => {
    const steps = [warmth(dark), ...([1, 2, 3, 4] as LampLevel[]).map((l) => warmth(lampStripImages("roshinah", l)[STRIP_FILES[2]]))];
    for (let i = 1; i < steps.length; i++) expect(steps[i], `level ${i}`).toBeGreaterThan(steps[i - 1] + 2);
  });

  it("fills the whole strip at every level: Al Roshinah's picture runs edge to edge (scripts/card-bleed.mjs)", () => {
    for (const level of [1, 2, 3] as LampLevel[]) {
      const png = PNG.sync.read(lampStripImages("roshinah", level)[STRIP_FILES[2]]);
      expect(png.data[3]).toBe(255);
      expect(png.data[((png.height >> 1) * png.width + (png.width >> 1)) * 4 + 3]).toBe(255);
    }
  });

  it("a venue without lamp pictures keeps its own picture, and never fails", () => {
    for (const level of [1, 2, 3, 4] as LampLevel[]) expect(lampStripImages("no-such-venue", level)).toEqual({});
  });
});
