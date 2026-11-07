import "server-only";
import { brandVenue } from "../brand";
import { chargeBody, keyMode, type ChargeInput, type TapCharge } from "./rules";

/**
 * Talks to Tap. One deployment = one client = one Tap merchant account, so the secret key is a hosting setting
 * (TAP_SECRET_KEY, sk_test_... first, sk_live_... only after a test payment works). It never reaches the browser or the logs.
 * Card payments are offered only at the venue in TAP_VENUE (default: the deployment's own venue), because the money
 * lands in that one account.
 *
 * Design-time only: LOYALTY_FAKE_DB=1 with TAP_FAKE=1 (never in production) pretends to be Tap, so the screens can be tried
 * without an account. Its "payment page" sends the guest straight back, and every charge reads back as CAPTURED.
 */

const API = "https://api.tap.company/v2";
const TIMEOUT_MS = 15_000;

type Env = Record<string, string | undefined>;

const fakeTap = (env: Env) => env.TAP_FAKE === "1" && env.LOYALTY_FAKE_DB === "1" && env.NODE_ENV !== "production";

export type TapConfig = { mode: "test" | "live" | "fake"; venueSlug: string; baseUrl: string };

/** Null when card payments are off: no valid key, or no public address for Tap to send the guest back to. */
export function tapConfig(env: Env = process.env, requestOrigin?: string): TapConfig | null {
  const venueSlug = env.TAP_VENUE?.trim().toLowerCase() || brandVenue(env);
  if (fakeTap(env)) return { mode: "fake", venueSlug, baseUrl: (env.PUBLIC_BASE_URL || requestOrigin || "").replace(/\/+$/, "") };
  const mode = keyMode(env.TAP_SECRET_KEY);
  const baseUrl = (env.PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!mode || !/^https:\/\//.test(baseUrl)) return null;
  return { mode, venueSlug, baseUrl };
}

export const tapOnFor = (venueSlug: string, origin?: string) => tapConfig(process.env, origin)?.venueSlug === venueSlug;

const secret = () => (process.env.TAP_SECRET_KEY ?? "").trim();

async function call(path: string, init: RequestInit): Promise<TapCharge> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${secret()}`, "content-type": "application/json", accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as (TapCharge & { errors?: { description?: string }[] }) | null;
  if (!res.ok || !data?.id) {
    // Tap's own error words only; the request (and so the key) is never logged.
    const why = data?.errors?.map((e) => e.description).filter(Boolean).join("; ") || `HTTP ${res.status}`;
    throw new Error(`Tap: ${why}`.slice(0, 300));
  }
  return data;
}

const fakeCharges = new Map<string, TapCharge>();

export async function createCharge(input: ChargeInput): Promise<TapCharge> {
  if (tapConfig()?.mode === "fake") {
    const body = chargeBody(input);
    const charge: TapCharge = {
      id: `chg_fake_${input.paymentId.slice(0, 8)}`,
      status: "INITIATED",
      amount: body.amount,
      currency: body.currency,
      reference: body.reference,
      transaction: { url: input.redirectUrl, created: Date.now() },
    };
    fakeCharges.set(charge.id, { ...charge, status: "CAPTURED", source: { payment_method: "BENEFIT" } });
    return charge;
  }
  return call("/charges", { method: "POST", body: JSON.stringify(chargeBody(input)) });
}

export async function readCharge(chargeId: string): Promise<TapCharge> {
  if (!/^chg_[A-Za-z0-9_]{6,64}$/.test(chargeId)) throw new Error("Tap: bad charge id");
  if (tapConfig()?.mode === "fake") {
    const c = fakeCharges.get(chargeId);
    if (!c) throw new Error("Tap: unknown fake charge");
    return c;
  }
  return call(`/charges/${chargeId}`, { method: "GET" });
}

export const tapSecret = secret;
