// Table service rules. Pure functions, no database, so every rule can be tested on its own.
// Money is integer fils everywhere (BHD 1.500 = 1500). Prices always come from the menu on the server, never from the browser.
import { z } from "zod";

export const REQUEST_KINDS = ["coal", "waiter", "bill"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const READY_MINUTES = [10, 20] as const;

export type OrderStatus = "new" | "accepted" | "ready" | "served" | "cancelled";
export type OrderAction = "accept" | "ready" | "serve" | "cancel";

export const CartInput = z.object({
  items: z
    .array(z.object({ id: z.uuid(), qty: z.number().int().min(1).max(20), note: z.string().trim().max(120).optional() }))
    .min(1)
    .max(30),
});
export type Cart = z.infer<typeof CartInput>;

export type MenuRow = { id: string; name_en: string; name_ar: string | null; price_fils: number; available: boolean; active: boolean };
export type PricedLine = { item_id: string; name_en: string; name_ar: string | null; price_fils: number; qty: number; note: string | null };

/** Turns a cart into order lines using the server's own menu. Anything missing, removed or sold out stops the whole order. */
export function priceCart(cart: Cart, menu: MenuRow[]): { ok: true; lines: PricedLine[]; totalFils: number } | { ok: false; unavailable: string[] } {
  const byId = new Map(menu.map((m) => [m.id, m]));
  const unavailable = [...new Set(cart.items.map((i) => i.id).filter((id) => { const m = byId.get(id); return !m || !m.active || !m.available; }))];
  if (unavailable.length) return { ok: false, unavailable };
  const lines = cart.items.map((i): PricedLine => {
    const m = byId.get(i.id)!;
    return { item_id: m.id, name_en: m.name_en, name_ar: m.name_ar, price_fils: m.price_fils, qty: i.qty, note: i.note || null };
  });
  return { ok: true, lines, totalFils: linesTotal(lines) };
}

export const linesTotal = (lines: { price_fils: number; qty: number }[]) => lines.reduce((sum, l) => sum + l.price_fils * l.qty, 0);

/** "1.500" -> 1500 fils. Null when it is not a price with up to 3 decimals. */
export function parsePriceFils(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,5}(\.\d{1,3})?$/.test(t)) return null;
  const [whole, dec = ""] = t.split(".");
  return Number(whole) * 1000 + Number(dec.padEnd(3, "0"));
}

export const filsText = (fils: number) => (fils / 1000).toFixed(3);

const NEXT: Record<OrderStatus, Partial<Record<OrderAction, OrderStatus>>> = {
  new: { accept: "accepted", cancel: "cancelled" },
  accepted: { ready: "ready", cancel: "cancelled" },
  ready: { serve: "served" },
  served: {},
  cancelled: {},
};

/** The database change for a staff action, or null when the action is not allowed from this status. */
export function orderPatch(current: OrderStatus, action: OrderAction, minutes: number | undefined, nowIso: string): Record<string, unknown> | null {
  const status = NEXT[current]?.[action];
  if (!status) return null;
  if (action === "accept") {
    if (!READY_MINUTES.includes(minutes as (typeof READY_MINUTES)[number])) return null;
    return { status, accepted_at: nowIso, ready_minutes: minutes };
  }
  if (action === "ready") return { status, ready_at: nowIso };
  if (action === "serve") return { status, served_at: nowIso };
  return { status, cancelled_at: nowIso };
}

/** A tab can be closed only when no round is still waiting or being made. */
export const tabCanClose = (orders: { status: string }[]) => !orders.some((o) => o.status === "new" || o.status === "accepted");

// ---- reports ----------------------------------------------------------------------------------------------------

const bahrain = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600_000);
export const bahrainHour = (iso: string) => bahrain(iso).getUTCHours();

export const DAY_PARTS = ["morning", "afternoon", "evening", "late"] as const;
export type DayPart = (typeof DAY_PARTS)[number];

/** Bahrain time: morning 6 to 12, afternoon 12 to 18, evening 18 to 24, late 0 to 6. */
export function dayPart(iso: string): DayPart {
  const h = bahrainHour(iso);
  if (h < 6) return "late";
  if (h < 12) return "morning";
  return h < 18 ? "afternoon" : "evening";
}

export const minutesBetween = (from: string, to: string) => (new Date(to).getTime() - new Date(from).getTime()) / 60_000;

type Avg = { count: number; avgMinutes: number | null };
const avg = (values: number[]): Avg => ({
  count: values.length,
  avgMinutes: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null,
});

export const WAIT_MEASURES = ["accept", "ready", "coal", "waiter", "bill"] as const;
export type WaitMeasure = (typeof WAIT_MEASURES)[number];
export type WaitRow = { part: DayPart } & Record<WaitMeasure, Avg>;

type ReportOrder = { created_at: string; accepted_at?: string | null; ready_at?: string | null };
type ReportRequest = { kind: string; created_at: string; handled_at?: string | null };

/** Average waits per part of the day. A wait counts only once it has ended, so open requests never skew the numbers. */
export function waitTable(orders: ReportOrder[], requests: ReportRequest[]): WaitRow[] {
  return DAY_PARTS.map((part) => {
    const os = orders.filter((o) => dayPart(o.created_at) === part);
    const rs = requests.filter((r) => dayPart(r.created_at) === part && r.handled_at);
    const req = (kind: RequestKind) => avg(rs.filter((r) => r.kind === kind).map((r) => minutesBetween(r.created_at, r.handled_at!)));
    return {
      part,
      accept: avg(os.filter((o) => o.accepted_at).map((o) => minutesBetween(o.created_at, o.accepted_at!))),
      ready: avg(os.filter((o) => o.ready_at).map((o) => minutesBetween(o.created_at, o.ready_at!))),
      coal: req("coal"),
      waiter: req("waiter"),
      bill: req("bill"),
    };
  });
}

type SaleLine = { order_id: string; name_en: string; price_fils: number; qty: number; created_at: string };

/** Sales from lines of orders that were not cancelled. Ordered value, not money received. */
export function salesReport(lines: SaleLine[], cancelledOrderIds: Set<string>) {
  const live = lines.filter((l) => !cancelledOrderIds.has(l.order_id));
  const perHour = Array.from({ length: 24 }, (_, hour) => ({ hour, fils: 0 }));
  const items = new Map<string, { name: string; qty: number; fils: number }>();
  for (const l of live) {
    const fils = l.price_fils * l.qty;
    perHour[bahrainHour(l.created_at)].fils += fils;
    const it = items.get(l.name_en) ?? { name: l.name_en, qty: 0, fils: 0 };
    it.qty += l.qty;
    it.fils += fils;
    items.set(l.name_en, it);
  }
  return { totalFils: linesTotal(live), perHour, items: [...items.values()].sort((a, b) => b.fils - a.fils) };
}
