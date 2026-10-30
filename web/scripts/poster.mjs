// Print files for the approved "Join our rewards" poster (Crest centre QR, level H) and a square QR sticker.
//
//   node scripts/poster.mjs                         (from web/, Windows: uses Microsoft Edge to render)
//   node scripts/poster.mjs --url=https://rewards.example.com/join/n10
//   JOIN_URL=https://... node scripts/poster.mjs
//
// The join link is the ONLY place the live address lives: --url wins, then JOIN_URL, then the default below.
// Writes public/design/poster/: PNG (300 dpi) and PDF for A5 and A4, each with and without a 3 mm bleed, a 100 x 100 mm
// sticker PNG, the HTML sources (src/), and report.json with the scan test and the printed QR sizes.
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import jsQR from "jsqr";
import { QUIET, brandColours, brandVenue, cameraCapture, crestBase64, decode, root, svgFor, variants } from "./qr-style.mjs";

const DEFAULT_JOIN_URL = "https://loyalty-platform-steel.vercel.app/join/n10";
const arg = process.argv.find((a) => a.startsWith("--url="))?.slice(6);
const JOIN_URL = (arg || process.env.JOIN_URL || DEFAULT_JOIN_URL).trim();
if (!/^https:\/\/[^\s/]+\/\S*$/i.test(JOIN_URL)) throw new Error(`The join link must be a full https:// address, got: ${JOIN_URL}`);

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DPI = 300;
const BLEED = 3; // mm on every side
const SAFE = 8; // mm: text and QR stay at least this far inside the trim
const px = (mm) => Math.round((mm * DPI) / 25.4);

const C = brandColours();
const venue = brandVenue();
const crest = crestBase64(venue);
const style = variants(C, crest).find((v) => v.id === "e-crest"); // the approved style
const code = svgFor(JOIN_URL, style, 1000);
const qr = code.svg.replace(/ width="1000" height="1000"/, ' width="100%" height="100%"');

const out = path.join(root, "public", "design", "poster");
const src = path.join(out, "src");
mkdirSync(src, { recursive: true });
copyFileSync(path.join(root, "public", "venues", venue, "marble.jpg"), path.join(src, "marble.jpg"));
copyFileSync(path.join(root, "public", "venues", venue, "crest.png"), path.join(src, "crest.png"));

