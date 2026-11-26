// The living card: the lamp in the venue's niche burns a little brighter the more a guest has visited.
// Makes the in-between pictures from the two the venue already has: the dark niche (passes/<venue>/strip*.png) and the
// lit one (passes/<venue>/lit/strip*.png). Writes passes/<venue>/lamp/<level>/strip.png, strip@2x.png, strip@3x.png.
// The levels and how bright each is are in src/lib/lamp.ts (LAMP_GLOW); keep the two lists the same.
//
//   node scripts/card-lamp.mjs <venue>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
/** Level -> how much of the lit picture shows. Level 0 is the dark picture itself and the top level is the lit one. */
const GLOW = { 1: 0.3, 2: 0.52, 3: 0.74 };
const FILES = ["strip.png", "strip@2x.png", "strip@3x.png"];

const venue = process.argv[2];
if (!venue) { console.error("Usage: node scripts/card-lamp.mjs <venue>"); process.exit(1); }
const dir = path.join(root, "passes", venue);

for (const [level, glow] of Object.entries(GLOW)) {
  const out = path.join(dir, "lamp", level);
  mkdirSync(out, { recursive: true });
  for (const name of FILES) {
    const dark = readFileSync(path.join(dir, name));
    const { width, height } = await sharp(dark).metadata();
    // The lit picture at part strength: its own transparency times the glow.
    const veil = await sharp({ create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: glow } } }).png().toBuffer();
    const lit = await sharp(readFileSync(path.join(dir, "lit", name))).ensureAlpha().composite([{ input: veil, blend: "dest-in" }]).png().toBuffer();
    writeFileSync(path.join(out, name), await sharp(dark).composite([{ input: lit }]).png().toBuffer());
  }
}
console.log(`wrote ${Object.keys(GLOW).length} lamp levels for ${venue}`);
