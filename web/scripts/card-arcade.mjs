// "The arcade" (Saad, 2026-11-27, option 2 of the card redesign): the venue's niche repeated along the wall like the
// windows of a rawshan, the middle one holding the lamp and the gift's photo; the fish of the restaurant's logo small as a
// seal on the left; the top and bottom of the picture melting into the card's own colour; the logo at the top in gold.
//
// Reads the untouched pictures in passes/<venue>/plain/ (and plain/lit/), logo*.png, mark-source.png and
// arcade.json, and writes strip*.png, lit/strip*.png and logo*.png. Run scripts/card-lamp.mjs afterwards so the
// in-between lamp pictures are drawn from the new ones. niche.json must describe the lamp's window (the venue's niche moved "lamp" px to the left).
//
//   node scripts/card-arcade.mjs <venue> && node scripts/card-lamp.mjs <venue>
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const venue = process.argv[2];
if (!venue) { console.error("Usage: node scripts/card-arcade.mjs <venue>"); process.exit(1); }
const dir = path.join(root, "passes", venue);
// All sizes are in the 3x picture (1125 x 432). patch: the part of the wall holding the niche. shifts: how far to the
// left each copy sits. fish: the part of mark-source.png that is the fish (share of its width), its height, left edge
// and how far below the middle. card: the card's colour, which the picture melts into. gold: the fish and the logo.
const spec = JSON.parse(readFileSync(path.join(dir, "arcade.json"), "utf8"));
const W = 1125, H = 432;
const SIZES = [["strip.png", 375, 144], ["strip@2x.png", 750, 288], ["strip@3x.png", 1125, 432]];

/** The fish alone, as opacity: the source's dark lines, a little heavier so they hold at this size. */
async function fishMask() {
  const t = await sharp(path.join(dir, "mark-source.png")).flatten({ background: "#fff" }).trim().toBuffer({ resolveWithObject: true });
  const cut = await sharp(t.data).extract({ left: 0, top: 0, width: Math.round(t.info.width * spec.fish.share), height: t.info.height }).toBuffer();
  return sharp(cut).greyscale().resize({ height: spec.fish.height, kernel: "lanczos3" }).normalise().negate().linear(2.4, -70).blur(0.6).linear(1.5, -20).raw().toBuffer({ resolveWithObject: true });
}
async function tint(g, rgb, strength = 1) {
  const { width: w, height: h } = g.info;
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { out[i * 4] = rgb[0]; out[i * 4 + 1] = rgb[1]; out[i * 4 + 2] = rgb[2]; out[i * 4 + 3] = Math.min(255, Math.round(g.data[i] * strength)); }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}
/** Cut into the plaster: a shadow below and right, a thin light edge above and left, then the gold. */
async function engraved(g, left, top) {
  return [
    { input: await sharp(await tint(g, [0, 12, 7], 0.9)).blur(2.4).toBuffer(), left: left + 4, top: top + 5 },
    { input: await tint(g, [255, 238, 190], 0.3), left: left - 1, top: top - 1 },
    { input: await tint(g, spec.gold), left, top },
  ];
}
const melt = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>
<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(${spec.card})" stop-opacity="1"/><stop offset="1" stop-color="rgb(${spec.card})" stop-opacity="0"/></linearGradient>
<linearGradient id="b" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="rgb(${spec.card})" stop-opacity="1"/><stop offset="1" stop-color="rgb(${spec.card})" stop-opacity="0"/></linearGradient></defs>
<rect width="${W}" height="${spec.melt.top}" fill="url(#t)"/><rect y="${H - spec.melt.bottom}" width="${W}" height="${spec.melt.bottom}" fill="url(#b)"/></svg>`);

const pw = spec.patch.width;
const feather = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${H}"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".16" stop-color="#fff"/><stop offset=".84" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect width="${pw}" height="${H}" fill="url(#g)"/></svg>`);
const dark = readFileSync(path.join(dir, "plain", "strip@3x.png"));
const patch = await sharp(dark).extract({ left: spec.patch.left, top: 0, width: pw, height: H }).ensureAlpha().composite([{ input: feather, blend: "dest-in" }]).png().toBuffer();
const fish = await fishMask();
const seal = await engraved(fish, spec.fish.left, Math.round(H / 2 - fish.info.height / 2) + spec.fish.drop);

// The wall is always the dark one, with a dark niche at every place in "shifts" (0 = where the venue's own niche is).
// The lamp's window is the niche of the picture being drawn (dark or lit), set "lamp" px to the left of its own place.
const wall = await sharp(dark).composite(spec.shifts.filter((s) => s !== 0).map((s) => ({ input: patch, left: spec.patch.left - s, top: 0 }))).png().toBuffer();
for (const sub of ["", "lit"]) {
  const own = await sharp(readFileSync(path.join(dir, "plain", sub, "strip@3x.png"))).extract({ left: spec.patch.left, top: 0, width: pw, height: H }).ensureAlpha().composite([{ input: feather, blend: "dest-in" }]).png().toBuffer();
  const full = await sharp(wall)
    .composite([{ input: own, left: spec.patch.left - spec.lamp, top: 0 }, ...seal, { input: melt }])
    .flatten({ background: `rgb(${spec.card})` }).png().toBuffer();
  for (const [name, w, h] of SIZES) writeFileSync(path.join(dir, sub, name), w === W ? full : await sharp(full).resize(w, h, { kernel: "lanczos3" }).png().toBuffer());
}

// The logo at the top of the card, in the same gold.
for (const name of ["logo.png", "logo@2x.png", "logo@3x.png"]) {
  const from = path.join(dir, name); // recoloured in place: only the colour changes, so running this twice is safe
  if (!existsSync(from)) continue;
  const g = await sharp(from).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < g.info.width * g.info.height; i++) { g.data[i * 4] = spec.gold[0]; g.data[i * 4 + 1] = spec.gold[1]; g.data[i * 4 + 2] = spec.gold[2]; }
  writeFileSync(path.join(dir, name), await sharp(g.data, { raw: { width: g.info.width, height: g.info.height, channels: 4 } }).png().toBuffer());
}
console.log(`drew the arcade for ${venue}`);
