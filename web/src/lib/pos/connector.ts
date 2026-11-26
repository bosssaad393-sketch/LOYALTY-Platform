import "server-only";
import { z } from "zod";
import { db } from "../supabase";
import type { Staff } from "../staffAuth";
import { posReceipt, posReceiptRefund, posRefund, posSale } from "../ledgerDb";
import { refreshWalletCards } from "../staffApi";
import { inviterOf } from "../cards";
import { createRateLimiter } from "../rateLimit";
import { bearerKey, hashKey, newKey, sameHash } from "./keys";

/**
 * Connects a business's till (POS) to its loyalty program. One adapter exists and works with ANY till that can send an HTTPS
 * request after a sale: the "generic webhook". Named systems stay "planned" until their real API has been checked; nothing is
 * promised for them. The venue is always found from the API key (never from the request body), so a key can only ever touch its own business.
 */

export const PROVIDERS = [
  { id: "generic", name: "Generic webhook (JSON)", status: "available", note: "Any till or POS that can send an HTTPS request after each sale or refund." },
  { id: "foodics", name: "Foodics", status: "planned", note: "Not connected. Needs a review of their API and a partner account first." },
  { id: "square", name: "Square", status: "planned", note: "Not connected. Needs a review of their API first." },
  { id: "lightspeed", name: "Lightspeed", status: "planned", note: "Not connected. Needs a review of their API first." },
  { id: "simphony", name: "Oracle Simphony", status: "planned", note: "Not connected. Needs a review of their API first." },
  { id: "invo", name: "Invo POS", status: "planned", note: "Not connected. Needs their API documents or a way to send each paid bill first." },
] as const;

const Receipt = z.string().trim().min(1).max(64).regex(/^[\w.\-:/#]+$/);
const PosEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping") }),
  z.object({
    type: z.literal("sale"), receiptId: Receipt, cardCode: z.string().regex(/^\d{4}$/), billBhd: z.number().positive().max(5000),
    // Optional: what was ordered, kept against the guest so the owner can see it; and which branch the till is in.
    items: z.array(z.object({ name: z.string().trim().min(1).max(120), qty: z.number().int().min(1).max(99).default(1), priceBhd: z.number().min(0).max(5000).optional() })).max(100).optional(),
    branch: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,40}$/).optional(),
  }),
  z.object({ type: z.literal("refund"), receiptId: Receipt }),
]);

const limiter = createRateLimiter({ limit: 120, windowMs: 60_000 });

export type PosResult = { status: number; body: Record<string, unknown> };

async function log(venueId: string, kind: "sale" | "refund" | "ping", outcome: "ok" | "duplicate" | "rejected" | "error", receipt?: string, points?: number, detail?: string) {
  try {
    await db().from("pos_events").insert({ venue_id: venueId, kind, receipt: receipt ?? null, outcome, points: points ?? null, detail: detail?.slice(0, 200) ?? null });
    await db().from("pos_connections").update({ last_event_at: new Date().toISOString() }).eq("venue_id", venueId);
  } catch (e) {
    console.error("pos log failed", e instanceof Error ? e.message : e);
  }
}

/** What went wrong in plain words for the till, from the database's message. */
function reason(message: string): string | null {
  const m = message.toLowerCase();
  if (m.includes("card not found")) return "unknown card code";
  if (m.includes("branch not found")) return "unknown branch";
  if (m.includes("invalid items")) return "the items could not be read";
  if (m.includes("invalid bill") || m.includes("too small")) return "the bill amount cannot earn points";
  if (m.includes("below zero")) return "the guest has already used these points";
  if (m.includes("receipt not found")) return "no sale with that receipt id";
  if (m.includes("not active")) return "this business is not active";
  return null;
}

