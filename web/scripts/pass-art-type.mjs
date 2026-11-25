#!/usr/bin/env node
/**
 * Apple Wallet images for a client who has no clean logo file yet: the name set in type, in a thin frame, on the
 * client's own colour. A stand-in that never pretends to be the logo; when the real logo arrives, replace logo*.png
 * and icon*.png (or run new-client.mjs with --logo) and keep the rest.
 *
 *   node scripts/pass-art-type.mjs --slug roshinah --name "Al Roshinah" --name-ar "الروشنة" \
 *     --bg "#013220" --text "#faf8f3" --accent "#c9a96e" [--initials AR] [--force]
 *
 * Writes passes/<slug>/: strip (375 x 144 pt), card/strip (375 x 123 pt), artwork (358 x 448 pt), logo (150 x 50 pt),
 * primaryLogo (30 pt), icon (29 pt), each at 1x, 2x and 3x. The strip keeps transparent margins and rounded corners
 * (tests/passStripFiles.test.ts). Text is drawn with the fonts in passes/_fonts (Libre Baskerville, Noto Naskh Arabic,
 * both SIL Open Font License), never with system fonts, so the result is the same on every machine.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FONTS = path.join(root, "passes", "_fonts");
const SERIF = path.join(FONTS, "LibreBaskerville.ttf");
const NASKH = path.join(FONTS, "NotoNaskhArabic.ttf");

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const next = process.argv[i + 1];
  if (!next || next.startsWith("--")) args[a.slice(2)] = true;
  else { args[a.slice(2)] = next; i++; }
}
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1); };
const HEX = /^#[0-9a-f]{6}$/i;
const slug = String(args.slug ?? "").toLowerCase();
const name = String(args.name ?? "").trim();
const nameAr = typeof args["name-ar"] === "string" ? args["name-ar"].trim() : "";
const bg = String(args.bg ?? "").toLowerCase();
const text = String(args.text ?? "").toLowerCase();
const accent = String(args.accent ?? "").toLowerCase();
if (!/^[a-z0-9-]+$/.test(slug)) fail("Missing or bad --slug");
if (!name) fail('Missing --name "Client name"');
for (const [k, v] of Object.entries({ bg, text, accent })) if (!HEX.test(v)) fail(`--${k} must look like #rrggbb`);
for (const f of [SERIF, NASKH]) if (!existsSync(f)) fail(`Font missing: ${path.relative(root, f)}`);
const initials = typeof args.initials === "string" ? args.initials : name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const force = Boolean(args.force);

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => "#" + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, "0")).join("");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One line of text as a transparent PNG, in a bundled font. `track` is letter spacing in em. */
async function line(str, { font, file, px, color, track = 0 }) {
  const spacing = Math.round(px * track * 1024 * 0.75); // Pango: 1/1024 of a point, at 96 dpi 1px = 0.75pt
  const markup = `<span foreground="${color}" letter_spacing="${spacing}">${esc(str)}</span>`;
  return sharp({ text: { text: markup, font: `${font} ${px}px`, fontfile: file, rgba: true, dpi: 72 } }).png().toBuffer();
}

