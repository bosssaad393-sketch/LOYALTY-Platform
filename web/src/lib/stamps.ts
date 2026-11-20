/**
 * Stamp mode (migration 0020). A venue with `stamp_tiers` runs on stamps instead of points per BHD:
 * one stamp per paid visit, rewards in order (e.g. at 3, 6 and 9 stamps), each reward costs the stamps since the
 * previous one, and which reward is due follows from how many rewards the guest has already used.
 * Mirrors the database function `stamp_due`; pure so it is easy to test.
 */

export type StampTier = { at: number; text: string };

/** Reads the venue's tiers; anything malformed means "not a stamp venue". */
export function parseTiers(raw: unknown): StampTier[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 6) return null;
  const tiers: StampTier[] = [];
  let prev = 0;
  for (const t of raw) {
    const at = Number((t as { at?: unknown })?.at);
    const text = String((t as { text?: unknown })?.text ?? "").trim();
    if (!Number.isInteger(at) || at <= prev || !text) return null;
    tiers.push({ at, text });
    prev = at;
  }
  return tiers;
}

export type StampState = {
  /** Stamps on the card that are not spent yet. */
  stamps: number;
  /** Index of the reward due next (0-based) and what it is. */
  index: number;
  reward: string;
  /** Stamps that reward costs, and whether the card has them. */
  cost: number;
  ready: boolean;
  /** Where the guest stands on the full ladder (0 .. last tier), for the dots. */
  position: number;
  cycle: number;
  tiers: StampTier[];
};

export function stampState(tiers: StampTier[], stamps: number, rewardsGiven: number): StampState {
  const n = tiers.length;
  const index = ((Math.max(0, rewardsGiven) % n) + n) % n;
  const prevAt = index === 0 ? 0 : tiers[index - 1].at;
  const cost = tiers[index].at - prevAt;
  const cycle = tiers[n - 1].at;
  const safe = Math.max(0, stamps);
  return {
    stamps: safe,
    index,
    reward: tiers[index].text,
    cost,
    ready: safe >= cost,
    position: Math.min(cycle, prevAt + safe),
    cycle,
    tiers,
  };
}
