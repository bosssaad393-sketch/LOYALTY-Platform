import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import type { StampState } from "./stamps";

/**
 * The stamp card look on Apple Wallet ("Ink & Ivory"), for stamp venues with passes/<slug>/stamp-card.json.
 *
 * The strip (375 x 123 pt, Apple's size for a store card) is drawn for each guest and each language: a grid of stamp
 * boxes, one row per reward, every earned stamp a hand-pressed rubber-stamp impression of the venue's mark
 * (passes/<slug>/stamp-mark.png, white on transparent) at its own slight angle; the reward boxes have a solid outline
 * and their step number. Beside the grid, the reward ladder: used rewards struck through, the ready one tagged, later
 * ones faded. Arabic mirrors the whole strip. Text uses the bundled fonts (passes/_fonts), never system fonts.
 * Wallet crops about 27 pt off each side on some iPhones, so everything stays between x = 24 and x = 351.
 */

export type StampCardStyle = {
  background: string; foreground: string; label: string;
  ink: string; accent: string; soft: string; rule: string;
  /** Short reward names for the front of the card (index = reward), per language. Optional. */
  short?: { en?: string[]; ar?: string[] };
};
export type StripLang = "en" | "ar";

const HEX = /^#[0-9a-fA-F]{6}$/;
const KEYS = ["background", "foreground", "label", "ink", "accent", "soft", "rule"] as const;

