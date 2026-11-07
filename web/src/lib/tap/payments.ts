import "server-only";
import { must } from "../must";
import { db } from "../supabase";
import { awardTabPoints } from "../table/points";
import { tabCanClose } from "../table/rules";
import { createCharge, readCharge, tapConfig } from "./client";
import { judgeCharge, safePayUrl, type PayMethod, type PaymentStatus } from "./rules";

// Card and BENEFIT payments for a table's tab. The rule everywhere: the browser and the webhook only say "look again".
// What counts is the charge read back from Tap by our own stored charge id, checked by judgeCharge.


/** An unpaid Tap page is reused for this long when the guest taps Pay again for the same amount. */
const REUSE_MS = 15 * 60_000;

type PaymentRow = {
  id: string;
  venue_id: string;
  tab_id: string;
  charge_id: string | null;
  amount_fils: number;
  currency: string;
  status: PaymentStatus;
  method: string | null;
  pay_url: string | null;
  created_at: string;
};
const PAYMENT_COLUMNS = "id, venue_id, tab_id, charge_id, amount_fils, currency, status, method, pay_url, created_at";

type TabRow = { id: string; table_id: string; status: string };

/** What the tab comes to, what Tap has already confirmed, and whether every round is finished. */
export async function tabMoney(venueId: string, tabId: string) {
  const orders = must(await db().from("orders").select("id, status").eq("tab_id", tabId).eq("venue_id", venueId)) as { id: string; status: string }[];
  const live = orders.filter((o) => o.status !== "cancelled").map((o) => o.id);
  const lines = live.length
    ? (must(await db().from("order_items").select("order_id, price_fils, qty").eq("venue_id", venueId).in("order_id", live)) as { price_fils: number; qty: number }[])
    : [];
  const totalFils = lines.reduce((s, l) => s + l.price_fils * l.qty, 0);
  const paid = must(await db().from("payments").select("amount_fils, status").eq("tab_id", tabId).eq("venue_id", venueId).eq("status", "captured")) as { amount_fils: number }[];
  const paidFils = paid.reduce((s, p) => s + p.amount_fils, 0);
  return { totalFils, paidFils, balanceFils: Math.max(0, totalFils - paidFils), canClose: tabCanClose(orders) };
}

/** True while a payment page is open for this tab (started in the last 15 minutes, not answered yet). */
export async function payingNow(venueId: string, tabId: string, now = Date.now()) {
  const open = must(await db().from("payments").select("created_at").eq("tab_id", tabId).eq("venue_id", venueId).eq("status", "initiated")) as { created_at: string }[];
  return open.some((p) => now - new Date(p.created_at).getTime() < REUSE_MS);
}

const audit = (venueId: string, action: string, detail: Record<string, unknown>) =>
  db().from("audit_log").insert({ venue_id: venueId, actor: "system", action, detail });

/**
 * Closes the tab once Tap has confirmed enough money and no round is still open.
 * A payment that lands on a tab staff already closed is written to the log, so the owner can refund it from Tap.
 */
async function settleTab(venueId: string, tabId: string, paymentId: string) {
  const tab = must(await db().from("tabs").select("id, table_id, status").eq("id", tabId).eq("venue_id", venueId).maybeSingle()) as TabRow | null;
  if (!tab) return;
  const m = await tabMoney(venueId, tabId);
  if (tab.status !== "open") {
    await audit(venueId, "payment_after_close", { payment: paymentId, tab: tabId, paid_fils: m.paidFils, total_fils: m.totalFils });
    return;
  }
  if (m.paidFils < m.totalFils || !m.canClose) return;
  if (m.paidFils > m.totalFils) await audit(venueId, "payment_overpaid", { payment: paymentId, tab: tabId, paid_fils: m.paidFils, total_fils: m.totalFils });
  const now = new Date().toISOString();
  must(await db().from("table_requests").update({ handled_at: now }).eq("tab_id", tabId).eq("venue_id", venueId).is("handled_at", null).select("id"));
  const closed = must(await db().from("tabs").update({ status: "paid", paid_method: "tap", closed_at: now }).eq("id", tabId).eq("venue_id", venueId).eq("status", "open").select("id")) as unknown[];
  if (closed.length) await awardTabPoints(venueId, tabId);
}

/** Asks Tap about one payment and records the answer. Only a payment still marked initiated can change. */
export async function refreshPayment(p: PaymentRow): Promise<PaymentStatus> {
  if (p.status !== "initiated" || !p.charge_id) return p.status;
  const charge = await readCharge(p.charge_id);
  const judged = judgeCharge({ id: p.id, tabId: p.tab_id, chargeId: p.charge_id, amountFils: p.amount_fils, currency: p.currency }, charge);
  if (judged.status === "initiated") return "initiated";
  const now = new Date().toISOString();
  const changed = must(await db().from("payments").update({
    status: judged.status,
    provider_status: String(charge.status ?? "").slice(0, 40),
    method: judged.status === "captured" ? (charge.source?.payment_method ?? p.method) : p.method,
    note: judged.note,
    updated_at: now,
    paid_at: judged.status === "captured" ? now : null,
  }).eq("id", p.id).eq("venue_id", p.venue_id).eq("status", "initiated").select("id")) as unknown[];
  if (!changed.length) {
    // Someone else (the webhook or the guest's return) recorded it first.
    const again = must(await db().from("payments").select("status").eq("id", p.id).eq("venue_id", p.venue_id).maybeSingle()) as { status: PaymentStatus } | null;
    return again?.status ?? judged.status;
  }
  if (judged.status === "captured") {
    await audit(p.venue_id, "payment_captured", { payment: p.id, tab: p.tab_id, amount_fils: p.amount_fils, charge: p.charge_id });
    await settleTab(p.venue_id, p.tab_id, p.id);
  }
  if (judged.status === "review") await audit(p.venue_id, "payment_review", { payment: p.id, tab: p.tab_id, note: judged.note });
  return judged.status;
}

