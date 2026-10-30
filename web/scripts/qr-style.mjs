// Shared QR drawing and scan-test helpers for the design scripts (qr-variants.mjs, poster.mjs).
// One place for the approved styles, so the poster and the exploration can never drift apart.
import { readFileSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";
import jsQR from "jsqr";

export const root = path.resolve(import.meta.dirname, "..");

const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v ?? "") ? v : d);
/** The brand colours from BRAND_* (as in lib/brand.ts), with the N10 values as the fallback. */
export function brandColours(env = process.env) {
  return { ink: hex(env.BRAND_BG, "#0a0710"), bone: hex(env.BRAND_TEXT, "#f7f0e1"), gold: hex(env.BRAND_ACCENT, "#f0cf8a") };
}
export const brandVenue = (env = process.env) => env.BRAND_DEFAULT_VENUE || "n10";
export const crestBase64 = (venue) => readFileSync(path.join(root, "public", "venues", venue, "crest.png")).toString("base64");

// ---- drawing ---------------------------------------------------------------------------------------------------
export const QUIET = 4; // modules of light margin on every side
const inFinder = (x, y, n) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
const finders = (n) => [[0, 0], [n - 7, 0], [0, n - 7]];

function finderSquare([x, y], fg) {
  return `<path fill="${fg}" fill-rule="evenodd" d="M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5z"/><rect fill="${fg}" x="${x + 2}" y="${y + 2}" width="3" height="3"/>`;
}
function finderSoft([x, y], fg) {
  // Outer ring with soft corners, inner eye as a rounded square. Proportions stay 1:1:3:1:1 (what decoders look for).
  return `<path fill="${fg}" fill-rule="evenodd" d="M${x + 1.6} ${y}h3.8a1.6 1.6 0 0 1 1.6 1.6v3.8a1.6 1.6 0 0 1-1.6 1.6h-3.8a1.6 1.6 0 0 1-1.6-1.6v-3.8a1.6 1.6 0 0 1 1.6-1.6zM${x + 1.8} ${y + 1}h3.4a.8 .8 0 0 1 .8 .8v3.4a.8 .8 0 0 1-.8 .8h-3.4a.8 .8 0 0 1-.8-.8v-3.4a.8 .8 0 0 1 .8-.8z"/><rect fill="${fg}" x="${x + 2}" y="${y + 2}" width="3" height="3" rx=".7"/>`;
}

/**
 * The QR as an SVG string, `px` wide including the quiet zone.
 * opts: ec, fg, bg, modules ("square" | "dot"), finder ("square" | "soft"), radius (plate corners, in modules),
 * mark (0..1 share of the code width for a centre crest tile, 0 = none), markFill (tile colour), crest (PNG base64).
 */
export function svgFor(text, opts, px) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: opts.ec });
  const n = modules.size;
  const full = n + QUIET * 2;
  const markW = opts.mark ? Math.round(n * opts.mark) | 1 : 0; // odd module count keeps it centred
  const m0 = (n - markW) / 2;
  const underMark = (x, y) => markW && x >= m0 - 1 && x < m0 + markW + 1 && y >= m0 - 1 && y < m0 + markW + 1;
  let body = "";
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!modules.data[y * n + x] || inFinder(x, y, n) || underMark(x, y)) continue;
      if (opts.modules === "dot") body += `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.48"/>`;
      else d += `M${x} ${y}h1v1h-1z`;
    }
  }
  if (d) body += `<path d="${d}"/>`;
  const fin = finders(n).map((p) => (opts.finder === "soft" ? finderSoft(p, opts.fg) : finderSquare(p, opts.fg))).join("");
  const mark = markW
    ? `<rect x="${m0}" y="${m0}" width="${markW}" height="${markW}" rx="${markW * 0.22}" fill="${opts.markFill ?? opts.fg}"/>` +
      (opts.crest ? `<image x="${m0 + markW * 0.14}" y="${m0 + markW * 0.14}" width="${markW * 0.72}" height="${markW * 0.72}" href="data:image/png;base64,${opts.crest}"/>` : "")
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="${-QUIET} ${-QUIET} ${full} ${full}" shape-rendering="${opts.modules === "dot" || opts.finder === "soft" ? "geometricPrecision" : "crispEdges"}">` +
    `<rect x="${-QUIET}" y="${-QUIET}" width="${full}" height="${full}" rx="${opts.radius ?? 0}" fill="${opts.bg}"/>` +
    `<g fill="${opts.fg}">${body}</g>${fin}${mark}</svg>`;
  return { svg, n, markArea: markW ? (markW * markW) / (n * n) : 0 };
}

// ---- the styles ------------------------------------------------------------------------------------------------
export function variants(C, crest) {
  return [
    { id: "a-plate", name: "Plate", use: "till", note: "Square modules, ink on a bone plate, full quiet zone. The plain, safe baseline.", ec: "Q", fg: C.ink, bg: C.bone, modules: "square", finder: "square", radius: 1.2 },
    { id: "b-soft", name: "Soft corners", use: "till", note: "Square modules, finder eyes with softened corners. Same contrast as the plate, a little more crafted.", ec: "Q", fg: C.ink, bg: C.bone, modules: "square", finder: "soft", radius: 1.2 },
    { id: "c-dots", name: "Dots", use: "reject", note: "Round modules and soft eyes. Rejected: jsQR misses it at some sizes even at level H with near-touching dots (tried r 0.44 and 0.48 of a module).", ec: "H", fg: C.ink, bg: C.bone, modules: "dot", finder: "soft", radius: 1.2 },
    { id: "d-gold", name: "Gold plate", use: "poster", note: "Ink modules on a gold plate. Keeps dark-on-light polarity, so every camera and our scanner read it.", ec: "Q", fg: C.ink, bg: C.gold, modules: "square", finder: "soft", radius: 1.2 },
    { id: "e-crest", name: "Crest centre", use: "poster", note: "Soft-corner code with the venue crest on a small ink tile in the middle (about 6 to 7% of the code). Level H covers the hidden modules.", ec: "H", fg: C.ink, bg: C.bone, modules: "square", finder: "soft", mark: 0.23, markFill: C.ink, crest, radius: 1.2 },
    { id: "f-inverted", name: "Gold on black (inverted)", use: "reject", note: "Gold modules on black. Rejected: the polarity is inverted. Our staff scanner (jsQR with dontInvert) never reads it; other decoders only when they try both polarities.", ec: "Q", fg: C.gold, bg: C.ink, modules: "square", finder: "square", radius: 1.2 },
  ];
}

// ---- scan test --------------------------------------------------------------------------------------------------
/** Decoded text of a PNG/JPEG buffer or file, or null. "dontInvert" = how the staff scanner is set. */
export async function decode(input, inversion = "dontInvert") {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height, { inversionAttempts: inversion })?.data ?? null;
}

/** A rough phone capture of an image: softened, dimmed and saved as a JPEG at quality 40-45. */
export async function cameraCapture(input, { quality = 45, surround = null } = {}) {
  let img = await sharp(input).png().toBuffer();
  if (surround) {
    const { width, height } = await sharp(img).metadata();
    img = await sharp({ create: { width: width * 2, height: height * 2, channels: 3, background: surround } })
      .composite([{ input: img, left: Math.round(width / 2), top: Math.round(height / 2) }]).png().toBuffer();
  }
  return sharp(img).blur(1.1).modulate({ brightness: 0.9 }).jpeg({ quality }).toBuffer();
}