/** The name in spaced capitals inside a thin frame, sized to fit `w` x `h`. Transparent background. */
async function wordmark(w, h, color) {
  let px = Math.round(h * 0.34);
  let label = await line(name.toUpperCase(), { font: "Libre Baskerville", file: SERIF, px, color, track: 0.3 });
  let meta = await sharp(label).metadata();
  const room = w - Math.round(h * 0.9);
  if (meta.width > room) {
    px = Math.max(6, Math.floor((px * room) / meta.width));
    label = await line(name.toUpperCase(), { font: "Libre Baskerville", file: SERIF, px, color, track: 0.3 });
    meta = await sharp(label).metadata();
  }
  const fw = Math.min(w - 2, meta.width + Math.round(px * 2.2));
  const fh = Math.min(h - 2, Math.round(px * 2.6));
  const stroke = Math.max(1, Math.round(h / 50));
  const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="${(w - fw) / 2}" y="${(h - fh) / 2}" width="${fw}" height="${fh}" fill="none" stroke="${color}" stroke-opacity="0.85" stroke-width="${stroke}"/></svg>`);
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: frame }, { input: label, left: Math.round((w - meta.width) / 2), top: Math.round((h - meta.height) / 2) }])
    .png().toBuffer();
}

/**
 * A flat panel in the brand colour with one fine accent frame. With an Arabic name: the Arabic name large in Naskh and
 * the Latin name in small spaced capitals under it (the order of the client's own lockup, without imitating its
 * lettering). Without one: the framed Latin name.
 */
async function panel(w, h, s) {
  const inset = Math.round(8 * s);
  const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${mix(bg, "#000000", 0.18)}"/>
    <rect x="${inset}" y="${inset}" width="${w - 2 * inset}" height="${h - 2 * inset}" fill="none" stroke="${accent}" stroke-opacity="0.55" stroke-width="${Math.max(1, Math.round(s * 0.75))}"/>
  </svg>`);
  const unit = Math.min(h, w * 0.4);
  if (!nameAr) {
    const markH = Math.round(unit * 0.34);
    const mark = await wordmark(Math.round(w * 0.72), markH, text);
    return sharp(base).composite([{ input: mark, left: Math.round((w - Math.round(w * 0.72)) / 2), top: Math.round((h - markH) / 2) }]).png().toBuffer();
  }
  const ar = await line(nameAr, { font: "Noto Naskh Arabic", file: NASKH, px: Math.round(unit * 0.3), color: text });
  const la = await line(name.toUpperCase(), { font: "Libre Baskerville", file: SERIF, px: Math.round(unit * 0.075), color: mix(text, bg, 0.2), track: 0.32 });
  const [am, lm] = await Promise.all([sharp(ar).metadata(), sharp(la).metadata()]);
  const gap = Math.round(unit * 0.02);
  const top = Math.round((h - (am.height + gap + lm.height)) / 2);
  return sharp(base).composite([
    { input: ar, left: Math.round((w - am.width) / 2), top },
    { input: la, left: Math.round((w - lm.width) / 2), top: top + am.height + gap },
  ]).png().toBuffer();
}

/** Store-card strip: the panel with transparent margins and rounded corners, so the pass colour shows around it. */
async function strip(wPt, hPt, s) {
  const mx = 18 * s, my = 6 * s, r = 14 * s;
  const w = wPt * s, h = hPt * s, iw = w - 2 * mx, ih = h - 2 * my;
  const inner = await panel(iw, ih, s);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="${ih}"><rect width="${iw}" height="${ih}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
  const rounded = await sharp(inner).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: rounded, left: mx, top: my }]).png().toBuffer();
}

/** Initials in the serif on the brand colour (icon) or on transparent (primary logo). A placeholder, not a logo. */
async function initialsTile(size, solid) {
  const px = Math.round(size * 0.4);
  const label = await line(initials, { font: "Libre Baskerville", file: SERIF, px, color: text, track: 0.06 });
  const m = await sharp(label).metadata();
  const background = solid ? { r: rgb(bg)[0], g: rgb(bg)[1], b: rgb(bg)[2], alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 };
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: label, left: Math.round((size - m.width) / 2), top: Math.round((size - m.height) / 2) }]).png().toBuffer();
}

const wrote = [];
function save(rel, buf) {
  const file = path.join(root, "passes", slug, rel);
  if (existsSync(file) && !force) { console.log("  kept (exists, use --force):", path.relative(root, file)); return; }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, buf);
  wrote.push(path.relative(root, file));
}

for (const s of [1, 2, 3]) {
  const sfx = s === 1 ? "" : `@${s}x`;
  save(`strip${sfx}.png`, await strip(375, 144, s));
  save(`card/strip${sfx}.png`, await strip(375, 123, s));
  save(`artwork${sfx}.png`, await panel(358 * s, 448 * s, s));
  save(`logo${sfx}.png`, await wordmark(150 * s, 50 * s, text));
  save(`primaryLogo${sfx}.png`, await initialsTile(30 * s, false));
  save(`icon${sfx}.png`, await initialsTile(29 * s, true));
}
console.log(wrote.length ? `Wrote ${wrote.length} files:\n  ${wrote.join("\n  ")}` : "Nothing written.");
