// Pure helpers for the developer's "All screens" section: the links to every surface, the preview sizes,
// and the QR drawing. No browser or server APIs here, so they are easy to test (tests/devScreens.test.ts).

export type Device = "phone" | "tablet" | "desktop";

/** The width each preview renders the page at (CSS px) and the height of the window onto it. */
export const DEVICES: Record<Device, { label: string; width: number; height: number }> = {
  phone: { label: "Phone", width: 390, height: 780 },
  tablet: { label: "Tablet", width: 768, height: 960 },
  desktop: { label: "Desktop", width: 1280, height: 800 },
};

const SLUG = /^[a-z0-9-]+$/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** "https://x.app/" -> "https://x.app". Anything that is not http(s) gives "" so links stay relative. */
export function cleanOrigin(origin: string | null | undefined): string {
  const o = (origin ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^/\s]+$/i.test(o) ? o : "";
}

export type ScreenLinks = { join: string; terms: string; staff: string; owner: string; dev: string };

/** Every surface of this deployment. The venue comes from the brand settings, never from a fixed name. */
export function screenLinks(origin: string, slug: string): ScreenLinks {
  const o = cleanOrigin(origin);
  const s = SLUG.test(slug) ? slug : "demo";
  return { join: `${o}/join/${s}`, terms: `${o}/join/${s}/terms`, staff: `${o}/staff`, owner: `${o}/owner`, dev: `${o}/dev` };
}

/** The card id inside whatever was pasted: the id itself or a whole card link. Null when there is none. */
export function cardIdFrom(input: string): string | null {
  const m = input.trim().match(UUID);
  return m ? m[0].toLowerCase() : null;
}

export function cardLink(origin: string, id: string): string {
  return `${cleanOrigin(origin)}/card/${id}`;
}

/** The scale that fits a page `frameWidth` wide into a box `boxWidth` wide. Never enlarges. */
export function fitScale(frameWidth: number, boxWidth: number): number {
  if (!(frameWidth > 0) || !(boxWidth > 0)) return 1;
  return Math.min(1, Math.round((boxWidth / frameWidth) * 1000) / 1000);
}

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
