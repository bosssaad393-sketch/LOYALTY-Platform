// Design exploration: QR code styles for LOYALTY cards and posters, and a scan test for each.
// Renders every variant to PNG (public/design/qr/png/) and decodes it with jsQR, the decoder the staff
// scanner uses, at several sizes and after a simulated phone-camera capture. Writes results.json next to the PNGs.
//
//   node scripts/qr-variants.mjs            (from web/)
//
// Sample data only: the till payload follows the card page ("LOYALTY:<venue>:<code>"), the join link uses
// example.com because the hosted address is not decided yet. Colours come from the BRAND_* settings when set,
// otherwise the N10 values, so the same script works for any client.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { qrDesignPage } from "./qr-design-page.mjs";
import { brandColours, brandVenue, cameraCapture, crestBase64, decode, root, svgFor, variants } from "./qr-style.mjs";

const out = path.join(root, "public", "design", "qr", "png");
mkdirSync(out, { recursive: true });

const C = brandColours();
const venue = brandVenue();
const VARIANTS = variants(C, crestBase64(venue));
const PAYLOAD = { till: `LOYALTY:${venue}:4821`, join: `https://example.com/join/${venue}` };

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
      const shot = await cameraCapture(png, { surround: "#1a1418" });
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
