import { tapSecret } from "@/lib/tap/client";
import { paymentByCharge, refreshPayment } from "@/lib/tap/payments";
import { tapHashOk, type TapCharge } from "@/lib/tap/rules";

/**
 * Tap calls this when a charge changes. It is only a nudge: after the signature check, the charge is read back from Tap
 * by our own stored charge id and judged like every other answer, so a forged or replayed call can never mark anything paid.
 */
export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > 100_000) return new Response(null, { status: 413 });
  let charge: TapCharge;
  try {
    charge = JSON.parse(text) as TapCharge;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof charge?.id !== "string" || !/^chg_[A-Za-z0-9_]{6,64}$/.test(charge.id)) return new Response(null, { status: 400 });
  const key = tapSecret();
  if (!key || !tapHashOk(charge, request.headers.get("hashstring"), key)) return new Response(null, { status: 401 });

  const payment = await paymentByCharge(charge.id);
  // Not ours (or already settled): nothing to do, and Tap should stop retrying.
  if (!payment) return Response.json({ ok: true });
  try {
    await refreshPayment(payment);
  } catch (e) {
    console.error("tap webhook check failed", e instanceof Error ? e.message : e);
    return new Response(null, { status: 502 });
  }
  return Response.json({ ok: true });
}