/** The venue's stamp card colours, or null when it has none (the pass then keeps the standard look). */
export function stampCardStyle(slug: string): StampCardStyle | null {
  try {
    const raw = JSON.parse(readFileSync(path.join(process.cwd(), "passes", slug, "stamp-card.json"), "utf8")) as Record<string, unknown>;
    if (!KEYS.every((k) => typeof raw[k] === "string" && HEX.test(raw[k] as string))) return null;
    const style = Object.fromEntries(KEYS.map((k) => [k, raw[k]])) as StampCardStyle;
    const short = raw.short as { en?: unknown; ar?: unknown } | undefined;
    const list = (v: unknown) => (Array.isArray(v) && v.every((x) => typeof x === "string" && x.length <= 40) ? (v as string[]) : undefined);
    if (short) style.short = { en: list(short.en), ar: list(short.ar) };
    return style;
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

const WORDS: Record<StripLang, { head: string; used: string; ready: string }> = {
  en: { head: "REWARDS", used: "used", ready: "READY" },
  ar: { head: "المكافآت", used: "مستخدمة", ready: "جاهزة" },
};
/** Each impression lands at its own slight angle, like a stamp pressed by hand. */
const ANGLES = [-11, 7, -4, 13, -8, 5, -13, 9, -2, 6, -6, 10];

const FONT_DIR = () => path.join(process.cwd(), "passes", "_fonts");
const FONTS = {
  latin: { file: "Geist-Regular.ttf", name: "Geist" },
  number: { file: "BodoniModa.ttf", name: "Bodoni Moda" },
  arabic: { file: "Tajawal-Medium.ttf", name: "Tajawal Medium" },
  arabicBold: { file: "Tajawal-Bold.ttf", name: "Tajawal Bold" },
} as const;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type TextOpts = { font: keyof typeof FONTS; pt: number; color: string; alpha?: number; spacing?: number; strike?: boolean; maxPx?: number };

/** One line of text as a transparent PNG at `scale`, with its width; null if text drawing is not available here. */
async function textImage(text: string, o: TextOpts, scale: number): Promise<{ png: Buffer; w: number; h: number } | null> {
  try {
    const f = FONTS[o.font];
    const attrs = [`foreground="${o.color}"`];
    if (o.alpha !== undefined && o.alpha < 1) attrs.push(`alpha="${Math.round(o.alpha * 100)}%"`);
    if (o.spacing) attrs.push(`letter_spacing="${Math.round(o.spacing * 1024)}"`);
    if (o.strike) attrs.push(`strikethrough="true"`);
    const { data, info } = await sharp({
      text: { text: `<span ${attrs.join(" ")}>${esc(text)}</span>`, font: `${f.name} ${o.pt}`, fontfile: path.join(FONT_DIR(), f.file), rgba: true, dpi: 72 * scale },
    }).png().toBuffer({ resolveWithObject: true });
    if (o.maxPx && info.width > o.maxPx) {
      const r = await sharp(data).resize({ width: o.maxPx }).png().toBuffer({ resolveWithObject: true });
      return { png: r.data, w: r.info.width, h: r.info.height };
    }
    return { png: data, w: info.width, h: info.height };
  } catch {
    return null;
  }
}

const W = 375, H = 123;

/** strip.png, strip@2x.png, strip@3x.png for this card in one language, or null when the ladder does not fit or drawing fails. */
export async function stampStripImages(slug: string, rows: LadderRow[], style: StampCardStyle, lang: StripLang = "en"): Promise<Record<string, Buffer> | null> {
  if (!ladderFits(rows)) return null;
  try {
    const s = 3; // draw once at 3x, scale down
    const rtl = lang === "ar";
    const words = WORDS[lang];
    const mark = "data:image/png;base64," + readFileSync(path.join(process.cwd(), "passes", slug, "stamp-mark.png")).toString("base64");
    const box = 28, gap = 8, gx = 26;
    const cols = Math.max(...rows.map((r) => r.size));
    const gy = (H - rows.length * box - (rows.length - 1) * gap) / 2;
    const mirror = (left: number, width: number) => (rtl ? W - left - width : left);

    // Boxes and stamp impressions (shapes only; text is added below with the bundled fonts).
    let g = "";
    let n = 0;
    rows.forEach((row, r) => {
      const y = gy + r * (box + gap);
      for (let c = 0; c < row.size; c++) {
        const bx = mirror(gx + c * (box + gap), box), cx = bx + box / 2, cy = y + box / 2;
        const reward = c === row.size - 1;
        g += `<rect x="${bx + 0.5}" y="${y + 0.5}" width="${box - 1}" height="${box - 1}" rx="4" fill="none" stroke="${reward ? style.accent : style.ink}" stroke-opacity="${reward ? 0.8 : 0.28}" stroke-width="${reward ? 1 : 0.8}"${reward ? "" : ' stroke-dasharray="2.2 2"'}/>`;
        if (c < row.filled) {
          g += `<g transform="rotate(${ANGLES[n % ANGLES.length]} ${cx} ${cy})" filter="url(#ink)" opacity=".94">`
            + `<circle cx="${cx}" cy="${cy}" r="12.6" fill="none" stroke="${style.ink}" stroke-width="1.7"/>`
            + `<circle cx="${cx}" cy="${cy}" r="10.1" fill="none" stroke="${style.ink}" stroke-width=".6"/>`
            + `<image href="${mark}" x="${cx - 9}" y="${cy - 3}" width="18" height="6" filter="url(#inkfill)"/></g>`;
        }
        n++;
      }
    });
    // Ladder rules and the ready tag shapes.
    const lx = gx + cols * box + (cols - 1) * gap + 22, rx = W - 24;
    const lineY = (r: number) => gy + 26 + r * 30 + 10;
    rows.forEach((row, r) => {
      if (r < rows.length - 1) g += `<line x1="${mirror(lx, rx - lx)}" x2="${mirror(lx, rx - lx) + (rx - lx)}" y1="${lineY(r)}" y2="${lineY(r)}" stroke="${style.rule}" stroke-width=".6"/>`;
    });
    const base = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W * s}" height="${H * s}" viewBox="0 0 ${W} ${H}"><defs>`
      + `<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .3  0 0 0 0 .2  0 0 0 .16 -.05"/><feComposite in2="SourceGraphic" operator="in"/></filter>`
      + `<filter id="ink" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.1" result="d"/><feTurbulence type="fractalNoise" baseFrequency="2.4" numOctaves="1" seed="4" result="m"/><feColorMatrix in="m" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.3 1.55" result="holes"/><feComposite in="d" in2="holes" operator="in"/></filter>`
      + `<filter id="inkfill"><feFlood flood-color="${style.ink}"/><feComposite in2="SourceAlpha" operator="in"/></filter>`
      + `</defs><rect width="${W}" height="${H}" fill="${style.background}"/><rect width="${W}" height="${H}" fill="#000" filter="url(#grain)"/>${g}</svg>`,
    );

    // Text, placed by its start edge (left in English, right in Arabic) and its baseline.
    const layers: OverlayOptions[] = [];
    const place = (img: { png: Buffer; w: number; h: number } | null, x: number, baseline: number, pt: number, anchor: "start" | "end" | "middle" = "start") => {
      if (!img) return;
      const startX = rtl ? W - x : x; // x is measured in English layout
      let left = anchor === "middle" ? startX * s - img.w / 2 : (anchor === "start") !== rtl ? startX * s : startX * s - img.w;
      left = Math.max(0, Math.min(W * s - img.w, left));
      layers.push({ input: img.png, left: Math.round(left), top: Math.max(0, Math.round((baseline - pt * 0.98) * s)) });
    };
    const latin = rtl ? "arabic" : "latin";
    place(await textImage(words.head, { font: latin, pt: rtl ? 8.5 : 6.8, color: style.soft, spacing: rtl ? 0 : 1.6 }, s), lx, gy + 6, rtl ? 8.5 : 6.8);
    for (const [r, row] of rows.entries()) {
      const y = gy + 26 + r * 30;
      const dim = row.status === "later" ? 0.55 : 1;
      // the step number sits in the box column too, for reward boxes not yet stamped
      const lastBox = mirror(gx + (row.size - 1) * (box + gap), box);
      if (row.filled < row.size) {
        const num = await textImage(String(row.at), { font: "number", pt: 11, color: style.accent }, s);
        if (num) layers.push({ input: num.png, left: Math.round((lastBox + box / 2) * s - num.w / 2), top: Math.round((gy + r * (box + gap) + box / 2 - 7) * s) });
      }
      place(await textImage(String(row.at), { font: "number", pt: 13, color: style.accent, alpha: dim }, s), lx, y, 13);
      const maxPx = Math.round((rx - lx - 17 - (row.status === "ready" || row.status === "used" ? 46 : 0)) * s);
      place(await textImage(row.text, { font: rtl ? "arabicBold" : "latin", pt: rtl ? 11.5 : 10.5, color: style.ink, alpha: dim, strike: row.status === "used", maxPx }, s), lx + 17, y - 0.5, rtl ? 11.5 : 10.5);
      if (row.status === "used") {
        place(await textImage(words.used, { font: latin, pt: rtl ? 9 : 8.5, color: style.soft }, s), rx, y - 0.5, rtl ? 9 : 8.5, "end");
      }
      if (row.status === "ready") {
        const pw = 40, pill = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${pw * s}" height="${14 * s}"><rect width="${pw * s}" height="${14 * s}" rx="${7 * s}" fill="${style.ink}"/></svg>`);
        const pillLeft = rtl ? W - rx : rx - pw;
        layers.push({ input: pill, left: Math.round(pillLeft * s), top: Math.round((y - 11.5) * s) });
        const tag = await textImage(words.ready, { font: rtl ? "arabicBold" : "latin", pt: rtl ? 8.5 : 7, color: style.background, spacing: rtl ? 0 : 1 }, s);
        if (tag) layers.push({ input: tag.png, left: Math.round((pillLeft + pw / 2) * s - tag.w / 2), top: Math.round((y - 4.5) * s - tag.h / 2) });
      }
    }
    const full = await sharp(base).composite(layers).png().toBuffer();
    const at = (k: number) => sharp(full).resize(W * k, H * k).png().toBuffer();
    return { "strip@3x.png": full, "strip@2x.png": await at(2), "strip.png": await at(1) };
  } catch (e) {
    console.error("stamp strip failed", e instanceof Error ? e.message : e);
    return null;
  }
}
