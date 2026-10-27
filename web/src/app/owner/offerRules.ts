// Pure rules for withdrawing a sent message and for resending it with an edit (round 3). No React, no network: unit tested.
import type { Audience, Offer } from "./types";

/** Longest message a Wallet notification may carry (same limit as the offers API). */
export const MESSAGE_LIMIT = 200;
/** A message stays on the Wallet cards for this many days, so it can be withdrawn for this long. */
export const WITHDRAW_DAYS = 14;

const DAY = 86_400_000;

/**
 * The message as the server stores it: one line of plain text. Control characters and line breaks become spaces,
 * runs of spaces collapse, the ends are trimmed. (Same cleaning as `cleanMessage` in lib/offers.ts.)
 */
export function oneLine(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const c = ch.codePointAt(0) ?? 0;
    out += c < 32 || c === 127 || /\s/.test(ch) ? " " : ch;
  }
  return out.replace(/ +/g, " ").trim();
}

/**
 * What withdrawing does to the cards, said plainly. Apple removes the message from the card at once. Google Wallet has no
 * call to remove a single message, so on Android cards it stays until its 14 days end. Never claim more than that.
 */
export function withdrawEffect(audience: Audience): { before: string; after: string; original: string } {
  if (audience === "apple") {
    return {
      before: "It will disappear from guests’ cards.",
      after: "It no longer shows on guests’ cards.",
      original: "The original message will then be withdrawn from the cards.",
    };
  }
  return {
    before: "It will disappear from iPhone cards. On Android cards it stays until the 14 days end.",
    after: "It no longer shows on iPhone cards. On Android cards it stays until the 14 days end.",
    original: "The original message will then be withdrawn: it disappears from iPhone cards, and on Android cards it stays until the 14 days end.",
  };
}

export type Withdrawable =Pick<Offer, "sentAt" | "withdrawnAt">;

/** Is this message still on the cards, so that withdrawing it means something? (Under 14 days old and not withdrawn already.) */
export function canWithdraw(offer: Withdrawable, now: number = Date.now()): boolean {
  if (offer.withdrawnAt) return false;
  const sent = new Date(offer.sentAt).getTime();
  if (Number.isNaN(sent)) return false;
  return now - sent < WITHDRAW_DAYS * DAY;
}

export type ResendCheck = {
  /** What would be sent: the text on one line. */
  text: string;
  length: number;
  /** How many characters too many (0 when it fits). */
  over: number;
  /** The trimmed text equals the original, so guests would not be alerted. */
  same: boolean;
  /** Review and send may be used. */
  ok: boolean;
};

/**
 * "Edit and resend": the new text must differ from the original (compared trimmed and case-sensitive, after the
 * same one-line cleaning the server does) and be 1 to 200 characters long.
 */
export function checkResend(original: string, draft: string): ResendCheck {
  const text = oneLine(draft);
  const length = text.length;
  const same = text === oneLine(original);
  const over = Math.max(0, length - MESSAGE_LIMIT);
  return { text, length, over, same, ok: length >= 1 && over === 0 && !same };
}
