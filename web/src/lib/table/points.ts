import "server-only";
import { db } from "../supabase";
import { posSale } from "../ledgerDb";
import { refreshWalletCards } from "../staffApi";

// Points for a table's bill, added by themselves. The guest's phone remembers their card (a cookie set when they open their
// own card page); the first card seen on a table's open tab is linked to it, and when the tab is paid the bill's points go to
// that card. The database function does the counting and refuses a second earn for the same tab ("tab:<id>").

export const GUEST_CARD_COOKIE = "orbyn_card";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const must = <T,>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

/** The card id this phone remembers, from a raw Cookie header. Anything that is not a card id counts as none. */
export function guestCardFrom(cookieHeader: string | null): string | null {
  const m = /(?:^|;\s*)orbyn_card=([^;]+)/.exec(cookieHeader ?? "");
  const v = m ? decodeURIComponent(m[1]) : "";
  return UUID.test(v) ? v.toLowerCase() : null;
}

/** Whole points a bill earns at this venue: the same rule as the database (floor of BHD times the rate). */
export const pointsFor = (totalFils: number, perBhd: number) => (totalFils > 0 && perBhd > 0 ? Math.floor((totalFils / 1000) * perBhd) : 0);

type CardRow = { id: string; code: string; venue_id: string; members: { name: string; deleted_at: string | null } | null };

/** A card of this venue whose guest has not deleted their data. */
export async function venueCard(venueId: string, cardId: string): Promise<{ id: string; code: string; firstName: string } | null> {
  if (!UUID.test(cardId)) return null;
  const c = must(await db().from("cards").select("id, code, venue_id, members(name, deleted_at)").eq("id", cardId).eq("venue_id", venueId).maybeSingle()) as unknown as CardRow | null;
  if (!c || !c.members || c.members.deleted_at) return null;
  return { id: c.id, code: String(c.code).trim(), firstName: c.members.name.trim().split(/\s+/)[0] };
}

/** Links the phone's card to the open tab, once: the first card on a tab keeps it. Returns the tab's card after the attempt. */
export async function linkCard(venueId: string, tabId: string, current: string | null, phoneCard: string | null): Promise<string | null> {
  if (current || !phoneCard) return current;
  if (!(await venueCard(venueId, phoneCard))) return null;
  const done = must(await db().from("tabs").update({ card_id: phoneCard }).eq("id", tabId).eq("venue_id", venueId).eq("status", "open").is("card_id", null).select("card_id")) as { card_id: string }[];
  if (done.length) return phoneCard;
  const again = must(await db().from("tabs").select("card_id").eq("id", tabId).eq("venue_id", venueId).maybeSingle()) as { card_id: string | null } | null;
  return again?.card_id ?? null;
}

async function tabTotal(venueId: string, tabId: string): Promise<number> {
  const orders = must(await db().from("orders").select("id, status").eq("tab_id", tabId).eq("venue_id", venueId)) as { id: string; status: string }[];
  const live = orders.filter((o) => o.status !== "cancelled").map((o) => o.id);
  if (!live.length) return 0;
  const lines = must(await db().from("order_items").select("price_fils, qty").eq("venue_id", venueId).in("order_id", live)) as { price_fils: number; qty: number }[];
  return lines.reduce((s, l) => s + l.price_fils * l.qty, 0);
}

/**
 * Called right after a tab is closed as paid. Adds the bill's points to the linked card. Never throws: a payment must not
 * fail because of points, so a problem is written to the log for the owner instead.
 */
export async function awardTabPoints(venueId: string, tabId: string): Promise<number | null> {
  try {
    const tab = must(await db().from("tabs").select("id, status, card_id, points_added").eq("id", tabId).eq("venue_id", venueId).maybeSingle()) as { status: string; card_id: string | null; points_added: number | null } | null;
    if (!tab || tab.status !== "paid" || !tab.card_id || (tab.points_added ?? null) !== null) return null;
    const card = await venueCard(venueId, tab.card_id);
    if (!card) return null;
    const total = await tabTotal(venueId, tabId);
    if (total <= 0) return null;
    let r;
    try {
      r = await posSale(venueId, card.code, total / 1000, `tab:${tabId}`);
    } catch (e) {
      // A bill too small for one point is normal; anything else goes to the log.
      const msg = e instanceof Error ? e.message : String(e);
      if (!/too small/i.test(msg)) await db().from("audit_log").insert({ venue_id: venueId, actor: "system", action: "tab_points_failed", detail: { tab: tabId, error: msg.slice(0, 200) } });
      await db().from("tabs").update({ points_added: 0 }).eq("id", tabId).eq("venue_id", venueId);
      return 0;
    }
    await db().from("tabs").update({ points_added: r.points_added }).eq("id", tabId).eq("venue_id", venueId);
    if (!r.duplicate) await refreshWalletCards(card.id, r.new_balance);
    return r.points_added;
  } catch (e) {
    console.error("tab points failed", e instanceof Error ? e.message : e);
    return null;
  }
}

/** First names of the guests linked to these tabs, for the staff board. Never a phone or email. */
export async function cardNames(venueId: string, cardIds: string[]): Promise<Map<string, string>> {
  if (!cardIds.length) return new Map();
  const rows = must(await db().from("cards").select("id, venue_id, members(name, deleted_at)").eq("venue_id", venueId).in("id", cardIds)) as unknown as CardRow[];
  return new Map(rows.filter((c) => c.members && !c.members.deleted_at).map((c) => [c.id, c.members!.name.trim().split(/\s+/)[0]]));
}

export async function venueRate(venueId: string): Promise<number> {
  const v = must(await db().from("venues").select("points_per_bhd").eq("id", venueId).maybeSingle()) as { points_per_bhd: number } | null;
  return Number(v?.points_per_bhd ?? 0);
}
