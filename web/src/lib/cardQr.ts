import "server-only";
import { serverSecret } from "./demo";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * What a guest's QR says. Old cards: "LOYALTY:<venue>:<code>". Cards made from now on add a proof:
 * "LOYALTY:<venue>:<code>:<proof>", a keyed hash of the card that only this server can make.
 *
 * Why: the 4-digit code is easy to guess, so a QR built from a guessed code would open another guest's card. That is
 * harmless for adding points, but not for USING a voucher. A voucher is only redeemed against a QR with a valid proof
 * (or by a manager or the owner, who can see the guest). Old QR codes keep working for everything else.
 */

function key(): Buffer | null {
  const base = serverSecret();
  return base ? createHmac("sha256", base).update("orbyn-card-qr-v1").digest() : null;
}

/** The proof for one card, or null when the server has no secret (then cards carry the old, unsigned QR). */
export function qrProof(cardId: string): string | null {
  const k = key();
  return k ? createHmac("sha256", k).update(`card:${cardId}`).digest("base64url").slice(0, 16) : null;
}

export function qrMessage(venueSlug: string, code: string, cardId: string): string {
  const proof = qrProof(cardId);
  return proof ? `LOYALTY:${venueSlug}:${code}:${proof}` : `LOYALTY:${venueSlug}:${code}`;
}

export type ParsedQr = { venueSlug: string; code: string; proof: string | null };

export function parseQr(raw: string): ParsedQr | null {
  const m = raw.trim().match(/^LOYALTY:([a-z0-9-]{1,60}):(\d{4})(?::([A-Za-z0-9_-]{16}))?$/);
  return m ? { venueSlug: m[1], code: m[2], proof: m[3] ?? null } : null;
}

/** True when `proof` is the one this server makes for that card. Compared in constant time. */
export function proofOk(cardId: string, proof: string | null | undefined): boolean {
  const want = qrProof(cardId);
  if (!want || !proof || proof.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(want), Buffer.from(proof));
}

/** Does this scanned text prove the guest holds THIS card (same venue, same code, valid proof)? */
export function qrProvesCard(raw: string | null | undefined, card: { id: string; code: string }, venueSlug: string): boolean {
  const q = raw ? parseQr(raw) : null;
  return Boolean(q && q.venueSlug === venueSlug && q.code === card.code && proofOk(card.id, q.proof));
}
