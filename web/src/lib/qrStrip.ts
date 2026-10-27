import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";
import { brandColors } from "./brand";

/**
 * Preview only: the venue's marble strip with the guest's QR drawn onto it, on a cream tile
 * (like the web card). Returns strip.png / @2x / @3x for the pass. Apple's own barcode box is then left out.
 *
 * Layout (strip is 375 x 123 pt): Wallet scales the strip to the card height and crops the sides (about 27 pt each side
 * on a 393 pt iPhone), so the tile sits inside the safe zone, 40 pt from the left edge, 92 pt square, centred vertically.
 * The base image passes/<venue>/qr/strip-base@3x.png leaves that slot empty and has the gold name centred in the free space
 * to the right of it (source: design/templates/wallet-royal/strip-qr.html). Without that file the normal strip is used.
 */
export async function qrStripImages(venueSlug: string, qrText: string): Promise<Record<string, Buffer>> {
  const dir = path.join(process.cwd(), "passes", venueSlug);
  const custom = path.join(dir, "qr", "strip-base@3x.png");
  const base = readFileSync(existsSync(custom) ? custom : path.join(dir, "strip@3x.png"));
  const { width = 1125, height = 369 } = await sharp(base).metadata();
  const tile = Math.round((height * 92) / 123); // square cream tile
  const pad = Math.round((height - tile) / 2);
  const qrSize = Math.round(tile * 0.84);
  const { bg, text } = brandColors();
  const qr = await QRCode.toBuffer(qrText, { margin: 0, width: qrSize, errorCorrectionLevel: "M", color: { dark: bg, light: text } });
  const r = Math.round(tile * 0.1);
  const tileSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}"><rect width="${tile}" height="${tile}" rx="${r}" ry="${r}" fill="${text}"/></svg>`,
  );
  const left = Math.round((width * 40) / 375);
  const full = await sharp(base)
    .composite([
      { input: tileSvg, left, top: pad },
      { input: qr, left: left + Math.round((tile - qrSize) / 2), top: pad + Math.round((tile - qrSize) / 2) },
    ])
    .png()
    .toBuffer();
  const at = (scale: number) => sharp(full).resize(Math.round((width * scale) / 3), Math.round((height * scale) / 3)).png().toBuffer();
  return { "strip@3x.png": full, "strip@2x.png": await at(2), "strip.png": await at(1) };
}
