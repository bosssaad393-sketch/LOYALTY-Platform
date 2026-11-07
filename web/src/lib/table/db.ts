import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "../supabase";
import { tapOnFor } from "../tap/client";
import { payingNow, recentCardPayments, tabMoney } from "../tap/payments";
import { payState } from "../tap/rules";
import {
  linesTotal, orderPatch, priceCart, salesReport, tabCanClose, waitTable,
  type Cart, type MenuRow, type OrderAction, type OrderStatus, type RequestKind,
} from "./rules";

// Every read and write here filters by venue. The venue comes from the table token (guests) or the signed-in person (staff, owner),
// never from anything else in the request.

const must = <T,>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

export type TableRef = { id: string; label: string; venueId: string; venueSlug: string; venueName: string };

/** The table behind a QR code. Null for an unknown token, a removed table or an inactive venue. */
export async function findTable(token: string): Promise<TableRef | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const table = must(await db().from("venue_tables").select("id, label, venue_id, active").eq("token", token).eq("active", true).maybeSingle()) as { id: string; label: string; venue_id: string } | null;
  if (!table) return null;
  const venue = must(await db().from("venues").select("id, slug, name, active").eq("id", table.venue_id).eq("active", true).maybeSingle()) as { slug: string; name: string } | null;
  return venue ? { id: table.id, label: table.label, venueId: table.venue_id, venueSlug: venue.slug, venueName: venue.name } : null;
}

// ---- menu ---------------------------------------------------------------------------------------------------------

type CategoryRow = { id: string; name_en: string; name_ar: string | null; sort: number };
type ItemRow = MenuRow & { category_id: string; note_en: string | null; note_ar: string | null; image_url: string | null; sort: number };

async function menuRows(venueId: string) {
  const categories = must(await db().from("menu_categories").select("id, name_en, name_ar, sort").eq("venue_id", venueId).eq("active", true).order("sort")) as CategoryRow[];
  const items = must(await db().from("menu_items").select("id, category_id, name_en, name_ar, note_en, note_ar, image_url, price_fils, available, active, sort").eq("venue_id", venueId).eq("active", true).order("sort")) as ItemRow[];
  return { categories, items };
}

export type MenuView = { id: string; nameEn: string; nameAr: string | null; items: { id: string; nameEn: string; nameAr: string | null; noteEn: string | null; noteAr: string | null; imageUrl: string | null; priceFils: number; available: boolean }[] }[];

export async function readMenu(venueId: string): Promise<MenuView> {
  const { categories, items } = await menuRows(venueId);
  return categories.map((c) => ({
    id: c.id,
    nameEn: c.name_en,
    nameAr: c.name_ar,
    items: items.filter((i) => i.category_id === c.id).map((i) => ({ id: i.id, nameEn: i.name_en, nameAr: i.name_ar, noteEn: i.note_en, noteAr: i.note_ar, imageUrl: i.image_url, priceFils: i.price_fils, available: i.available })),
  }));
}

// ---- tabs and orders ----------------------------------------------------------------------------------------------

type TabRow = { id: string; table_id: string; opened_at: string };
type OrderRow = { id: string; tab_id: string; table_id: string; status: OrderStatus; source: string; ready_minutes: number | null; created_at: string; accepted_at: string | null; ready_at: string | null };
type LineRow = { order_id: string; name_en: string; name_ar: string | null; price_fils: number; qty: number; note: string | null };

const ORDER_COLUMNS = "id, tab_id, table_id, status, source, ready_minutes, created_at, accepted_at, ready_at";

const openTabOf = async (tableId: string, venueId: string) =>
  must(await db().from("tabs").select("id, table_id, opened_at").eq("table_id", tableId).eq("venue_id", venueId).eq("status", "open").maybeSingle()) as TabRow | null;

