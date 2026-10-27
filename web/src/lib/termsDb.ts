import "server-only";
import { db } from "./supabase";
import type { Staff } from "./staffAuth";
import { defaultTermsText } from "./terms";

export type TermsView = { text: string; updatedAt: string | null; isDefault: boolean };

/** The terms for the owner screen: the venue's own text, or the built-in clauses as text when none is saved. */
export async function readTerms(venueId: string, venueName: string): Promise<TermsView> {
  const { data, error } = await db().from("venues").select("terms_text, terms_updated_at").eq("id", venueId).single();
  if (error) throw error;
  const custom = typeof data.terms_text === "string" && data.terms_text.trim() ? data.terms_text : null;
  if (!custom) return { text: defaultTermsText(venueName), updatedAt: null, isDefault: true };
  const at = data.terms_updated_at ? Date.parse(data.terms_updated_at) : NaN;
  return { text: custom, updatedAt: Number.isFinite(at) ? new Date(at).toISOString() : null, isDefault: false };
}

/**
 * The venue's own terms for the public terms page, or null to show the built-in clauses.
 * A guest page must never break: if the lookup fails (for example migration 0003 is not applied yet), show the defaults.
 */
export async function customTermsFor(venueId: string): Promise<string | null> {
  try {
    const { data, error } = await db().from("venues").select("terms_text").eq("id", venueId).maybeSingle();
    if (error) throw error;
    const t = data?.terms_text;
    return typeof t === "string" && t.trim() ? t : null;
  } catch (e) {
    console.error("terms lookup failed", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Saves the venue's terms. The full text goes into the audit log, so there is a record of what guests agreed to. */
export async function saveTerms(staff: Staff, text: string): Promise<void> {
  const { error } = await db().from("venues").update({ terms_text: text, terms_updated_at: new Date().toISOString() }).eq("id", staff.venueId);
  if (error) throw error;
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "terms_changed", detail: { text } });
}
