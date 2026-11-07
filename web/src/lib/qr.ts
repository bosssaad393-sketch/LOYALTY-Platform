// QR codes drawn as one SVG path. Pure (no React, no server), so the owner app, the QR kit and the dev screens share it.
import QRCode from "qrcode";

/**
 * One SVG path for the dark modules of a QR matrix (size x size, row by row, truthy = dark).
 * The caller draws it with fill="currentColor" on a light plate and leaves the quiet zone around it.
 * Runs of dark modules in a row become one rectangle, which keeps the path short.
 */
export function qrPath(size: number, data: ArrayLike<number | boolean>): string {
  let d = "";
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!data[y * size + x]) { x++; continue; }
      const start = x;
      while (x < size && data[y * size + x]) x++;
      d += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  }
  return d;
}

/** The code for a text as one path. Level Q still scans with a scratch or a drink ring on a printed card. */
export function qrShape(text: string): { size: number; d: string } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "Q" });
  return { size: modules.size, d: qrPath(modules.size, modules.data) };
}

/** Modules of white border around the code, as the QR standard asks for. */
export const QR_QUIET = 4;