/** The webhook: the POS calls this after a sale or refund. `authorization` is the raw Authorization header. */
export async function receiveEvent(authorization: string | null, rawBody: unknown): Promise<PosResult> {
  const key = bearerKey(authorization);
  if (!key) return { status: 401, body: { error: "unauthorized" } };
  const hash = hashKey(key);
  const { data: conn, error } = await db().from("pos_connections").select("venue_id, status, key_hash").eq("key_hash", hash).maybeSingle();
  if (error) return { status: 500, body: { error: "try again" } };
  if (!conn || conn.status !== "active" || !sameHash(conn.key_hash as string, hash)) return { status: 401, body: { error: "unauthorized" } };
  const venueId = conn.venue_id as string;
  if (!limiter.allow(hash)) return { status: 429, body: { error: "too many requests" } };

  const parsed = PosEvent.safeParse(rawBody);
  if (!parsed.success) return { status: 400, body: { error: "bad request", hint: 'send {"type":"sale","receiptId":"...","cardCode":"1234","billBhd":12.5,"items":[{"name":"...","qty":1,"priceBhd":2.5}]}, {"type":"refund","receiptId":"..."} or {"type":"ping"}' } };
  const ev = parsed.data;

  if (ev.type === "ping") {
    await log(venueId, "ping", "ok");
    return { status: 200, body: { ok: true } };
  }

  // A visit-card venue has no points: the bill is kept against the guest and counts as the visit.
  const visitVenue = await isVisitVenue(venueId);

  try {
    if (ev.type === "sale" && visitVenue) {
      const bill = Math.round(ev.billBhd * 1000) / 1000;
      const r = await posReceipt(venueId, ev.cardCode, ev.receiptId, bill, ev.items ?? [], ev.branch ?? null);
      await log(venueId, "sale", r.duplicate ? "duplicate" : "ok", ev.receiptId, 0);
      if (!r.duplicate) {
        try {
          await refreshWalletCards(r.guest_card, 0);
          if (r.visit_counted && r.visits === 1) { const inviter = await inviterOf(r.guest_card); if (inviter) await refreshWalletCards(inviter, 0); }
        } catch (e) {
          console.error("wallet refresh after POS sale failed", e instanceof Error ? e.message : e);
        }
      }
      return { status: 200, body: { ok: true, duplicate: r.duplicate, visitCounted: r.visit_counted, visits: r.visits, giftsUnlocked: r.vouchers_issued, itemsSaved: r.duplicate ? 0 : (ev.items ?? []).length } };
    }
    if (ev.type === "refund" && visitVenue) {
      const r = await posReceiptRefund(venueId, ev.receiptId);
      await log(venueId, "refund", r.duplicate ? "duplicate" : "ok", ev.receiptId, 0);
      return { status: 200, body: { ok: true, duplicate: r.duplicate } };
    }
    if (ev.type === "sale") {
      const bill = Math.round(ev.billBhd * 1000) / 1000;
      const r = await posSale(venueId, ev.cardCode, bill, ev.receiptId);
      // The bill and its lines are kept too, where the database has 0024. Never fails the sale.
      await posReceipt(venueId, ev.cardCode, ev.receiptId, bill, ev.items ?? [], ev.branch ?? null).catch((e) => console.error("receipt not kept", e instanceof Error ? e.message : e));
      if (r.duplicate) {
        await log(venueId, "sale", "duplicate", ev.receiptId, 0);
        return { status: 200, body: { ok: true, duplicate: true, pointsAdded: 0, balance: r.new_balance } };
      }
      await log(venueId, "sale", "ok", ev.receiptId, r.points_added);
      try {
        const { data: card } = await db().from("cards").select("id").eq("venue_id", venueId).eq("code", ev.cardCode).maybeSingle();
        if (card) await refreshWalletCards(card.id as string, r.new_balance);
      } catch (e) {
        console.error("wallet refresh after POS sale failed", e instanceof Error ? e.message : e);
      }
      return { status: 200, body: { ok: true, duplicate: false, pointsAdded: r.points_added, balance: r.new_balance } };
    }
    const r = await posRefund(venueId, ev.receiptId);
    await posReceiptRefund(venueId, ev.receiptId).catch(() => null);
    if (r.duplicate) {
      await log(venueId, "refund", "duplicate", ev.receiptId, 0);
      return { status: 200, body: { ok: true, duplicate: true, pointsRemoved: 0, balance: r.new_balance } };
    }
    await log(venueId, "refund", "ok", ev.receiptId, -r.points_removed);
    try {
      const { data: row } = await db().from("ledger").select("card_id").eq("id", r.ledger_id).eq("venue_id", venueId).maybeSingle();
      if (row) await refreshWalletCards(row.card_id as string, r.new_balance);
    } catch (e) {
      console.error("wallet refresh after POS refund failed", e instanceof Error ? e.message : e);
    }
    return { status: 200, body: { ok: true, duplicate: false, pointsRemoved: r.points_removed, balance: r.new_balance } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const why = reason(msg);
    if (why) {
      await log(venueId, ev.type, "rejected", ev.receiptId, undefined, why);
      return { status: 422, body: { ok: false, error: why } };
    }
    console.error("pos event failed", msg);
    await log(venueId, ev.type, "error", ev.receiptId, undefined, "server error");
    return { status: 500, body: { ok: false, error: "try again" } };
  }
}

async function isVisitVenue(venueId: string): Promise<boolean> {
  const { data } = await db().from("venues").select("card_mode").eq("id", venueId).maybeSingle();
  return (data as { card_mode?: string | null } | null)?.card_mode === "visits";
}

// ---- the developer area ----
export type PosStatus = {
  configured: boolean;
  status: "active" | "disabled" | null;
  keyPrefix: string | null;
  lastEventAt: string | null;
  providers: typeof PROVIDERS;
  events: { id: number; kind: string; receipt: string | null; outcome: string; points: number | null; detail: string | null; createdAt: string }[];
};

export async function posStatus(staff: Staff): Promise<PosStatus> {
  const { data: c, error } = await db().from("pos_connections").select("status, key_prefix, last_event_at").eq("venue_id", staff.venueId).maybeSingle();
  if (error) throw error;
  const { data: ev, error: e2 } = await db().from("pos_events").select("id, kind, receipt, outcome, points, detail, created_at").eq("venue_id", staff.venueId).order("created_at", { ascending: false }).limit(20);
  if (e2) throw e2;
  return {
    configured: !!c,
    status: (c?.status as "active" | "disabled" | undefined) ?? null,
    keyPrefix: (c?.key_prefix as string | undefined) ?? null,
    lastEventAt: (c?.last_event_at as string | null | undefined) ?? null,
    providers: PROVIDERS,
    events: (ev ?? []).map((r) => ({ id: r.id as number, kind: r.kind as string, receipt: (r.receipt as string | null) ?? null, outcome: r.outcome as string, points: (r.points as number | null) ?? null, detail: (r.detail as string | null) ?? null, createdAt: r.created_at as string })),
  };
}

/** Makes or replaces the key for THIS venue. The plain key is returned once and never stored. The old key stops working at once. */
export async function generateKey(staff: Staff): Promise<{ key: string; prefix: string }> {
  const k = newKey();
  const { data: existing, error } = await db().from("pos_connections").select("id").eq("venue_id", staff.venueId).maybeSingle();
  if (error) throw error;
  if (existing) {
    const { error: e2 } = await db().from("pos_connections").update({ key_hash: k.hash, key_prefix: k.prefix, status: "active", rotated_at: new Date().toISOString() }).eq("venue_id", staff.venueId);
    if (e2) throw e2;
  } else {
    const { error: e3 } = await db().from("pos_connections").insert({ venue_id: staff.venueId, provider: "generic", status: "active", key_hash: k.hash, key_prefix: k.prefix });
    if (e3) throw e3;
  }
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: existing ? "pos_key_rotated" : "pos_key_created", detail: { prefix: k.prefix } });
  return { key: k.key, prefix: k.prefix };
}

export async function setPosStatus(staff: Staff, status: "active" | "disabled"): Promise<boolean> {
  const { data, error } = await db().from("pos_connections").update({ status }).eq("venue_id", staff.venueId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) return false;
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: status === "active" ? "pos_enabled" : "pos_disabled", detail: {} });
  return true;
}
