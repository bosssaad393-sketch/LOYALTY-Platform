// Venue terms and conditions. Pure helpers shared by the guest terms page and the owner API.
import { z } from "zod";

export const TERMS_MIN_CHARS = 50;
export const TERMS_MAX_CHARS = 8000;

/** Line endings to \n, control characters removed (tabs and line breaks stay), blank-line runs squeezed to one blank line. */
export function cleanTerms(raw: string): string {
  let out = "";
  for (const ch of raw.replace(/\r\n?/g, "\n")) {
    const c = ch.codePointAt(0) ?? 0;
    if (ch === "\n" || ch === "\t" || (c >= 32 && c !== 127)) out += ch;
  }
  return out
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const TermsInput = z.object({
  text: z.string().max(TERMS_MAX_CHARS * 2).transform(cleanTerms).pipe(z.string().min(TERMS_MIN_CHARS).max(TERMS_MAX_CHARS)),
});

export type Clause = [title: string, text: string];

/** The built-in clauses shown when the owner has not written their own terms. */
export function defaultClauses(venueName: string): Clause[] {
  const n = venueName;
  return [
    ["Your card", `${n} Loyalty Rewards gives you a personal digital card with a 4-digit code. Show the code when you visit so your points can be added.`],
    ["Your details", "We keep your name and your phone number or email only to run your rewards and to contact you about them. We do not sell them."],
    ["Notifications", "Offers are sent to your Wallet card only if you agreed to receive them. You can turn them off at any time."],
    ["Rewards", `Points, rewards and their value are set by ${n} and can change. Points have no cash value.`],
    ["Deleting your data", `You can ask ${n} or Orbyn to delete your details at any time.`],
    ["Powered by Orbyn", `The card system is provided to ${n} by Orbyn. ${n} owns its members' data.`],
  ];
}

/** Clauses written out as text, one block per clause (title line, then the text), blocks separated by a blank line. */
export function formatClauses(clauses: Clause[]): string {
  return clauses.map(([title, text]) => (title ? `${title}\n${text}` : text)).join("\n\n");
}

/** What the owner starts from in the editor when no custom terms are saved yet. */
export const defaultTermsText = (venueName: string): string => formatClauses(defaultClauses(venueName));

const MAX_TITLE_CHARS = 60;

/**
 * Splits saved terms into clauses for the guest page. Blocks are separated by a blank line. When a block has
 * a short first line that does not end like a sentence, that line is the title and the rest is the text.
 */
export function parseTerms(text: string): Clause[] {
  const blocks = cleanTerms(text).split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block): Clause => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const first = lines[0] ?? "";
    if (lines.length >= 2 && first.length <= MAX_TITLE_CHARS && !/[.!?:؟]$/.test(first)) {
      return [first, lines.slice(1).join(" ")];
    }
    return ["", lines.join(" ")];
  });
}
