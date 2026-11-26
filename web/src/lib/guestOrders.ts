// What a guest ordered (migration 0024 and table orders): the shapes the owner screen reads, and the favourites count.
// Pure, safe in the browser.

export type BillLine = { name: string; qty: number; priceFils: number | null };
/** One bill: from the till (the POS sent it) or from a table's code (the guest ordered on their phone). */
export type GuestBill = { id: string; from: "till" | "table"; at: string; place: string | null; totalFils: number; refunded: boolean; items: BillLine[] };
export type Favourite = { name: string; qty: number; bills: number };

/**
 * The dishes a guest orders most: by how many bills carry the dish, then by quantity. Names are matched without
 * regard to capitals or spacing, and shown as first written.
 */
export function favourites(bills: GuestBill[], top = 3): Favourite[] {
  const seen = new Map<string, Favourite>();
  for (const b of bills) {
    const inThisBill = new Set<string>();
    for (const l of b.items) {
      const key = l.name.trim().toLowerCase().replace(/\s+/g, " ");
      if (!key) continue;
      const f = seen.get(key) ?? { name: l.name.trim(), qty: 0, bills: 0 };
      f.qty += l.qty;
      if (!inThisBill.has(key)) { f.bills += 1; inThisBill.add(key); }
      seen.set(key, f);
    }
  }
  return [...seen.values()].sort((a, b) => b.bills - a.bills || b.qty - a.qty || a.name.localeCompare(b.name)).slice(0, top);
}

// ---- The owner's spending picture across all members (Overview), from the bills the till sent.

const DAY_MS = 86_400_000;
/** Bills, average and dishes are counted over this many days; spenders over SPENDER_DAYS. */
export const SPEND_DAYS = 30;
export const SPENDER_DAYS = 90;
/** A guest counts as "not seen" after this many days without a visit (the same as the Overview's own figure). */
export const QUIET_DAYS = 30;

export type SpendBill = { id: number; cardId: string; totalFils: number; at: string };
export type SpendLine = { receiptId: number; name: string; qty: number };
export type SpendGuest = { cardId: string; name: string; lastVisit: string | null };
export type Spender = { cardId: string; name: string; spentFils: number; bills: number; lastVisit: string | null };
export type Spending = {
  bills: number;
  totalFils: number;
  avgFils: number | null;
  dishes: { name: string; qty: number; bills: number }[];
  spenders: Spender[];
  /** Among the biggest spenders of the last SPENDER_DAYS days: those not seen for QUIET_DAYS days or more. */
  quiet: Spender[];
};

/**
 * `bills` = every kept bill of the last SPENDER_DAYS days that was not refunded; `lines` = the dishes of the bills of
 * the last SPEND_DAYS days. Guests without a name (erased) are left out of the lists.
 */
export function spending(bills: SpendBill[], lines: SpendLine[], guests: SpendGuest[], now = Date.now(), top = 5): Spending {
  const recent = bills.filter((b) => Date.parse(b.at) >= now - SPEND_DAYS * DAY_MS);
  const recentIds = new Set(recent.map((b) => b.id));
  const total = recent.reduce((s, b) => s + b.totalFils, 0);

  const dishes = new Map<string, { name: string; qty: number; bills: Set<number> }>();
  for (const l of lines) {
    if (!recentIds.has(l.receiptId)) continue;
    const key = l.name.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key) continue;
    const d = dishes.get(key) ?? { name: l.name.trim(), qty: 0, bills: new Set<number>() };
    d.qty += l.qty;
    d.bills.add(l.receiptId);
    dishes.set(key, d);
  }

  const who = new Map(guests.map((g) => [g.cardId, g]));
  const spent = new Map<string, Spender>();
  for (const b of bills) {
    const g = who.get(b.cardId);
    if (!g || !g.name) continue;
    const s = spent.get(b.cardId) ?? { cardId: b.cardId, name: g.name, spentFils: 0, bills: 0, lastVisit: g.lastVisit };
    s.spentFils += b.totalFils;
    s.bills += 1;
    spent.set(b.cardId, s);
  }
  const ranked = [...spent.values()].sort((a, b) => b.spentFils - a.spentFils || a.name.localeCompare(b.name));
  const cutoff = now - QUIET_DAYS * DAY_MS;

  return {
    bills: recent.length,
    totalFils: total,
    avgFils: recent.length ? Math.round(total / recent.length) : null,
    dishes: [...dishes.values()].map((d) => ({ name: d.name, qty: d.qty, bills: d.bills.size })).sort((a, b) => b.qty - a.qty || b.bills - a.bills || a.name.localeCompare(b.name)).slice(0, top),
    spenders: ranked.slice(0, top),
    quiet: ranked.slice(0, 20).filter((s) => s.lastVisit !== null && Date.parse(s.lastVisit) < cutoff).slice(0, top),
  };
}