const openTab = async (tableId: string, venueId: string) =>
  must(await db().from("tabs").select("id, table_id, status").eq("table_id", tableId).eq("venue_id", venueId).eq("status", "open").maybeSingle()) as TabRow | null;

export type StartResult = { ok: true; url: string } | { ok: false; reason: "off" | "nothing" | "wait" | "failed" };

/** Starts paying what is left on the table's tab, and gives back Tap's payment page. */
export async function startPayment(
  table: { id: string; venueId: string; venueSlug: string; venueName: string; label: string },
  token: string,
  method: PayMethod,
  origin?: string,
): Promise<StartResult> {
  const cfg = tapConfig(process.env, origin);
  if (!cfg || cfg.venueSlug !== table.venueSlug || !cfg.baseUrl) return { ok: false, reason: "off" };
  const tab = await openTab(table.id, table.venueId);
  if (!tab) return { ok: false, reason: "nothing" };

  // Anything already sent to Tap is checked first, so a payment made in another browser tab is never asked for twice.
  const open = must(await db().from("payments").select(PAYMENT_COLUMNS).eq("tab_id", tab.id).eq("venue_id", table.venueId).eq("status", "initiated").order("created_at")) as PaymentRow[];
  for (const p of open) {
    const status = await refreshPayment(p).catch(() => "initiated" as const);
    p.status = status;
  }
  const m = await tabMoney(table.venueId, tab.id);
  if (m.balanceFils <= 0) return { ok: false, reason: "nothing" };
  if (!m.canClose) return { ok: false, reason: "wait" };

  const reuse = open.find((p) => p.status === "initiated" && p.pay_url && p.method === method && p.amount_fils === m.balanceFils && Date.now() - new Date(p.created_at).getTime() < REUSE_MS);
  if (reuse?.pay_url) return { ok: true, url: reuse.pay_url };

  const row = must(await db().from("payments").insert({ venue_id: table.venueId, tab_id: tab.id, amount_fils: m.balanceFils, currency: "BHD", status: "initiated", method, created_at: new Date().toISOString() }).select(PAYMENT_COLUMNS).single()) as PaymentRow;
  const fail = async (note: string) => {
    await db().from("payments").update({ status: "failed", note: note.slice(0, 300), updated_at: new Date().toISOString() }).eq("id", row.id).eq("venue_id", table.venueId);
    return { ok: false as const, reason: "failed" as const };
  };
  try {
    const charge = await createCharge({
      paymentId: row.id,
      tabId: tab.id,
      method,
      amountFils: m.balanceFils,
      description: `${table.venueName}, table ${table.label}`,
      redirectUrl: `${cfg.baseUrl}/t/${token}?pay=${row.id}`,
      webhookUrl: `${cfg.baseUrl}/api/tap/webhook`,
    });
    const url = cfg.mode === "fake" ? charge.transaction?.url ?? null : safePayUrl(charge.transaction?.url);
    if (!url) return fail("Tap gave no payment page.");
    must(await db().from("payments").update({ charge_id: charge.id, pay_url: url, provider_status: String(charge.status ?? "").slice(0, 40), updated_at: new Date().toISOString() }).eq("id", row.id).eq("venue_id", table.venueId).select("id"));
    return { ok: true, url };
  } catch (e) {
    console.error("tap charge failed", e instanceof Error ? e.message : e);
    return fail(e instanceof Error ? e.message : "Tap did not answer.");
  }
}

/** The guest is back from Tap's page. Only a payment of this table's own tab can be checked from this table. */
export async function checkPayment(table: { id: string; venueId: string }, paymentId: string): Promise<PaymentStatus | null> {
  const p = must(await db().from("payments").select(PAYMENT_COLUMNS).eq("id", paymentId).eq("venue_id", table.venueId).maybeSingle()) as PaymentRow | null;
  if (!p) return null;
  const tab = must(await db().from("tabs").select("id, table_id").eq("id", p.tab_id).eq("venue_id", table.venueId).maybeSingle()) as { table_id: string } | null;
  if (!tab || tab.table_id !== table.id) return null;
  return refreshPayment(p);
}

/** Tap's webhook: find our payment by its charge id and look again. Unknown charges are ignored. */
export async function paymentByCharge(chargeId: string) {
  return must(await db().from("payments").select(PAYMENT_COLUMNS).eq("charge_id", chargeId).maybeSingle()) as PaymentRow | null;
}

/** Card payments of the last few minutes, so staff see which tables just paid and can clear them. */
export async function recentCardPayments(venueId: string, sinceIso: string) {
  return must(await db().from("payments").select("id, tab_id, amount_fils, method, paid_at").eq("venue_id", venueId).eq("status", "captured").gte("paid_at", sinceIso).order("paid_at")) as { id: string; tab_id: string; amount_fils: number; method: string | null; paid_at: string }[];
}
