// Vouchers (migration 0022): a voucher a venue defines is unlocked on a guest's card once and redeemed once.
// Pure rules shared by the staff screen, the guest card and the Wallet pass. The database enforces them (voucher_redeem).

/** 0025 adds 'visit_count' (one chosen visit, see atVisit) and 'birthday' (every year, from the daily job). */
export type VoucherTrigger = "first_visit" | "every_visit" | "manual" | "visit_count" | "birthday" | "friend";
export const VOUCHER_TRIGGERS: VoucherTrigger[] = ["first_visit", "visit_count", "birthday", "friend", "every_visit", "manual"];

/**
 * The next gift on the ladder: the nearest 'visit_count' gift still ahead of this guest, with how many visits are left.
 * A gift the guest already holds (given by hand, say) is skipped.
 */
export function nextMilestone<T extends { id: string; trigger: VoucherTrigger; atVisit: number | null; active: boolean }>(defs: T[], visits: number, heldIds: string[]): { gift: T; left: number } | null {
  const ahead = defs.filter((d) => d.active && d.trigger === "visit_count" && d.atVisit !== null && d.atVisit > visits && !heldIds.includes(d.id)).sort((a, b) => a.atVisit! - b.atVisit!);
  return ahead.length ? { gift: ahead[0], left: ahead[0].atVisit! - visits } : null;
}

export type CardVoucher = {
  id: string;
  voucherId: string;
  title: string;
  titleAr: string | null;
  detail: string | null;
  detailAr: string | null;
  status: "issued" | "redeemed" | "void";
  issuedAt: string;
  expiresAt: string | null;
  redeemedAt: string | null;
  /** Where it can be used: null = any branch of the venue. */
  redeemBranchId: string | null;
  redeemBranchName: string | null;
  /** The owner's photo of this gift (migration 0033), shown in the card's niche while the gift waits. */
  imageUrl?: string | null;
};

export type VoucherState = "ready" | "used" | "expired" | "cancelled";

export function voucherState(v: Pick<CardVoucher, "status" | "expiresAt">, now: number = Date.now()): VoucherState {
  if (v.status === "redeemed") return "used";
  if (v.status === "void") return "cancelled";
  if (v.expiresAt && Date.parse(v.expiresAt) < now) return "expired";
  return "ready";
}

/** Can this counter redeem it now? `branchId` is where the staff member is working (null = venue without branches). */
export function redeemableHere(v: CardVoucher, branchId: string | null, now: number = Date.now()): boolean {
  return voucherState(v, now) === "ready" && (v.redeemBranchId === null || v.redeemBranchId === branchId);
}

/** Ready ones first (soonest to expire first), then the rest, newest first. */
export function sortVouchers(list: CardVoucher[], now: number = Date.now()): CardVoucher[] {
  const rank = (v: CardVoucher) => (voucherState(v, now) === "ready" ? 0 : 1);
  const expiry = (v: CardVoucher) => (v.expiresAt ? Date.parse(v.expiresAt) : Infinity);
  return [...list].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (rank(a) === 0) return expiry(a) === expiry(b) ? 0 : expiry(a) < expiry(b) ? -1 : 1;
    return Date.parse(b.issuedAt) - Date.parse(a.issuedAt);
  });
}

/** The voucher a Wallet pass shows on its front: the first one that is ready. */
export function passVoucher(list: CardVoucher[], now: number = Date.now()): CardVoucher | null {
  return sortVouchers(list, now).find((v) => voucherState(v, now) === "ready") ?? null;
}
