// Design exploration: QR code styles for LOYALTY cards and posters, and a scan test for each.
// Renders every variant to PNG (public/design/qr/png/) and decodes it with jsQR, the decoder the staff
// scanner uses, at several sizes and after a simulated phone-camera capture. Writes results.json next to the PNGs.
//
//   node scripts/qr-variants.mjs            (from web/)
//
// Sample data only: the till payload follows the card page ("LOYALTY:<venue>:<code>"), the join link uses
// example.com because the hosted address is not decided yet. Colours come from the BRAND_* settings when set,
// otherwise the N10 values, so the same script works for any client.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";
import jsQR from "jsqr";
import { qrDesignPage } from "./qr-design-page.mjs";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public", "design", "qr", "png");
mkdirSync(out, { recursive: true });

const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v ?? "") ? v : d);
const C = {
  ink: hex(process.env.BRAND_BG, "#0a0710"), // dark modules
  bone: hex(process.env.BRAND_TEXT, "#f7f0e1"), // light plate
  gold: hex(process.env.BRAND_ACCENT, "#f0cf8a"),
};
const venue = process.env.BRAND_DEFAULT_VENUE || "n10";
const crest = readFileSync(path.join(root, "public", "venues", venue, "crest.png")).toString("base64");

const PAYLOAD = { till: `LOYALTY:${venue}:4821`, join: `https://example.com/join/${venue}` };

// ---- drawing ---------------------------------------------------------------------------------------------------
const QUIET = 4;
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
 * opts: ec, fg, bg, modules ("square" | "dot"), finder ("square" | "soft"), mark (0..1 share of the code width for a
 * centre crest tile, 0 = none), radius (plate corner radius in modules).
 */
function svgFor(text, opts, px) {
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
    ? `<rect x="${m0}" y="${m0}" width="${markW}" height="${markW}" rx="${markW * 0.22}" fill="${C.ink}"/>` +
      `<image x="${m0 + markW * 0.14}" y="${m0 + markW * 0.14}" width="${markW * 0.72}" height="${markW * 0.72}" href="data:image/png;base64,${crest}"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="${-QUIET} ${-QUIET} ${full} ${full}" shape-rendering="${opts.modules === "dot" || opts.finder === "soft" ? "geometricPrecision" : "crispEdges"}">` +
    `<rect x="${-QUIET}" y="${-QUIET}" width="${full}" height="${full}" rx="${opts.radius ?? 0}" fill="${opts.bg}"/>` +
    `<g fill="${opts.fg}">${body}</g>${fin}${mark}</svg>`;
  return { svg, n, markArea: markW ? (markW * markW) / (n * n) : 0 };
}

// ---- the variants ----------------------------------------------------------------------------------------------
export const VARIANTS = [
  { id: "a-plate", name: "Plate", use: "till", note: "Square modules, ink on a bone plate, full quiet zone. The plain, safe baseline.", ec: "Q", fg: C.ink, bg: C.bone, modules: "square", finder: "square", radius: 1.2 },
  { id: "b-soft", name: "Soft corners", use: "till", note: "Square modules, finder eyes with softened corners. Same contrast as the plate, a little more crafted.", ec: "Q", fg: C.ink, bg: C.bone, modules: "square", finder: "soft", radius: 1.2 },
  { id: "c-dots", name: "Dots", use: "reject", note: "Round modules and soft eyes. Rejected: jsQR misses it at some sizes even at level H with near-touching dots (tried r 0.44 and 0.48 of a module).", ec: "H", fg: C.ink, bg: C.bone, modules: "dot", finder: "soft", radius: 1.2 },
  { id: "d-gold", name: "Gold plate", use: "poster", note: "Ink modules on a gold plate. Keeps dark-on-light polarity, so every camera and our scanner read it.", ec: "Q", fg: C.ink, bg: C.gold, modules: "square", finder: "soft", radius: 1.2 },
  { id: "e-crest", name: "Crest centre", use: "poster", note: "Soft-corner code with the venue crest on a small ink tile in the middle (about 6 to 7% of the code). Level H covers the hidden modules.", ec: "H", fg: C.ink, bg: C.bone, modules: "square", finder: "soft", mark: 0.23, radius: 1.2 },
  { id: "f-inverted", name: "Gold on black (inverted)", use: "reject", note: "Gold modules on black. Rejected: the polarity is inverted. Our staff scanner (jsQR with dontInvert) never reads it; other decoders only when they try both polarities.", ec: "Q", fg: C.gold, bg: C.ink, modules: "square", finder: "square", radius: 1.2 },
];

// ---- scan test --------------------------------------------------------------------------------------------------
async function decode(png, inversion) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height, { inversionAttempts: inversion })?.data ?? null;
}

/** A rough phone capture: the code sits on a dark surround, is softened, shrunk, and saved as a low-quality JPEG. */
async function cameraShot(svg, px) {
  const big = await sharp(Buffer.from(svg)).png().toBuffer();
  const framed = await sharp({ create: { width: px * 2, height: px * 2, channels: 3, background: "#1a1418" } })
    .composite([{ input: await sharp(big).resize(px).toBuffer(), left: Math.round(px / 2), top: Math.round(px / 2) }])
    .png().toBuffer();
  return sharp(framed).blur(1.1).modulate({ brightness: 0.9 }).jpeg({ quality: 45 }).toBuffer();
}

const SIZES = [96, 128, 192, 320, 600];
const results = [];
for (const v of VARIANTS) {
  for (const [use, text] of Object.entries(PAYLOAD)) {
    const row = { id: v.id, payload: use, clean: {}, camera: {}, cameraAnyPolarity: {} };
    const big = svgFor(text, v, 1200);
    row.modules = big.n;
    row.markArea = Math.round(big.markArea * 1000) / 10;
    await sharp(Buffer.from(big.svg)).png().toFile(path.join(out, `${v.id}-${use}.png`));
    for (const px of SIZES) {
      const { svg } = svgFor(text, v, px);
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      row.clean[px] = (await decode(png, "dontInvert")) === text;
      const shot = await cameraShot(svg, px);
      row.camera[px] = (await decode(shot, "dontInvert")) === text;
      row.cameraAnyPolarity[px] = (await decode(shot, "attemptBoth")) === text;
    }
    results.push(row);
  }
}

writeFileSync(path.join(out, "results.json"), JSON.stringify({ generated: new Date().toISOString(), colours: C, payloads: PAYLOAD, sizes: SIZES, variants: VARIANTS.map(({ id, name, use, note, ec }) => ({ id, name, use, note, ec })), results }, null, 2));

const mark = (o) => SIZES.map((s) => (o[s] ? "ok" : "--").padStart(4)).join("");
console.log(`sizes (px):                        ${SIZES.map((s) => String(s).padStart(4)).join("")}`);
for (const r of results) {
  console.log(`${(r.id + " " + r.payload).padEnd(22)} clean     ${mark(r.clean)}`);
  console.log(`${"".padEnd(22)} camera    ${mark(r.camera)}   any polarity ${mark(r.cameraAnyPolarity)}`);
}

writeFileSync(path.join(root, "public", "design", "qr", "index.html"), qrDesignPage({ C, venue, VARIANTS, SIZES, results }));
console.log("wrote public/design/qr/index.html");
