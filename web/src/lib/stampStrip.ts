import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import type { StampState } from "./stamps";

/**
 * The stamp card look on Apple Wallet (stamp venues only, and only when the venue has passes/<slug>/stamp-card.json).
 *
 * The strip (375 x 123 pt, Apple's size for a store card) is drawn for each guest: one row per reward (3 stamps each for
 * a 3-6-9 ladder), earned stamps as filled discs carrying the venue's mark (passes/<slug>/stamp-mark.png, white on
 * transparent), empty ones as rings, and the reward named beside its row with where the guest stands (used, ready, at N).
 * Wallet crops about 27 pt off each side on some iPhones, so everything stays between x = 32 and x = 343.
 * Text is drawn with the bundled font (passes/_fonts), never system fonts, so it looks the same on every server.
 */

export type StampCardStyle = {
  background: string; foreground: string; label: string;
  stamp: string; mark: string; ring: string; text: string; sub: string;
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const KEYS = ["background", "foreground", "label", "stamp", "mark", "ring", "text", "sub"] as const;

/** The venue's stamp card colours, or null when it has none (the pass then keeps the standard look). */
export function stampCardStyle(slug: string): StampCardStyle | null {
  try {
    const raw = JSON.parse(readFileSync(path.join(process.cwd(), "passes", slug, "stamp-card.json"), "utf8")) as Record<string, unknown>;
    if (!KEYS.every((k) => typeof raw[k] === "string" && HEX.test(raw[k] as string))) return null;
    return Object.fromEntries(KEYS.map((k) => [k, raw[k]])) as StampCardStyle;
  } catch {
    return null;
  }
}

/** "#AD9152" -> "rgb(173, 145, 82)", the colour form pass.json uses. */
export const rgb = (hex: string) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;

export type RowStatus = "used" | "ready" | "next" | "later";
export type LadderRow = { at: number; text: string; filled: number; size: number; status: RowStatus };

/**
 * What each row shows, from the card's stamp state. Rewards before the one due are used this round (their row full),
 * the one due is "ready" when the card has its stamps, otherwise "next"; the rest are "later". Pure, so it is tested.
 */
export function ladderRows(st: StampState, texts: string[]): LadderRow[] {
  let prev = 0;
  return st.tiers.map((t, r) => {
    const size = t.at - prev;
    const filled = Math.max(0, Math.min(size, st.position - prev));
    const status: RowStatus = r < st.index ? "used" : r === st.index ? (st.ready ? "ready" : "next") : "later";
    prev = t.at;
    return { at: t.at, text: texts[r] ?? t.text, filled, size, status };
  });
}

/** Ladders that fit the strip: up to 3 rewards, up to 4 stamps per row. Anything else keeps the standard strip. */
export const ladderFits = (rows: LadderRow[]) => rows.length > 0 && rows.length <= 3 && rows.every((r) => r.size >= 1 && r.size <= 4);

const STATUS_TEXT: Record<RowStatus, (at: number) => string> = {
  used: () => "USED",
  ready: () => "READY · SHOW THIS CARD",
  next: (at) => `AT ${at} STAMPS`,
  later: (at) => `AT ${at} STAMPS`,
};

const FONT = () => path.join(process.cwd(), "passes", "_fonts", "Geist-Regular.ttf");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One line of text as a transparent PNG (null if text rendering is not available on this server). */
async function textImage(text: string, pt: number, color: string, scale: number, bold: boolean, maxWidthPx: number, alpha = 1): Promise<Buffer | null> {
  try {
    const markup = `<span foreground="${color}"${alpha < 1 ? ` alpha="${Math.round(alpha * 100)}%"` : ""}${bold ? ' weight="bold"' : ' letter_spacing="1200"'}>${esc(text)}</span>`;
    const img = sharp({ text: { text: markup, font: `Geist ${pt}`, fontfile: FONT(), rgba: true, dpi: 72 * scale } });
    const meta = await img.png().toBuffer({ resolveWithObject: true });
    if (meta.info.width > maxWidthPx) return await sharp(meta.data).resize({ width: maxWidthPx }).png().toBuffer();
    return meta.data;
  } catch {
    return null;
  }
}

const W = 375, H = 123;

/** strip.png, strip@2x.png, strip@3x.png for this card, or null when the ladder does not fit or drawing fails. */
export async function stampStripImages(slug: string, rows: LadderRow[], style: StampCardStyle): Promise<Record<string, Buffer> | null> {
  if (!ladderFits(rows)) return null;
  try {
    const s = 3; // draw once at 3x, scale down
    const markFile = path.join(process.cwd(), "passes", slug, "stamp-mark.png");
    const d = 31, gap = 8, rowH = 39, left = 34;
    const top = (H - rowH * rows.length) / 2 + (rowH - d) / 2;
    const maxStamps = Math.max(...rows.map((r) => r.size));
    const labelX = left + maxStamps * d + (maxStamps - 1) * gap + 12;

    let circles = "";
    const marks: { left: number; top: number }[] = [];
    rows.forEach((row, r) => {
      const cy = top + r * rowH + d / 2;
      const strong = row.status !== "later";
      for (let k = 0; k < row.size; k++) {
        const cx = left + d / 2 + k * (d + gap);
        if (k < row.filled) {
          circles += `<circle cx="${cx}" cy="${cy}" r="${d / 2}" fill="${style.stamp}"/>`;
          marks.push({ left: cx, top: cy });
        } else {
          circles += `<circle cx="${cx}" cy="${cy}" r="${d / 2 - 0.8}" fill="none" stroke="${style.ring}" stroke-width="1.6" opacity="${strong ? 1 : 0.5}"/>`;
        }
      }
    });
    const base = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W * s}" height="${H * s}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${style.background}"/>${circles}</svg>`,
    );

    const layers: OverlayOptions[] = [];
    if (existsSync(markFile) && marks.length) {
      const mw = Math.round(24 * s), mh = Math.round(8 * s);
      const mask = await sharp(markFile).resize(mw, mh, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      const tinted = await sharp({ create: { width: mw, height: mh, channels: 4, background: style.mark } })
        .composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
      for (const m of marks) layers.push({ input: tinted, left: Math.round((m.left - 12) * s), top: Math.round((m.top - 4) * s) });
    }
    const maxText = Math.round((343 - labelX) * s);
    for (const [r, row] of rows.entries()) {
      const cy = top + r * rowH + d / 2;
      const dim = row.status === "later" ? 0.55 : 1;
      const title = await textImage(row.text, 11.5, style.text, s, true, maxText, dim);
      const sub = await textImage(STATUS_TEXT[row.status](row.at), 7.5, style.sub, s, false, maxText, dim);
      if (title) layers.push({ input: title, left: Math.round(labelX * s), top: Math.round((cy - 13) * s) });
      if (sub) layers.push({ input: sub, left: Math.round(labelX * s), top: Math.round((cy + 3) * s) });
    }
    const full = await sharp(base).composite(layers).png().toBuffer();
    const at = (k: number) => sharp(full).resize(W * k, H * k).png().toBuffer();
    return { "strip@3x.png": full, "strip@2x.png": await at(2), "strip.png": await at(1) };
  } catch (e) {
    console.error("stamp strip failed", e instanceof Error ? e.message : e);
    return null;
  }
}
