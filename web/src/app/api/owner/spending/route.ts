import { db } from "@/lib/supabase";
import { DAY, withOwner } from "@/lib/ownerApi";
import { SPEND_DAYS, SPENDER_DAYS, spending, type SpendBill, type SpendGuest, type SpendLine } from "@/lib/guestOrders";

const PAGE = 1000;
const MAX_PAGES = 10;
const CHUNK = 200;

type BillRow = { id: number; card_id: string; total_fils: number; refunded_at: string | null; created_at: string };
type LineRow = { receipt_id: number; name: string; qty: number };
type CardRow = { id: string; last_visit: string | null; members: unknown };

/**
 * What members spend and order, from the bills the till sent (migration 0024): bills and the average bill over the
 * last 30 days, the dishes ordered most, the biggest spenders of the last 90 days and which of them went quiet.
 * A venue with no till connected (or a database without 0024) gets zeros: the Overview then shows nothing.
 */
export async function GET() {
  return withOwner(async (staff) => {
    const now = Date.now();
    const since = new Date(now - SPENDER_DAYS * DAY).toISOString();
    const rows: BillRow[] = [];
    let complete = true;
    for (let i = 0; ; i++) {
      if (i === MAX_PAGES) { complete = false; break; }
      const { data, error } = await db().from("receipts").select("id, card_id, total_fils, refunded_at, created_at").eq("venue_id", staff.venueId).gte("created_at", since).order("created_at", { ascending: false }).range(i * PAGE, i * PAGE + PAGE - 1);
      if (error) return Response.json({ ...spending([], [], [], now), complete: true });
      rows.push(...((data ?? []) as BillRow[]));
      if ((data ?? []).length < PAGE) break;
    }
    const bills: SpendBill[] = rows.filter((r) => !r.refunded_at).map((r) => ({ id: Number(r.id), cardId: r.card_id, totalFils: Number(r.total_fils), at: r.created_at }));
    const recent = bills.filter((b) => Date.parse(b.at) >= now - SPEND_DAYS * DAY).map((b) => b.id);

    const lines: SpendLine[] = [];
    for (let i = 0; i < recent.length; i += CHUNK) {
      const { data, error } = await db().from("receipt_items").select("receipt_id, name, qty").eq("venue_id", staff.venueId).in("receipt_id", recent.slice(i, i + CHUNK));
      if (error) break;
      lines.push(...((data ?? []) as LineRow[]).map((l) => ({ receiptId: Number(l.receipt_id), name: l.name, qty: Number(l.qty) })));
    }

    // Names only for the guests who can appear in a list: the biggest spenders.
    const totals = new Map<string, number>();
    for (const b of bills) totals.set(b.cardId, (totals.get(b.cardId) ?? 0) + b.totalFils);
    const biggest = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([id]) => id);
    const guests: SpendGuest[] = [];
    if (biggest.length) {
      const { data } = await db().from("cards").select("id, last_visit, members(name, deleted_at)").eq("venue_id", staff.venueId).in("id", biggest);
      for (const c of (data ?? []) as CardRow[]) {
        const m = c.members as { name?: string; deleted_at?: string | null } | null;
        guests.push({ cardId: c.id, name: m && !m.deleted_at ? m.name ?? "" : "", lastVisit: c.last_visit });
      }
    }
    return Response.json({ ...spending(bills, lines, guests, now), complete });
  });
}
