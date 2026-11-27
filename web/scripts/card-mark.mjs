// A mark drawn on the wall of the venue's Wallet picture (Saad, 2026-11-27: the fish restaurant's logo in gold).
// Reads passes/<venue>/mark-source.png (dark lines on white) and passes/<venue>/mark.json, keeps the untouched
// pictures in passes/<venue>/plain/, and writes the marked ones over strip*.png and lit/strip*.png.
// Run scripts/card-lamp.mjs afterwards so the in-between lamp pictures carry the mark too.
//
//   node scripts/card-mark.mjs <venue>
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const venue = process.argv[2];
if (!venue) { console.error("Usage: node scripts/card-mark.mjs <venue>"); process.exit(1); }
const dir = path.join(root, "passes", venue);
// width, left, mid: the mark's width, left edge and vertical centre in the 3x picture (1125 x 432). rgb: its colour.
const spec = JSON.parse(readFileSync(path.join(dir, "mark.json"), "utf8"));
const FILES = [["strip.png", 1 / 3], ["strip@2x.png", 2 / 3], ["strip@3x.png", 1]];

/** The source's darkness becomes the mark's opacity, in one flat colour. */
async function mark(width) {
  const g = await sharp(path.join(dir, "mark-source.png")).trim().greyscale().resize({ width, kernel: "lanczos3" }).normalise().negate().linear(1.7, -40).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = g.info;
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { out[i * 4] = spec.rgb[0]; out[i * 4 + 1] = spec.rgb[1]; out[i * 4 + 2] = spec.rgb[2]; out[i * 4 + 3] = g.data[i]; }
  return { png: await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer(), h };
}

for (const sub of ["", "lit"]) {
  const plain = path.join(dir, "plain", sub);
  mkdirSync(plain, { recursive: true });
  for (const [name, scale] of FILES) {
    const live = path.join(dir, sub, name), keep = path.join(plain, name);
    if (!existsSync(keep)) copyFileSync(live, keep);
    const m = await mark(Math.round(spec.width * scale));
    writeFileSync(live, await sharp(keep).composite([{ input: m.png, left: Math.round(spec.left * scale), top: Math.round(spec.mid * scale - m.h / 2) }]).png().toBuffer());
  }
}
console.log(`marked the pictures of ${venue}`);