/** The table's open tab, opened now if there is none. Two phones at the same moment end up on the same tab (one open tab per table in the database). */
async function ensureTab(tableId: string, venueId: string): Promise<TabRow> {
  const found = await openTabOf(tableId, venueId);
  if (found) return found;
  const made = await db().from("tabs").insert({ venue_id: venueId, table_id: tableId }).select("id, table_id, opened_at").single();
  if (!made.error) return made.data as TabRow;
  const again = await openTabOf(tableId, venueId);
  if (again) return again;
  throw new Error(made.error.message);
}

async function linesFor(orderIds: string[], venueId: string): Promise<LineRow[]> {
  if (!orderIds.length) return [];
  return must(await db().from("order_items").select("order_id, name_en, name_ar, price_fils, qty, note").eq("venue_id", venueId).in("order_id", orderIds)) as LineRow[];
}

const liveTotal = (orders: { id: string; status: string }[], lines: LineRow[]) => {
  const live = new Set(orders.filter((o) => o.status !== "cancelled").map((o) => o.id));
  return linesTotal(lines.filter((l) => live.has(l.order_id)));
};

export type OrderOutcome = { ok: true; orderId: string } | { ok: false; unavailable: string[] };

/** Places one round on the table's tab. Prices and names come from the menu here on the server. */
export async function placeOrder(table: { id: string; venueId: string }, cart: Cart, by: { source: "guest" } | { source: "staff"; staffId: string }): Promise<OrderOutcome> {
  const ids = [...new Set(cart.items.map((i) => i.id))];
  const menu = must(await db().from("menu_items").select("id, name_en, name_ar, price_fils, available, active").eq("venue_id", table.venueId).in("id", ids)) as MenuRow[];
  const priced = priceCart(cart, menu);
  if (!priced.ok) return priced;

  const tab = await ensureTab(table.id, table.venueId);
  const order = must(await db().from("orders").insert({
    venue_id: table.venueId,
    tab_id: tab.id,
    table_id: table.id,
    source: by.source,
    created_by: by.source === "staff" ? by.staffId : null,
  }).select("id").single()) as { id: string };

  const { error } = await db().from("order_items").insert(priced.lines.map((l) => ({ ...l, venue_id: table.venueId, order_id: order.id })));
  if (error) {
    // Never leave an empty round on the board.
    await db().from("orders").delete().eq("id", order.id).eq("venue_id", table.venueId);
    throw new Error(error.message);
  }
  return { ok: true, orderId: order.id };
}

/** Coal, waiter or bill. A second tap while the first is still open changes nothing, so the clock keeps the first time. */
export async function addRequest(table: { id: string; venueId: string }, kind: RequestKind): Promise<void> {
  const tab = await ensureTab(table.id, table.venueId);
  const open = must(await db().from("table_requests").select("id").eq("tab_id", tab.id).eq("venue_id", table.venueId).eq("kind", kind).is("handled_at", null).maybeSingle());
  if (open) return;
  const { error } = await db().from("table_requests").insert({ venue_id: table.venueId, tab_id: tab.id, table_id: table.id, kind });
  // 23505: another tap got in first, which is the same result.
  if (error && (error as { code?: string }).code !== "23505") throw new Error(error.message);
}

/** What the guest's page shows: this table's current tab only. No names, no other tables. */
export async function tableView(table: TableRef) {
  const cardOn = tapOnFor(table.venueSlug);
  const tab = await openTabOf(table.id, table.venueId);
  if (!tab) return { rounds: [], totalFils: 0, paidFils: 0, balanceFils: 0, pay: payState({ enabled: cardOn, balanceFils: 0, canClose: true, paying: false }), calls: [] as string[] };
  const orders = must(await db().from("orders").select(ORDER_COLUMNS).eq("tab_id", tab.id).eq("venue_id", table.venueId).order("created_at")) as OrderRow[];
  const lines = await linesFor(orders.map((o) => o.id), table.venueId);
  const calls = must(await db().from("table_requests").select("kind").eq("tab_id", tab.id).eq("venue_id", table.venueId).is("handled_at", null)) as { kind: string }[];
  const money = await tabMoney(table.venueId, tab.id);
  const paying = cardOn && (await payingNow(table.venueId, tab.id));
  return {
    rounds: orders.map((o) => ({
      id: o.id,
      status: o.status,
      readyMinutes: o.ready_minutes,
      acceptedAt: o.accepted_at,
      lines: lines.filter((l) => l.order_id === o.id).map((l) => ({ nameEn: l.name_en, nameAr: l.name_ar, qty: l.qty, note: l.note })),
    })),
    totalFils: money.totalFils,
    paidFils: money.paidFils,
    balanceFils: money.balanceFils,
    pay: payState({ enabled: cardOn, balanceFils: money.balanceFils, canClose: money.canClose, paying }),
    calls: calls.map((c) => c.kind),
  };
}

