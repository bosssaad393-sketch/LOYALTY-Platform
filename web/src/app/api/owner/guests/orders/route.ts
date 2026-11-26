import { z } from "zod";
import { db } from "@/lib/supabase";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { listBranches } from "@/lib/branchesDb";
import { favourites, type GuestBill } from "@/lib/guestOrders";

type ReceiptRow = { id: number; receipt: string; branch_id: string | null; total_fils: number; refunded_at: string | null; created_at: string };
type ItemRow = { receipt_id: number; name: string; qty: number; price_fils: number | null };
type TabRow = { id: string; opened_at: string; status: string };
type OrderRow = { id: string; tab_id: string; status: string };
type LineRow = { order_id: string; name_en: string; qty: number; price_fils: number };

/**
 * What one guest ordered: the bills the till sent for their card (migration 0024) and the rounds they ordered from a
 * table's code (tabs tied to their card, 0013), newest first, with the dishes they order most. Owner and manager.
 * A database without 0024 simply has no till bills: the list is then the table orders only.
 */
export async function GET(request: Request) {
  return withOwner(async (staff) => {
    const cardId = new URL(request.url).searchParams.get("cardId") ?? "";
    if (!z.uuid().safeParse(cardId).success) return fail("Guest missing.");
    const { data: card } = await db().from("cards").select("id").eq("id", cardId).eq("venue_id", staff.venueId).maybeSingle();
    if (!card) return fail("Guest not found.", 404);

    const bills: GuestBill[] = [];
    const places = new Map((await listBranches(staff.venueId, { includeInactive: true })).map((b) => [b.id, b.name]));

    const kept = await db().from("receipts").select("id, receipt, branch_id, total_fils, refunded_at, created_at").eq("venue_id", staff.venueId).eq("card_id", cardId).order("created_at", { ascending: false }).limit(50);
    const receipts = (kept.error ? [] : kept.data ?? []) as ReceiptRow[];
    if (receipts.length) {
      const lines = await db().from("receipt_items").select("receipt_id, name, qty, price_fils").eq("venue_id", staff.venueId).in("receipt_id", receipts.map((r) => r.id));
      const byReceipt = new Map<number, ItemRow[]>();
      for (const l of (lines.error ? [] : lines.data ?? []) as ItemRow[]) byReceipt.set(l.receipt_id, [...(byReceipt.get(l.receipt_id) ?? []), l]);
      for (const r of receipts) {
        bills.push({
          id: `r${r.id}`, from: "till", at: r.created_at, place: r.branch_id ? places.get(r.branch_id) ?? null : null, totalFils: r.total_fils, refunded: r.refunded_at !== null,
          items: (byReceipt.get(r.id) ?? []).map((l) => ({ name: l.name, qty: l.qty, priceFils: l.price_fils })),
        });
      }
    }

    const tabsRes = await db().from("tabs").select("id, opened_at, status").eq("venue_id", staff.venueId).eq("card_id", cardId).order("opened_at", { ascending: false }).limit(50);
    const tabs = (tabsRes.error ? [] : tabsRes.data ?? []) as TabRow[];
    if (tabs.length) {
      const ordersRes = await db().from("orders").select("id, tab_id, status").eq("venue_id", staff.venueId).in("tab_id", tabs.map((t) => t.id));
      const orders = ((ordersRes.error ? [] : ordersRes.data ?? []) as OrderRow[]).filter((o) => o.status !== "cancelled");
      const linesRes = orders.length ? await db().from("order_items").select("order_id, name_en, qty, price_fils").eq("venue_id", staff.venueId).in("order_id", orders.map((o) => o.id)) : { data: [], error: null };
      const tabOf = new Map(orders.map((o) => [o.id, o.tab_id]));
      const byTab = new Map<string, LineRow[]>();
      for (const l of (linesRes.error ? [] : linesRes.data ?? []) as LineRow[]) {
        const tab = tabOf.get(l.order_id);
        if (tab) byTab.set(tab, [...(byTab.get(tab) ?? []), l]);
      }
      for (const t of tabs) {
        const lines = byTab.get(t.id) ?? [];
        if (!lines.length) continue;
        bills.push({
          id: `t${t.id}`, from: "table", at: t.opened_at, place: null, totalFils: lines.reduce((s, l) => s + l.price_fils * l.qty, 0), refunded: false,
          items: lines.map((l) => ({ name: l.name_en, qty: l.qty, priceFils: l.price_fils })),
        });
      }
    }

    bills.sort((a, b) => b.at.localeCompare(a.at));
    const counted = bills.filter((b) => !b.refunded);
    return Response.json({ bills: bills.slice(0, 50), favourites: favourites(counted), spentFils: counted.reduce((s, b) => s + b.totalFils, 0), billCount: counted.length });
  });
}
