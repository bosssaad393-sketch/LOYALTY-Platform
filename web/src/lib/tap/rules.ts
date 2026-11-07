// Tap payment rules. Pure functions, no network and no database, so each rule is tested on its own.
// Tap's API: POST /v2/charges makes a charge and returns its payment page (transaction.url); GET /v2/charges/{id} reads it back.
// Money here is integer fils (BHD 1.500 = 1500). Tap takes and returns BHD as a decimal number with 3 places.
import { createHmac, timingSafeEqual } from "node:crypto";

export type PaymentStatus = "initiated" | "captured" | "failed" | "review";

/** What this app reads from a Tap charge. Everything else Tap sends is ignored. */
export type TapCharge = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  reference?: { transaction?: string; order?: string; gateway?: string; payment?: string };
  metadata?: Record<string, unknown>;
  transaction?: { url?: string; created?: string | number };
  source?: { payment_method?: string };
  response?: { code?: string; message?: string };
};

export const toTapAmount = (fils: number) => Number((fils / 1000).toFixed(3));
export const fromTapAmount = (amount: number) => Math.round(amount * 1000);

const FAILED = new Set(["ABANDONED", "CANCELLED", "FAILED", "DECLINED", "RESTRICTED", "VOID", "TIMEDOUT"]);
const PENDING = new Set(["INITIATED", "IN_PROGRESS", "IN PROGRESS", "UNKNOWN"]);

/** Tap's status word in this app's terms. Anything Tap adds later that we do not know is held for a person to look at. */
export function statusOf(tapStatus: string): PaymentStatus {
  const s = tapStatus.trim().toUpperCase();
  if (s === "CAPTURED") return "captured";
  if (FAILED.has(s)) return "failed";
  if (PENDING.has(s)) return "initiated";
  return "review";
}

export type OurPayment = { id: string; tabId: string; chargeId: string | null; amountFils: number; currency: string };

/**
 * Checks a charge read back from Tap against our own payment row, then says what it means.
 * Only a CAPTURED charge with our id, our amount, BHD and our own reference counts as paid. A mismatch is never paid.
 */
export function judgeCharge(ours: OurPayment, charge: TapCharge): { status: PaymentStatus; note: string | null } {
  if (ours.chargeId && charge.id !== ours.chargeId) return { status: "review", note: "Tap answered with another charge id." };
  if (charge.reference?.transaction !== ours.id) return { status: "review", note: "Tap's reference does not match this payment." };
  if (String(charge.currency).toUpperCase() !== ours.currency) return { status: "review", note: `Tap charged in ${charge.currency}, not ${ours.currency}.` };
  if (fromTapAmount(Number(charge.amount)) !== ours.amountFils) return { status: "review", note: `Tap charged ${charge.amount}, not ${toTapAmount(ours.amountFils).toFixed(3)}.` };
  const status = statusOf(String(charge.status ?? ""));
  if (status === "review") return { status, note: `Tap status ${charge.status} is not one this app knows.` };
  if (status === "failed") return { status, note: [charge.status, charge.response?.message].filter(Boolean).join(": ").slice(0, 300) || null };
  return { status, note: null };
}

/** Tap's payment page must be an https address on Tap's own domain, so a bad answer can never send a guest elsewhere. */
export function safePayUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "tap.company" || u.hostname.endsWith(".tap.company")) ? u.toString() : null;
  } catch {
    return null;
  }
}

export type ChargeInput = {
  paymentId: string;
  tabId: string;
  amountFils: number;
  description: string;
  redirectUrl: string;
  webhookUrl: string;
};

/** The body for POST /v2/charges. src_all = Tap's own page with every method the venue's account offers. Nothing is saved on Tap. */
export function chargeBody(c: ChargeInput) {
  return {
    amount: toTapAmount(c.amountFils),
    currency: "BHD",
    customer_initiated: true,
    threeDSecure: true,
    save_card: false,
    description: c.description.slice(0, 120),
    metadata: { payment: c.paymentId, tab: c.tabId },
    reference: { transaction: c.paymentId, order: c.tabId },
    receipt: { email: false, sms: false },
    customer: { first_name: "Guest" },
    source: { id: "src_all" },
    post: { url: c.webhookUrl },
    redirect: { url: c.redirectUrl },
  };
}

const decimalsOf = (currency: string) => (["BHD", "KWD", "OMR", "JOD"].includes(currency.toUpperCase()) ? 3 : 2);

/**
 * The webhook signature Tap puts in the "hashstring" header: HMAC-SHA256 with the secret key over
 * x_id..x_amount..x_currency..x_gateway_reference..x_payment_reference..x_status..x_created, amount with the currency's decimals.
 */
export function tapHash(charge: TapCharge, secretKey: string): string {
  const currency = String(charge.currency ?? "");
  const text =
    `x_id${charge.id}` +
    `x_amount${Number(charge.amount).toFixed(decimalsOf(currency))}` +
    `x_currency${currency}` +
    `x_gateway_reference${charge.reference?.gateway ?? ""}` +
    `x_payment_reference${charge.reference?.payment ?? ""}` +
    `x_status${charge.status}` +
    `x_created${charge.transaction?.created ?? ""}`;
  return createHmac("sha256", secretKey).update(text).digest("hex");
}

export function tapHashOk(charge: TapCharge, header: string | null, secretKey: string): boolean {
  if (!header || !/^[0-9a-f]{64}$/i.test(header)) return false;
  const want = Buffer.from(tapHash(charge, secretKey), "hex");
  const got = Buffer.from(header.toLowerCase(), "hex");
  return want.length === got.length && timingSafeEqual(want, got);
}

/** A Tap secret key looks like sk_test_... or sk_live_... Anything else counts as not set. */
export const keyMode = (key: string | undefined): "test" | "live" | null => {
  const m = /^sk_(test|live)_[A-Za-z0-9]{8,}$/.exec(key?.trim() ?? "");
  return m ? (m[1] as "test" | "live") : null;
};

/** What the guest may do with the bill right now. */
export function payState(p: { enabled: boolean; balanceFils: number; canClose: boolean; paying: boolean }): "off" | "nothing" | "wait" | "paying" | "ready" {
  if (!p.enabled) return "off";
  if (p.balanceFils <= 0) return "nothing";
  if (!p.canClose) return "wait";
  return p.paying ? "paying" : "ready";
}
