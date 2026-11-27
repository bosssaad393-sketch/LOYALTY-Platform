// The Wallet picture edge to edge (Saad, 2026-11-27): card-art-photo.mjs draws the picture inside a transparent margin
// with rounded corners; Wallet itself runs a store card's strip from one side of the card to the other, so the margin
// only made the picture smaller. This cuts the margin and the corners away and fills the full 375 x 144 pt strip.
//
// Reads the pictures with the margin from passes/<venue>/margin/ (copied there from plain/ the first time) and writes
// the full ones to passes/<venue>/plain/, where card-mark.mjs takes them from. Prints the niche's new place for
// niche.json. Afterwards: node scripts/card-mark.mjs <venue> && node scripts/card-lamp.mjs <venue>
//
//   node scripts/card-bleed.mjs <venue>
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const venue = process.argv[2];
if (!venue) { console.error("Usage: node scripts/card-bleed.mjs <venue>"); process.exit(1); }
const dir = path.join(root, "passes", venue);
// In the 3x picture (1125 x 432): the part kept. Inside the 54 / 18 px margin and clear of the 41 px corners, same shape as the strip.
const CUT = { left: 78, top: 30, width: 969, height: 372 };
const SIZES = [["strip.png", 375, 144], ["strip@2x.png", 750, 288], ["strip@3x.png", 1125, 432]];

for (const sub of ["", "lit"]) {
  const from = path.join(dir, "margin", sub), to = path.join(dir, "plain", sub);
  mkdirSync(from, { recursive: true });
  const keep = path.join(from, "strip@3x.png");
  if (!existsSync(keep)) copyFileSync(path.join(to, "strip@3x.png"), keep);
  const cut = await sharp(readFileSync(keep)).extract(CUT).flatten({ background: "#013220" }).png().toBuffer();
  for (const [name, w, h] of SIZES) writeFileSync(path.join(to, name), await sharp(cut).resize(w, h, { kernel: "lanczos3" }).png().toBuffer());
}
const k = 1125 / CUT.width;
const niche = JSON.parse(readFileSync(path.join(dir, "niche.json"), "utf8"));
const moved = { l: Math.round((niche.l - CUT.left) * k), r: Math.round((niche.r - CUT.left) * k), floor: Math.round((niche.floor - CUT.top) * k), spring: Math.round((niche.spring - CUT.top) * k), tip: Math.round((niche.tip - CUT.top) * k) };
console.log("niche, if niche.json still describes the picture with the margin:", JSON.stringify(moved));
