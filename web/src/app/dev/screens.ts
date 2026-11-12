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

export type ScreenLinks = { join: string; terms: string; counter: string; staff: string; board: string; owner: string; qrKit: string; dev: string };

/** Every surface of this deployment. The venue comes from the brand settings, never from a fixed name. */
export function screenLinks(origin: string, slug: string): ScreenLinks {
  const o = cleanOrigin(origin);
  const s = SLUG.test(slug) ? slug : "orbyn";
  return { join: `${o}/join/${s}`, terms: `${o}/join/${s}/terms`, counter: `${o}/counter/${s}`, staff: `${o}/staff`, board: `${o}/staff/board`, owner: `${o}/owner`, qrKit: `${o}/owner/qr-kit`, dev: `${o}/dev` };
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

/** Kept here for the dev screens; the code lives in src/lib/qr.ts. */
export { qrPath } from "@/lib/qr";
