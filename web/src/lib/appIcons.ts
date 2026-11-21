import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Home-screen icons for the owner and staff apps: the venue's own (public/venues/<slug>/app-192.png, app-512.png,
 * apple-touch.png, made from its logo) when it has them, otherwise the standard Orbyn ones.
 */
export function appIcons(slug: string) {
  const own = existsSync(path.join(process.cwd(), "public", "venues", slug, "app-192.png"));
  return own
    ? { i192: `/venues/${slug}/app-192.png`, i512: `/venues/${slug}/app-512.png`, apple: `/venues/${slug}/apple-touch.png` }
    : { i192: "/staff-icon-192.png", i512: "/staff-icon-512.png", apple: "/apple-touch-icon.png" };
}