// ---- layout ----------------------------------------------------------------------------------------------------
// The approved table-tent design, set in millimetres. Proportions are shares of the trim width (A5 = 148 mm), as in
// the design page: padding 10/11/10%, crest 20%, title 8.4%, subtitle 4.4%, footer 3.8%, gold frame 3.6% in. The QR is 51%
// (the design page asks for 54%, but A5 is a little taller-narrow than the tent, so the browser shrank it to about 51% there;
// it is fixed here so the printed size is exactly what report.json says).
function posterHtml({ w, h, bleed }) {
  const k = w / 100; // 1% of the trim width, in mm
  const mm = (n) => `${(n * k).toFixed(2)}mm`;
  const pw = w + bleed * 2;
  const ph = h + bleed * 2;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Join our rewards ${w}x${h} mm${bleed ? " with bleed" : ""}</title>
<style>
  @page { size: ${pw}mm ${ph}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${pw}mm; height: ${ph}mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { position: relative; overflow: hidden; color: ${C.bone}; font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    /* the marble runs to the paper edge, so with bleed it simply extends past the trim */
    background: linear-gradient(180deg, rgba(10,7,16,.55), rgba(10,7,16,.92) 55%), url(marble.jpg) 70% 20% / cover, ${C.ink}; }
  .trim { position: absolute; left: ${bleed}mm; top: ${bleed}mm; width: ${w}mm; height: ${h}mm; padding: ${mm(10)} ${mm(11)} ${mm(10)};
    display: flex; flex-direction: column; align-items: center; text-align: center; }
  .trim::after { content: ""; position: absolute; inset: ${mm(3.6)}; border: 0.3mm solid color-mix(in srgb, ${C.gold} 45%, transparent); }
  .crest { width: ${mm(20)}; height: auto; }
  h1 { margin-top: ${mm(5)}; font: 600 ${mm(8.4)}/1.1 Georgia, "Times New Roman", serif; }
  p { margin-top: ${mm(2.6)}; font-size: ${mm(4.4)}; line-height: 1.4; color: color-mix(in srgb, ${C.bone} 74%, ${C.ink}); }
  .qr { flex: none; margin-top: ${mm(6)}; width: ${mm(51)}; height: ${mm(51)}; border-radius: ${mm(2.4)}; overflow: hidden; }
  .qr svg { display: block; }
  .how { margin-top: auto; padding-top: ${mm(5)}; font-size: ${mm(3.8)}; color: color-mix(in srgb, ${C.bone} 56%, ${C.ink}); }
</style></head>
<body><div class="trim">
  <img class="crest" src="crest.png" alt="">
  <h1>Join our rewards</h1>
  <p>Your card lives in your phone&rsquo;s Wallet.<br>Nothing to download.</p>
  <div class="qr">${qr}</div>
  <p class="how">Point your camera at the code.<br>Powered by LOYALTY</p>
</div><script>if (location.search.includes("png")) document.documentElement.style.zoom = String(300 / 96);</script></body></html>`;
}

// The square sticker for the door, tables and NFC plates: the QR plate, the crest above it, one line under it.
function stickerHtml({ w }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Join QR sticker ${w} mm</title>
<style>
  @page { size: ${w}mm ${w}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${w}mm; height: ${w}mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3.5mm; color: ${C.bone};
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    background: linear-gradient(180deg, rgba(10,7,16,.6), rgba(10,7,16,.9)), url(marble.jpg) 70% 20% / cover, ${C.ink}; }
  .crest { width: 14mm; height: auto; }
  .qr { flex: none; width: 56mm; height: 56mm; border-radius: 2.8mm; overflow: hidden; }
  .qr svg { display: block; }
  p { font-size: 4.2mm; color: color-mix(in srgb, ${C.bone} 74%, ${C.ink}); }
</style></head>
<body>
  <img class="crest" src="crest.png" alt="">
  <div class="qr">${qr}</div>
  <p>Point your camera at the code.</p>
<script>if (location.search.includes("png")) document.documentElement.style.zoom = String(300 / 96);</script>
</body></html>`;
}

// ---- what to make -------------------------------------------------------------------------------------------------
const JOBS = [
  { id: "poster-A5", w: 148, h: 210, bleed: 0, pdf: true },
  { id: "poster-A5-bleed3mm", w: 148, h: 210, bleed: BLEED, pdf: true },
  { id: "poster-A4", w: 210, h: 297, bleed: 0, pdf: true },
  { id: "poster-A4-bleed3mm", w: 210, h: 297, bleed: BLEED, pdf: true },
  { id: "sticker-100mm", w: 100, h: 100, bleed: 0, pdf: false, sticker: true },
];

async function edge(args) {
  const profile = mkdtempSync(path.join(tmpdir(), "edge-poster-"));
  await promisify(execFile)(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--user-data-dir=${profile}`, "--timeout=5000", ...args]);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* Edge may still hold its temp profile */ }
}

/** Edge can hand the work to a background process and return before the file is written: wait until it is complete. */
async function waitFile(file, ms = 60_000) {
  const until = Date.now() + ms;
  let last = -1;
  while (Date.now() < until) {
    const size = existsSync(file) ? statSync(file).size : -1;
    if (size > 0 && size === last) return;
    last = size;
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error(`Edge did not write ${file}`);
}

/** Page count and page size (mm) of a PDF Edge wrote. Edge writes plain /Type /Page objects and /MediaBox arrays. */
function pdfInfo(file) {
  const t = readFileSync(file).toString("latin1");
  const pages = (t.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  const box = t.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
  const toMm = (pt) => Math.round(((pt * 25.4) / 72) * 10) / 10;
  return { pages, widthMm: box ? toMm(box[3] - box[1]) : null, heightMm: box ? toMm(box[4] - box[2]) : null };
}

/**
 * The printed size of the code, measured in the PNG itself: jsQR reports the corners of the symbol it decoded
 * (the black area, without the quiet zone). The light plate adds the four-module quiet zone on each side.
 */
async function measureQr(file, n) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const hit = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height, { inversionAttempts: "dontInvert" });
  if (!hit) return null;
  const { topLeftCorner: a, topRightCorner: b } = hit.location;
  const symbolPx = Math.hypot(b.x - a.x, b.y - a.y);
  const toMm = (p) => Math.round(((p * 25.4) / DPI) * 10) / 10;
  return { symbolMm: toMm(symbolPx), plateMm: toMm((symbolPx * (n + 2 * QUIET)) / n), modules: n, moduleMm: toMm(symbolPx / n) };
}

// Edge here will not screenshot file:// pages, so serve src/ on a private local port while the files are made.
const TYPES = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg" };
const server = createServer((req, res) => {
  const name = path.basename(decodeURIComponent(new URL(req.url, "http://x").pathname));
  let body;
  try { body = readFileSync(path.join(src, name)); } catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(name)] ?? "application/octet-stream" }).end(body);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;

const report = { joinUrl: JOIN_URL, style: style.id, errorCorrection: style.ec, dpi: DPI, files: [] };
for (const job of JOBS) {
  const html = job.sticker ? stickerHtml(job) : posterHtml(job);
  const htmlFile = path.join(src, `${job.id}.html`);
  writeFileSync(htmlFile, html);
  const url = `${base}/${job.id}.html`;
  const pw = job.w + job.bleed * 2;
  const ph = job.h + job.bleed * 2;
  const png = path.join(out, `${job.id}.png`);
  rmSync(png, { force: true });
  // ?png zooms the page to 300 dpi (1 mm = 11.81 px), so the window is the final pixel size at scale 1.
  await edge([`--window-size=${px(pw)},${px(ph)}`, "--force-device-scale-factor=1", `--screenshot=${png}`, `${url}?png`]);
  await waitFile(png);
  // Rounding can leave a pixel either way: make the file exactly the 300 dpi size and tag it as 300 dpi.
  const buf = await sharp(png).resize(px(pw), px(ph), { fit: "fill" }).withMetadata({ density: DPI }).png().toBuffer();
  writeFileSync(png, buf);

  const entry = { file: `${job.id}.png`, trimMm: [job.w, job.h], bleedMm: job.bleed, pagePx: [px(pw), px(ph)] };
  if (job.pdf) {
    const pdf = path.join(out, `${job.id}.pdf`);
    rmSync(pdf, { force: true });
    for (let attempt = 1; ; attempt++) {
      await edge(["--no-pdf-header-footer", `--print-to-pdf=${pdf}`, url]);
      try { await waitFile(pdf, 90_000); break; } catch (e) { if (attempt >= 3) throw e; console.log(`retrying ${job.id}.pdf`); }
    }
    entry.pdf = { file: `${job.id}.pdf`, ...pdfInfo(pdf), expectedMm: [pw, ph], bytes: statSync(pdf).size };
  }

  // scan test: full size, 400 px wide, and a camera-like capture (blur, dimming, JPEG q40)
  const small = await sharp(png).resize(400).png().toBuffer();
  entry.decode = {
    full: (await decode(png)) === JOIN_URL,
    width400: (await decode(small)) === JOIN_URL,
    camera: (await decode(await cameraCapture(await sharp(png).resize(1200).png().toBuffer(), { quality: 40 }))) === JOIN_URL,
    camera400: (await decode(await cameraCapture(small, { quality: 40 }))) === JOIN_URL,
  };
  entry.qr = { ...(await measureQr(png, code.n)), layoutPlateMm: job.sticker ? 56 : Math.round(job.w * 0.51 * 10) / 10 };
  entry.bytes = statSync(png).size;
  report.files.push(entry);
}

// Safety: the layout keeps text and the QR inside these distances from the trim (from the numbers in posterHtml).
for (const f of report.files.filter((f) => f.file.startsWith("poster"))) {
  const w = f.trimMm[0];
  f.safe = { sideMm: Math.round(w * 0.11 * 10) / 10, topMm: Math.round(w * 0.1 * 10) / 10, bottomMm: Math.round(w * 0.1 * 10) / 10 };
  f.qr.safeMarginOk = Math.min(f.safe.sideMm, f.safe.topMm, f.safe.bottomMm) >= SAFE;
}
const st = report.files.find((f) => f.file.startsWith("sticker"));
// crest 14 + gap 3.5 + QR 56 + gap 3.5 + one line of 4.2 mm type (line height about 1.2)
st.safe = { sideMm: (100 - 56) / 2, topBottomMm: Math.round(((100 - (14 + 3.5 + 56 + 3.5 + 4.2 * 1.2)) / 2) * 10) / 10 };
st.qr.safeMarginOk = Math.min(st.safe.sideMm, st.safe.topBottomMm) >= SAFE;

server.close();
writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(`join link: ${JOIN_URL}`);
for (const f of report.files) {
  console.log(`${f.file.padEnd(26)} ${f.pagePx.join("x").padEnd(10)} QR plate ${String(f.qr.plateMm).padStart(5)} mm, symbol ${f.qr.symbolMm} mm (layout ${f.qr.layoutPlateMm})  decode full ${f.decode.full} 400px ${f.decode.width400} camera ${f.decode.camera} camera@400 ${f.decode.camera400}  safe ${f.qr.safeMarginOk}${f.pdf ? `  pdf pages ${f.pdf.pages} ${f.pdf.widthMm}x${f.pdf.heightMm} mm` : ""}`);
}