// ---- staff board --------------------------------------------------------------------------------------------------

export async function readBoard(venueId: string) {
  const tables = must(await db().from("venue_tables").select("id, label").eq("venue_id", venueId).eq("active", true).order("label")) as { id: string; label: string }[];
  const labelOf = new Map(tables.map((t) => [t.id, t.label]));
  const tabs = must(await db().from("tabs").select("id, table_id, opened_at").eq("venue_id", venueId).eq("status", "open").order("opened_at")) as TabRow[];
  const tabIds = tabs.map((t) => t.id);
  const orders = tabIds.length ? (must(await db().from("orders").select(ORDER_COLUMNS).eq("venue_id", venueId).in("tab_id", tabIds).order("created_at")) as OrderRow[]) : [];
  const lines = await linesFor(orders.map((o) => o.id), venueId);
  const calls = must(await db().from("table_requests").select("id, table_id, kind, created_at").eq("venue_id", venueId).is("handled_at", null).order("created_at")) as { id: string; table_id: string; kind: string; created_at: string }[];
  const { categories, items } = await menuRows(venueId);
  const label = (id: string) => labelOf.get(id) ?? "?";
  const money = new Map(await Promise.all(tabIds.map(async (id) => [id, { ...(await tabMoney(venueId, id)), paying: await payingNow(venueId, id) }] as const)));
  // Tables that paid by card in the last 10 minutes, so staff can clear them.
  const recent = await recentCardPayments(venueId, new Date(Date.now() - 10 * 60_000).toISOString());
  const recentTabs = recent.length ? (must(await db().from("tabs").select("id, table_id, status").eq("venue_id", venueId).in("id", [...new Set(recent.map((p) => p.tab_id))])) as { id: string; table_id: string; status: string }[]) : [];
  const tabOf = new Map(recentTabs.map((t) => [t.id, t]));

  return {
    now: new Date().toISOString(),
    tables,
    calls: calls.map((c) => ({ id: c.id, table: label(c.table_id), kind: c.kind, at: c.created_at })),
    orders: orders
      .filter((o) => o.status === "new" || o.status === "accepted" || o.status === "ready")
      .map((o) => ({
        id: o.id,
        table: label(o.table_id),
        status: o.status,
        source: o.source,
        at: o.created_at,
        acceptedAt: o.accepted_at,
        readyMinutes: o.ready_minutes,
        lines: lines.filter((l) => l.order_id === o.id).map((l) => ({ name: l.name_en, qty: l.qty, note: l.note })),
      })),
    tabs: tabs.map((t) => {
      const own = orders.filter((o) => o.tab_id === t.id);
      const m = money.get(t.id);
      return {
        id: t.id,
        table: label(t.table_id),
        openedAt: t.opened_at,
        totalFils: liveTotal(own, lines.filter((l) => own.some((o) => o.id === l.order_id))),
        paidFils: m?.paidFils ?? 0,
        balanceFils: m?.balanceFils ?? 0,
        paying: m?.paying ?? false,
        canClose: tabCanClose(own),
      };
    }),
    cardPaid: recent.map((p) => ({ id: p.id, table: label(tabOf.get(p.tab_id)?.table_id ?? ""), amountFils: p.amount_fils, method: p.method, at: p.paid_at, closed: tabOf.get(p.tab_id)?.status === "paid" })),
    menu: categories.map((c) => ({
      id: c.id,
      name: c.name_en,
      items: items.filter((i) => i.category_id === c.id).map((i) => ({ id: i.id, name: i.name_en, priceFils: i.price_fils, available: i.available })),
    })),
  };
}

