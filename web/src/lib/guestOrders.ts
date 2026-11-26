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
