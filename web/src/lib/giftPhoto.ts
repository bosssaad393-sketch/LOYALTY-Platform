import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

/**
 * A gift's own photo, seen through the opening in the card's picture (migration 0033).
 *
 * The owner uploads one photo per gift. While that gift waits on a guest's card, the Wallet card's picture is the
 * venue's lit niche with the photo behind the arch, as if the niche were a window onto the gift. The picture is made
 * here, per gift, from the venue's own lit strip (passes/<venue>/lit) and the place of its niche
 * (passes/<venue>/niche.json), and kept in memory.
 *
 * Only two kinds of photo are ever read: one in this deployment's own storage, or (sample mode) one held inside the
 * record itself. Any other address is ignored and the card simply shows the lit niche.
 */

export type Niche = { l: number; r: number; floor: number; spring: number; tip: number };

const W3 = 1125, H3 = 432;
const MAX_BYTES = 1_500_000;

/** The niche's place in the venue's 3x strip, or null when the venue has not got one (no photo is drawn then). */
export function nicheOf(slug: string): Niche | null {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return null;
  try {
    const n = JSON.parse(readFileSync(path.join(process.cwd(), "passes", slug, "niche.json"), "utf8")) as Record<string, unknown>;
    const v = { l: Number(n.l), r: Number(n.r), floor: Number(n.floor), spring: Number(n.spring), tip: Number(n.tip) };
    const ok = Object.values(v).every(Number.isFinite) && v.l >= 0 && v.r <= W3 && v.r - v.l >= 40 && v.tip >= 0 && v.tip < v.spring && v.spring < v.floor && v.floor <= H3;
    return ok ? v : null;
  } catch {
    return null;
  }
}

/** The arch's outline inside a box as wide as the opening and as tall as from its point to the shelf. */
export function archPath(n: Niche): string {
  const w = n.r - n.l, h = n.floor - n.tip, s = n.spring - n.tip, m = w / 2;
  const k = Math.min(s, w * 0.31), c = Math.min(m, w * 0.22);
  return `M 0 ${h} L 0 ${s} C 0 ${s - k} ${m - c} ${k * 0.48} ${m} 0 C ${m + c} ${k * 0.48} ${w} ${s - k} ${w} ${s} L ${w} ${h} Z`;
}

/** True for a photo this server may read: its own storage's public "menu" files, or a small picture inside the record. */
export function photoSourceOk(url: string, env: Record<string, string | undefined> = process.env): boolean {
  if (/^data:image\/(?:webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(url)) return url.length <= MAX_BYTES * 1.4;
  const base = (env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)) return false;
  return url.startsWith(`${base}/storage/v1/object/public/menu/`) && !/[?#\\]|\.\./.test(url) && url.length <= 600;
}

async function photoBytes(url: string): Promise<Buffer | null> {
  if (!photoSourceOk(url)) return null;
  if (url.startsWith("data:")) return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  const res = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: "error" });
  if (!res.ok) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  return bytes.length > 0 && bytes.length <= MAX_BYTES ? bytes : null;
}

/** The lit strip with the photo behind the arch, at 3x. Exported for tests and for scripts/gift-art. */
export async function composeGiftStrip(lit3x: Buffer, photo: Buffer, n: Niche): Promise<Buffer> {
  const w = Math.round(n.r - n.l), h = Math.round(n.floor - n.tip);
  const arch = archPath({ ...n, r: n.l + w, floor: n.tip + h });
  // The photo fills the opening; its edges fall into the shadow of the wall so it sits IN the niche, not on the card.
  const shade = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs>
      <radialGradient id="v" cx="0.5" cy="0.6" r="0.78"><stop offset="0.42" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#02140c" stop-opacity="0.8"/></radialGradient>
      <linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#02140c" stop-opacity="0.55"/><stop offset="0.36" stop-color="#000" stop-opacity="0"/></linearGradient>
    </defs><rect width="100%" height="100%" fill="url(#v)"/><rect width="100%" height="100%" fill="url(#t)"/></svg>`,
  );
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><path d="${arch}" fill="#fff"/></svg>`);
  const window = await sharp(photo)
    .rotate() // a phone photo's own "which way is up"
    .resize(w, h, { fit: "cover", position: "centre" })
    .modulate({ brightness: 0.94, saturation: 0.96 })
    .ensureAlpha()
    .composite([{ input: shade }, { input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
  return sharp(lit3x).composite([{ input: window, left: Math.round(n.l), top: Math.round(n.tip) }]).png().toBuffer();
}

const made = new Map<string, Record<string, Buffer>>();
const KEEP = 24;

/**
 * The three strip files for a gift's photo, or {} when the venue has no niche or lit picture, the photo cannot be
 * read, or anything else goes wrong: the caller then keeps the lit niche. Never throws.
 */
export async function giftStripImages(slug: string, imageUrl: string | null | undefined): Promise<Record<string, Buffer>> {
  if (!imageUrl) return {};
  const key = `${slug}|${imageUrl}`;
  const hit = made.get(key);
  if (hit) return hit;
  try {
    const niche = nicheOf(slug);
    if (!niche) return {};
    const lit = readFileSync(path.join(process.cwd(), "passes", slug, "lit", "strip@3x.png"));
    const photo = await photoBytes(imageUrl);
    if (!photo) return {};
    const full = await composeGiftStrip(lit, photo, niche);
    const files = {
      "strip@3x.png": full,
      "strip@2x.png": await sharp(full).resize(750, 288).png().toBuffer(),
      "strip.png": await sharp(full).resize(375, 144).png().toBuffer(),
    };
    if (made.size >= KEEP) made.delete(made.keys().next().value as string);
    made.set(key, files);
    return files;
  } catch (e) {
    console.warn("gift photo strip failed", e instanceof Error ? e.message : e);
    return {};
  }
}

/** Tests only. */
export const forgetGiftStrips = () => made.clear();
