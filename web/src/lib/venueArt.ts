import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * A venue's own card picture (scripts/card-art-photo.mjs): public/venues/<slug>/card.webp, an optional card-lit.webp
 * for "a gift is waiting", and card.json saying where the picture's open space is. A venue without these files keeps
 * the plain card. Read from disk once per slug.
 */
export type CardArt = { src: string; lit: string | null; niche: { x: number; y: number; w: number; h: number } };

const cache = new Map<string, CardArt | null>();

export function cardArt(slug: string): CardArt | null {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  if (cache.has(slug)) return cache.get(slug)!;
  let art: CardArt | null = null;
  try {
    const dir = path.join(process.cwd(), "public", "venues", slug);
    // Only card.json is read here: on the host the pictures are served from the edge and are not on the server's disk.
    if (existsSync(path.join(dir, "card.json"))) {
      const meta = JSON.parse(readFileSync(path.join(dir, "card.json"), "utf8")) as { niche?: Partial<CardArt["niche"]>; lit?: boolean };
      const n = meta.niche ?? {};
      const pct = (v: unknown, d: number) => (typeof v === "number" && v >= 0 && v <= 100 ? v : d);
      art = {
        src: `/venues/${slug}/card.webp`,
        lit: meta.lit ? `/venues/${slug}/card-lit.webp` : null,
        niche: { x: pct(n.x, 60), y: pct(n.y, 20), w: pct(n.w, 32), h: pct(n.h, 64) },
      };
    }
  } catch {
    art = null;
  }
  cache.set(slug, art);
  return art;
}
