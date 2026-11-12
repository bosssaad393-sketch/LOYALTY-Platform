// The printable QR kit: one card per table, plus a counter card for the till (rewards card, contact, feedback).
// Pure helpers, no database, so the links and the page layout can be tested on their own.
import { qrShape as shapeOf } from "../qr";

export type KitCard =
  | { kind: "table"; id: string; label: string; url: string }
  | { kind: "join"; id: "join"; url: string };

export type KitLook = "dark" | "light";
export const kitLook = (asked: unknown): KitLook => (asked === "light" ? "light" : "dark");

/**
 * The address printed into every code. PUBLIC_BASE_URL wins, so a code printed today keeps working when the site is
 * opened through another address. Without it, the address this page was opened on (https only, never a local one).
 */
export function kitBase(publicBaseUrl: string | undefined, host: string | null, proto: string | null): string | null {
  const set = (publicBaseUrl ?? "").trim().replace(/\/+$/, "");
  if (/^https:\/\/[^/\s]+/.test(set)) return set;
  if (!host || !/^[A-Za-z0-9.-]+(:\d+)?$/.test(host)) return null;
  const local = /^(localhost|127\.|\[::1\])/.test(host);
  if (local) return `${proto === "https" ? "https" : "http"}://${host}`;
  return proto === "https" ? `https://${host}` : null;
}

/** Every table in name order (4 before 10), and the counter card last. `only` keeps one table and leaves the counter card out. */
export function kitCards(base: string, venueSlug: string, tables: { id: string; label: string; token: string }[], only?: string | null): KitCard[] {
  const sorted = [...tables].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const picked = only ? sorted.filter((t) => t.id === only) : sorted;
  const cards: KitCard[] = picked.map((t) => ({ kind: "table", id: t.id, label: t.label, url: `${base}/t/${encodeURIComponent(t.token)}` }));
  if (!only) cards.push({ kind: "join", id: "join", url: `${base}/counter/${encodeURIComponent(venueSlug)}` });
  return cards;
}

/** A4 sheets of four A6 cards. */
export function sheets<T>(cards: T[], perSheet = 4): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < cards.length; i += perSheet) out.push(cards.slice(i, i + perSheet));
  return out;
}

/** The code as one SVG path. Level Q still scans with a scratch or a drink ring on the card. */
export const qrShape = (url: string): { size: number; d: string } => shapeOf(url);

/** The address as people would type it, for the line under the code: no https, no long table code. */
export const shortHost = (base: string) => base.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
