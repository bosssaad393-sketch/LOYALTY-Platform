import "server-only";
import { z } from "zod";
import { db } from "./supabase";
import type { Staff } from "./staffAuth";
import { listBranches } from "./branchesDb";
import { sortVouchers, type CardVoucher, type VoucherTrigger } from "./vouchers";

// Vouchers (migration 0022). The rules (once per guest, redeemed once, right branch, expiry) live in the database
// functions ledger_visit, voucher_redeem and voucher_void; this file only calls them and reads the results.

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error(`${fn} returned nothing`);
  return row as T;
}

export type VisitResult = { ledger_id: number; visits: number; vouchers_issued: number };

/** One paid visit, at one branch. Unlocks whatever vouchers the visit earns. */
export const recordVisit = (cardId: string, staffId: string, branchId: string | null) =>
  call<VisitResult>("ledger_visit", { p_card: cardId, p_staff: staffId, p_branch: branchId });

export const redeemVoucher = (cardVoucherId: string, staffId: string, branchId: string | null) =>
  call<{ card_voucher_id: string; redeemed_at: string }>("voucher_redeem", { p_card_voucher: cardVoucherId, p_staff: staffId, p_branch: branchId });

export const voidVoucher = (cardVoucherId: string, staffId: string) =>
  call<{ card_voucher_id: string }>("voucher_void", { p_card_voucher: cardVoucherId, p_staff: staffId });

export type Voucher = {
  id: string; title: string; titleAr: string | null; detail: string | null; detailAr: string | null;
  trigger: VoucherTrigger; redeemBranchId: string | null; validDays: number | null; active: boolean;
};

type Raw = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const toVoucher = (r: Raw): Voucher => ({
  id: String(r.id), title: String(r.title), titleAr: text(r.title_ar), detail: text(r.detail), detailAr: text(r.detail_ar),
  trigger: (["first_visit", "every_visit", "manual"].includes(String(r.trigger)) ? r.trigger : "first_visit") as VoucherTrigger,
  redeemBranchId: text(r.redeem_branch_id), validDays: r.valid_days === null || r.valid_days === undefined ? null : Number(r.valid_days), active: r.active !== false,
});

const VOUCHER_COLUMNS = "id, venue_id, title, title_ar, detail, detail_ar, trigger, redeem_branch_id, valid_days, active, created_at";

/** The venue's voucher definitions. Never throws: an older database has none. */
export async function listVouchers(venueId: string): Promise<Voucher[]> {
  try {
    const { data, error } = await db().from("vouchers").select(VOUCHER_COLUMNS).eq("venue_id", venueId).order("created_at", { ascending: true });
    return error ? [] : (data ?? []).map((r) => toVoucher(r as Raw));
  } catch {
    return [];
  }
}

/** The vouchers on one card, ready ones first. `venueId` keeps the read inside the caller's venue. Never throws. */
export async function cardVouchers(cardId: string, venueId: string): Promise<CardVoucher[]> {
  try {
    const { data, error } = await db().from("card_vouchers")
      .select("id, voucher_id, status, issued_at, expires_at, redeemed_at")
      .eq("card_id", cardId).eq("venue_id", venueId);
    if (error || !data?.length) return [];
    const [defs, branches] = await Promise.all([listVouchers(venueId), listBranches(venueId, { includeInactive: true })]);
    const out: CardVoucher[] = [];
    for (const r of data as Raw[]) {
      const def = defs.find((d) => d.id === r.voucher_id);
      if (!def) continue;
      out.push({
        id: String(r.id), voucherId: def.id, title: def.title, titleAr: def.titleAr, detail: def.detail, detailAr: def.detailAr,
        status: (["issued", "redeemed", "void"].includes(String(r.status)) ? r.status : "void") as CardVoucher["status"],
        issuedAt: String(r.issued_at), expiresAt: text(r.expires_at), redeemedAt: text(r.redeemed_at),
        redeemBranchId: def.redeemBranchId, redeemBranchName: branches.find((b) => b.id === def.redeemBranchId)?.name ?? null,
      });
    }
    return sortVouchers(out);
  } catch {
    return [];
  }
}

