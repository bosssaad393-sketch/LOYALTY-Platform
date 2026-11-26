/**
 * The living card: the lamp in the venue's niche burns brighter the more a guest has visited.
 *
 * A card is not a counter here. A guest who has just joined holds a dark niche; the first visit leaves an ember; a
 * regular's lamp burns steadily; and while a gift is waiting the niche is fully lit. The same level decides the Wallet
 * card's picture (web/passes/<venue>/lamp/<level>/, made by scripts/card-lamp.mjs) and how strongly the lit picture
 * shows on the card page.
 */

export type LampLevel = 0 | 1 | 2 | 3 | 4;

/** How much of the lit picture shows at each level. scripts/card-lamp.mjs draws levels 1 to 3 from the same numbers. */
export const LAMP_GLOW = [0, 0.3, 0.52, 0.74, 1] as const;

/** The visit that reaches each level without a gift: 1 = an ember, 3 = a low lamp, 6 = a steady lamp. */
export const LAMP_VISITS = { 1: 1, 2: 3, 3: 6 } as const;

/** The top level is kept for a gift that is waiting, so "something is ready for you" always looks different. */
export function lampLevel(visits: number, giftReady: boolean): LampLevel {
  if (giftReady) return 4;
  const v = Number.isFinite(visits) ? Math.floor(visits) : 0;
  if (v >= LAMP_VISITS[3]) return 3;
  if (v >= LAMP_VISITS[2]) return 2;
  if (v >= LAMP_VISITS[1]) return 1;
  return 0;
}

export const lampGlow = (level: LampLevel): number => LAMP_GLOW[level];
