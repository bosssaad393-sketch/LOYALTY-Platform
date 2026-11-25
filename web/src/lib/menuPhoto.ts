/**
 * A dish picture kept in the project (public/venues/<slug>/menu/NNN.webp) has a small twin beside it (NNN-s.webp) for
 * lists. Pictures the owner uploads later live in storage and have no twin: they are used as they are.
 */
export function menuThumb(url: string | null): string | null {
  if (!url) return null;
  return /^\/venues\/[a-z0-9-]+\/menu\/\d+\.webp$/.test(url) ? url.replace(/\.webp$/, "-s.webp") : url;
}