export type ActResult = "ok" | "not_found" | "not_allowed" | "changed";

export async function actOnOrder(venueId: string, orderId: string, action: OrderAction, minutes?: number): Promise<ActResult> {
  const order = must(await db().from("orders").select("id, status").eq("id", orderId).eq("venue_id", venueId).maybeSingle()) as { status: OrderStatus } | null;
  if (!order) return "not_found";
  const patch = orderPatch(order.status, action, minutes, new Date().toISOString());
  if (!patch) return "not_allowed";
  // Only if nobody else moved it since it was read.
  const moved = must(await db().from("orders").update(patch).eq("id", orderId).eq("venue_id", venueId).eq("status", order.status).select("id")) as unknown[];
  return moved.length ? "ok" : "changed";
}

export async function handleRequest(venueId: string, requestId: string, staffId: string): Promise<boolean> {
  const done = must(await db().from("table_requests").update({ handled_at: new Date().toISOString(), handled_by: staffId }).eq("id", requestId).eq("venue_id", venueId).is("handled_at", null).select("id")) as unknown[];
  return done.length > 0;
}

/** Marks the rest of a tab paid in cash and closes it, with any calls still open on it. Card first, then cash, is "mixed". */
export async function closeTabCash(venueId: string, tabId: string, staffId: string): Promise<"ok" | "not_found" | "unfinished"> {
  const tab = must(await db().from("tabs").select("id").eq("id", tabId).eq("venue_id", venueId).eq("status", "open").maybeSingle());
  if (!tab) return "not_found";
  const orders = must(await db().from("orders").select("status").eq("tab_id", tabId).eq("venue_id", venueId)) as { status: string }[];
  if (!tabCanClose(orders)) return "unfinished";
  const now = new Date().toISOString();
  must(await db().from("table_requests").update({ handled_at: now, handled_by: staffId }).eq("tab_id", tabId).eq("venue_id", venueId).is("handled_at", null).select("id"));
  const { paidFils } = await tabMoney(venueId, tabId);
  const closed = must(await db().from("tabs").update({ status: "paid", paid_method: paidFils > 0 ? "mixed" : "cash", closed_at: now, closed_by: staffId }).eq("id", tabId).eq("venue_id", venueId).eq("status", "open").select("id")) as unknown[];
  return closed.length ? "ok" : "not_found";
}

export async function setItemAvailable(venueId: string, itemId: string, available: boolean): Promise<boolean> {
  const done = must(await db().from("menu_items").update({ available }).eq("id", itemId).eq("venue_id", venueId).eq("active", true).select("id")) as unknown[];
  return done.length > 0;
}

export async function venueTable(venueId: string, tableId: string) {
  const t = must(await db().from("venue_tables").select("id").eq("id", tableId).eq("venue_id", venueId).eq("active", true).maybeSingle());
  return t ? { id: tableId, venueId } : null;
}

// ---- owner --------------------------------------------------------------------------------------------------------

export const newTableToken = () => randomBytes(18).toString("base64url");

export async function listTables(venueId: string) {
  const rows = must(await db().from("venue_tables").select("id, label, token").eq("venue_id", venueId).eq("active", true).order("label")) as { id: string; label: string; token: string }[];
  return rows;
}

export async function addTable(venueId: string, label: string): Promise<"ok" | "duplicate"> {
  const { error } = await db().from("venue_tables").insert({ venue_id: venueId, label, token: newTableToken() });
  if (!error) return "ok";
  if ((error as { code?: string }).code === "23505") return "duplicate";
  throw new Error(error.message);
}

