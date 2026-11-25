#!/usr/bin/env node
/**
 * The member card as a photograph: one wide picture of the client's own subject (for Al Roshinah, the arched wall
 * niche its name comes from) becomes the face of the card on the web and the strip of the Apple Wallet pass, in two
 * states: at rest, and "lit" when a gift is waiting.
 *
 *   node scripts/card-art-photo.mjs --slug roshinah --src ../design/roshinah/wall-niche.jpeg \
 *     --lit ../design/roshinah/wall-niche-lit.jpeg --niche 60.5,20,32,64
 *
 * --niche x,y,w,h: where the subject's open space sits ON THE WEB CARD, in percent of the card (the card is the right
 * part of the picture, cut to 428 x 270). The page sets the visit count there.
 *
 * Writes public/venues/<slug>/card.webp, card-lit.webp, card.json and passes/<slug>/strip*.png, lit/strip*.png
 * (375 x 144 pt at 1x, 2x, 3x, with the transparent margins and rounded corners the pass layout expects).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const next = process.argv[i + 1];
  if (!next || next.startsWith("--")) args[a.slice(2)] = true;
  else { args[a.slice(2)] = next; i++; }
}
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1); };
const slug = String(args.slug ?? "").toLowerCase();
if (!/^[a-z0-9-]+$/.test(slug)) fail("Missing or bad --slug");
const src = args.src && path.resolve(String(args.src));
const lit = args.lit && path.resolve(String(args.lit));
if (!src || !existsSync(src)) fail("Missing --src <picture>");
if (lit && !existsSync(lit)) fail("--lit picture not found");
const niche = String(args.niche ?? "60,20,32,64").split(",").map(Number);
if (niche.length !== 4 || niche.some((n) => !Number.isFinite(n))) fail("--niche needs x,y,w,h in percent");

const CARD = { w: 428, h: 270 };
const STRIP = { w: 375, h: 144 };

/** The right part of the picture at the card's proportions, full height. */
async function cardFace(file) {
  const m = await sharp(file).metadata();
  const w = Math.min(m.width, Math.round((m.height * CARD.w) / CARD.h));
  return sharp(file).extract({ left: m.width - w, top: 0, width: w, height: m.height }).resize(CARD.w * 3, CARD.h * 3).webp({ quality: 84 }).toBuffer();
}

/** Wallet strip: the whole width of the picture as a rounded card with transparent margins. */
async function strip(file, s) {
  const mx = 18 * s, my = 6 * s, r = 14 * s;
  const w = STRIP.w * s, h = STRIP.h * s, iw = w - 2 * mx, ih = h - 2 * my;
  const m = await sharp(file).metadata();
  const ch = Math.min(m.height, Math.round((m.width * ih) / iw));
  const inner = await sharp(file).extract({ left: 0, top: Math.round((m.height - ch) / 2), width: m.width, height: ch }).resize(iw, ih).png().toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="${ih}"><rect width="${iw}" height="${ih}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
  const rounded = await sharp(inner).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: rounded, left: mx, top: my }]).png().toBuffer();
}

function save(file, buf) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, buf);
  console.log("  wrote", path.relative(root, file));
}

const pub = path.join(root, "public", "venues", slug);
const pass = path.join(root, "passes", slug);
save(path.join(pub, "card.webp"), await cardFace(src));
if (lit) save(path.join(pub, "card-lit.webp"), await cardFace(lit));
save(path.join(pub, "card.json"), Buffer.from(JSON.stringify({ niche: { x: niche[0], y: niche[1], w: niche[2], h: niche[3] }, lit: Boolean(lit) }, null, 2) + "\n"));
for (const s of [1, 2, 3]) {
  const sfx = s === 1 ? "" : `@${s}x`;
  save(path.join(pass, `strip${sfx}.png`), await strip(src, s));
  if (lit) save(path.join(pass, "lit", `strip${sfx}.png`), await strip(lit, s));
}
