import "server-only";
import { z } from "zod";
import { db } from "./supabase";
import type { Staff } from "./staffAuth";
import { listBranches } from "./branchesDb";
import { sortVouchers, VOUCHER_TRIGGERS, type CardVoucher, type VoucherTrigger } from "./vouchers";

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
  /** 'visit_count' only: the visit that unlocks it (2 = the second visit). */
  atVisit: number | null;
};

type Raw = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const toVoucher = (r: Raw): Voucher => ({
  id: String(r.id), title: String(r.title), titleAr: text(r.title_ar), detail: text(r.detail), detailAr: text(r.detail_ar),
  trigger: ((VOUCHER_TRIGGERS as string[]).includes(String(r.trigger)) ? r.trigger : "first_visit") as VoucherTrigger,
  redeemBranchId: text(r.redeem_branch_id), validDays: r.valid_days === null || r.valid_days === undefined ? null : Number(r.valid_days), active: r.active !== false,
  atVisit: r.at_visit === null || r.at_visit === undefined ? null : Number(r.at_visit),
});

const OLD_VOUCHER_COLUMNS = "id, venue_id, title, title_ar, detail, detail_ar, trigger, redeem_branch_id, valid_days, active, created_at";
/** With migration 0025 (the visit number). A database without it is read and written with OLD_VOUCHER_COLUMNS. */
const VOUCHER_COLUMNS = `${OLD_VOUCHER_COLUMNS}, at_visit`;
const noAtVisit = (e: { message?: string } | null) => Boolean(e?.message?.includes("at_visit"));
type Got = { data: unknown; error: { message?: string; code?: string } | null };

/** The venue's voucher definitions. Never throws: an older database has none. */
export async function listVouchers(venueId: string): Promise<Voucher[]> {
  try {
    let got: Got = await db().from("vouchers").select(VOUCHER_COLUMNS).eq("venue_id", venueId).order("created_at", { ascending: true });
    if (noAtVisit(got.error)) got = await db().from("vouchers").select(OLD_VOUCHER_COLUMNS).eq("venue_id", venueId).order("created_at", { ascending: true });
    return got.error ? [] : ((got.data ?? []) as Raw[]).map(toVoucher);
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
  trigger: z.enum(["first_visit", "every_visit", "manual", "visit_count", "birthday"]).default("first_visit"),
  atVisit: z.number().int().min(2).max(1000).nullable().optional().default(null),
  redeemBranchId: z.uuid().nullable().optional().default(null),
  validDays: z.number().int().min(1).max(730).nullable().optional().default(null),
  active: z.boolean().default(true),
});
export type VoucherInput = z.infer<typeof VoucherInput>;

/** The gifts the daily job unlocked today (0025): the cards that got this year's birthday gift. Never throws. */
export async function birthdayGifts(venueId: string, day: { day: number; month: number; year: number }): Promise<string[]> {
  try {
    const leap = new Date(Date.UTC(day.year, 1, 29)).getUTCMonth() === 1;
    const { data, error } = await db().rpc("birthday_gifts", { p_venue: venueId, p_month: day.month, p_day: day.day, p_year: day.year, p_feb29: !leap && day.month === 2 && day.day === 28 });
    if (error) return [];
    return ((data ?? []) as { gift_card: string }[]).map((r) => String(r.gift_card));
  } catch {
    return [];
  }
}

/** Adds or changes a voucher of the SIGNED-IN person's venue. The branch must be one of that venue's. Audited. */
export async function saveVoucher(staff: Staff, input: VoucherInput): Promise<Voucher | "not_found" | "bad_branch" | "no_visit_number"> {
  if (input.trigger === "visit_count" && input.atVisit === null) return "no_visit_number";
  if (input.redeemBranchId && !(await listBranches(staff.venueId, { includeInactive: true })).some((b) => b.id === input.redeemBranchId)) return "bad_branch";
  const old = {
    title: input.title, title_ar: input.titleAr, detail: input.detail, detail_ar: input.detailAr, trigger: input.trigger,
    redeem_branch_id: input.redeemBranchId, valid_days: input.validDays, active: input.active,
  };
  const row = { ...old, at_visit: input.trigger === "visit_count" ? input.atVisit : null };
  if (input.id) {
    let got: Got = await db().from("vouchers").update(row).eq("id", input.id).eq("venue_id", staff.venueId).select(VOUCHER_COLUMNS);
    if (noAtVisit(got.error)) got = await db().from("vouchers").update(old).eq("id", input.id).eq("venue_id", staff.venueId).select(OLD_VOUCHER_COLUMNS);
    if (got.error) throw got.error;
    const saved = ((got.data ?? []) as Raw[])[0];
    if (!saved) return "not_found";
    await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "voucher_changed", detail: { voucher: input.id, title: input.title, active: input.active } });
    return toVoucher(saved as Raw);
  }
  let made: Got = await db().from("vouchers").insert({ ...row, venue_id: staff.venueId }).select(VOUCHER_COLUMNS).single();
  if (noAtVisit(made.error)) made = await db().from("vouchers").insert({ ...old, venue_id: staff.venueId }).select(OLD_VOUCHER_COLUMNS).single();
  if (made.error) throw made.error;
  const data = made.data;
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

/**
 * The owner or a manager puts a gift on one guest's card by hand (any active gift of this venue; a guest holds each
 * gift once, ever). The card and the gift must both belong to the signed-in person's venue. Audited.
 */
export async function giveVoucher(staff: Staff, cardId: string, voucherId: string): Promise<"given" | "no_card" | "no_gift" | "has_it"> {
  const { data: card, error } = await db().from("cards").select("id").eq("id", cardId).eq("venue_id", staff.venueId).maybeSingle();
  if (error) throw error;
  if (!card) return "no_card";
  const gift = (await listVouchers(staff.venueId)).find((v) => v.id === voucherId && v.active);
  if (!gift) return "no_gift";
  // Any copy counts (a birthday gift has one per year): a gift is given by hand once.
  const { data: held } = await db().from("card_vouchers").select("id").eq("card_id", cardId).eq("voucher_id", voucherId).limit(1);
  if (((held ?? []) as unknown[]).length) return "has_it";
  const now = Date.now();
  const { error: e2 } = await db().from("card_vouchers").insert({
    card_id: cardId, venue_id: staff.venueId, voucher_id: voucherId, status: "issued", issued_at: new Date(now).toISOString(), issued_by: staff.id,
    expires_at: gift.validDays ? new Date(now + gift.validDays * 86_400_000).toISOString() : null,
  });
  // 23505: two taps at once. The first one gave it.
  if (e2) { if ((e2 as { code?: string }).code === "23505") return "has_it"; throw e2; }
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "voucher_given", detail: { card: cardId, voucher: voucherId, title: gift.title } });
  return "given";
}