/** When the vouchers on these cards last changed (unlocked, used or cancelled), for Apple Wallet's update check. */
export async function voucherStamps(cardIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!cardIds.length) return out;
  try {
    const { data, error } = await db().from("card_vouchers").select("card_id, issued_at, redeemed_at, voided_at").in("card_id", cardIds);
    if (error) return out;
    for (const r of (data ?? []) as Raw[]) {
      const t = Math.max(...[r.issued_at, r.redeemed_at, r.voided_at].map((x) => (x ? Date.parse(String(x)) : 0)));
      if (t > (out.get(String(r.card_id)) ?? 0)) out.set(String(r.card_id), t);
    }
  } catch { /* best effort */ }
  return out;
}

const blank = (max: number) => z.string().trim().max(max).transform((v) => v || null);
export const VoucherInput = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1).max(80),
  titleAr: blank(80).optional().default(null),
  detail: blank(300).optional().default(null),
  detailAr: blank(300).optional().default(null),
  trigger: z.enum(["first_visit", "every_visit", "manual"]).default("first_visit"),
  redeemBranchId: z.uuid().nullable().optional().default(null),
  validDays: z.number().int().min(1).max(730).nullable().optional().default(null),
  active: z.boolean().default(true),
});
export type VoucherInput = z.infer<typeof VoucherInput>;

/** Adds or changes a voucher of the SIGNED-IN person's venue. The branch must be one of that venue's. Audited. */
export async function saveVoucher(staff: Staff, input: VoucherInput): Promise<Voucher | "not_found" | "bad_branch"> {
  if (input.redeemBranchId && !(await listBranches(staff.venueId, { includeInactive: true })).some((b) => b.id === input.redeemBranchId)) return "bad_branch";
  const row = {
    title: input.title, title_ar: input.titleAr, detail: input.detail, detail_ar: input.detailAr, trigger: input.trigger,
    redeem_branch_id: input.redeemBranchId, valid_days: input.validDays, active: input.active,
  };
  if (input.id) {
    const { data, error } = await db().from("vouchers").update(row).eq("id", input.id).eq("venue_id", staff.venueId).select(VOUCHER_COLUMNS);
    if (error) throw error;
    const saved = (data ?? [])[0];
    if (!saved) return "not_found";
    await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "voucher_changed", detail: { voucher: input.id, title: input.title, active: input.active } });
    return toVoucher(saved as Raw);
  }
  const { data, error } = await db().from("vouchers").insert({ ...row, venue_id: staff.venueId }).select(VOUCHER_COLUMNS).single();
  if (error) throw error;
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "voucher_added", detail: { voucher: (data as { id: string }).id, title: input.title } });
  return toVoucher(data as Raw);
}

/**
 * Counts rows in the database without fetching them (Supabase returns at most 1000 rows per read, so counting fetched
 * rows would go wrong for a busy venue). `q` is a select built with { count: "exact", head: true }.
 */
export async function countOf(q: PromiseLike<{ count?: number | null; data?: unknown; error: unknown }>): Promise<number> {
  const r = await q;
  if (r.error) return 0;
  return typeof r.count === "number" ? r.count : Array.isArray(r.data) ? r.data.length : 0;
}

/** Owner's numbers per voucher: how many unlocked, used, and still waiting (not used, not cancelled, not expired). */
export async function voucherCounts(venueId: string): Promise<Record<string, { issued: number; redeemed: number; waiting: number }>> {
  const out: Record<string, { issued: number; redeemed: number; waiting: number }> = {};
  try {
    const now = new Date().toISOString();
    const of = (voucherId: string, status: string) => db().from("card_vouchers").select("id", { count: "exact", head: true }).eq("venue_id", venueId).eq("voucher_id", voucherId).eq("status", status);
    for (const v of await listVouchers(venueId)) {
      const [redeemed, open, expired] = await Promise.all([
        countOf(of(v.id, "redeemed")),
        countOf(of(v.id, "issued")),
        countOf(of(v.id, "issued").lt("expires_at", now)),
      ]);
      out[v.id] = { issued: redeemed + open, redeemed, waiting: Math.max(0, open - expired) };
    }
  } catch { /* best effort */ }
  return out;
}