/** Removing a table stops its QR code working. Old orders stay for the reports. */
export async function removeTable(venueId: string, tableId: string): Promise<"ok" | "not_found" | "open_tab"> {
  if (await openTabOf(tableId, venueId)) return "open_tab";
  const done = must(await db().from("venue_tables").update({ active: false }).eq("id", tableId).eq("venue_id", venueId).select("id")) as unknown[];
  return done.length ? "ok" : "not_found";
}

export async function addCategory(venueId: string, nameEn: string, nameAr: string | null) {
  must(await db().from("menu_categories").insert({ venue_id: venueId, name_en: nameEn, name_ar: nameAr, sort: Date.now() % 2_000_000_000 }).select("id"));
}

export type ItemFields = { nameEn: string; nameAr: string | null; noteEn: string | null; noteAr: string | null; priceFils: number };
const itemColumns = (f: ItemFields) => ({ name_en: f.nameEn, name_ar: f.nameAr, note_en: f.noteEn, note_ar: f.noteAr, price_fils: f.priceFils });

export async function addItem(venueId: string, categoryId: string, fields: ItemFields): Promise<boolean> {
  const category = must(await db().from("menu_categories").select("id").eq("id", categoryId).eq("venue_id", venueId).eq("active", true).maybeSingle());
  if (!category) return false;
  must(await db().from("menu_items").insert({ venue_id: venueId, category_id: categoryId, ...itemColumns(fields), sort: Date.now() % 2_000_000_000 }).select("id"));
  return true;
}

export async function editItem(venueId: string, itemId: string, fields: ItemFields): Promise<boolean> {
  const done = must(await db().from("menu_items").update(itemColumns(fields)).eq("id", itemId).eq("venue_id", venueId).eq("active", true).select("id")) as unknown[];
  return done.length > 0;
}

export async function venueItem(venueId: string, itemId: string): Promise<boolean> {
  return Boolean(must(await db().from("menu_items").select("id").eq("id", itemId).eq("venue_id", venueId).eq("active", true).maybeSingle()));
}

export async function setItemPhoto(venueId: string, itemId: string, imageUrl: string | null): Promise<boolean> {
  const done = must(await db().from("menu_items").update({ image_url: imageUrl }).eq("id", itemId).eq("venue_id", venueId).eq("active", true).select("id")) as unknown[];
  return done.length > 0;
}

export async function removeItem(venueId: string, itemId: string): Promise<boolean> {
  const done = must(await db().from("menu_items").update({ active: false }).eq("id", itemId).eq("venue_id", venueId).select("id")) as unknown[];
  return done.length > 0;
}

const PAGE = 1000;

/** All rows of a venue from a date on, a page at a time: the database hands out at most 1000 rows per call. */
async function allSince<T>(table: string, columns: string, venueId: string, since: string, dateColumn = "created_at"): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = must(await db().from(table).select(columns).eq("venue_id", venueId).gte(dateColumn, since).order(dateColumn).range(from, from + PAGE - 1)) as unknown as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export async function serviceReport(venueId: string, sinceIso: string) {
  const orders = await allSince<{ id: string; status: string; created_at: string; accepted_at: string | null; ready_at: string | null }>("orders", "id, status, created_at, accepted_at, ready_at", venueId, sinceIso);
  const lines = await allSince<{ order_id: string; name_en: string; price_fils: number; qty: number; created_at: string }>("order_items", "order_id, name_en, price_fils, qty, created_at", venueId, sinceIso);
  const requests = await allSince<{ kind: string; created_at: string; handled_at: string | null }>("table_requests", "kind, created_at, handled_at", venueId, sinceIso);
  const cancelled = new Set(orders.filter((o) => o.status === "cancelled").map((o) => o.id));
  return {
    rounds: orders.length - cancelled.size,
    waits: waitTable(orders.filter((o) => !cancelled.has(o.id)), requests),
    sales: salesReport(lines, cancelled),
  };
}
