import "server-only";
import { z } from "zod";
import { db } from "./supabase";
import type { Staff } from "./staffAuth";

// The venue's public links (migration 0017): Instagram and the Google "write a review" link, shown on the guest home page.

const host = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
const isHttps = (u: string) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };

/** Only the real Instagram and Google addresses are accepted, so the home page never links somewhere unexpected. */
export const instagramOk = (u: string) => isHttps(u) && /(^|\.)instagram\.com$/.test(host(u));
export const googleReviewOk = (u: string) => isHttps(u) && /(^|\.)(google\.com|g\.page|goo\.gl|google\.com\.bh)$/.test(host(u));

const optional = (check: (u: string) => boolean, max: number) =>
  z.string().trim().max(max).transform((v) => v || null).refine((v) => v === null || check(v));

export const LinksInput = z.object({
  instagram: optional(instagramOk, 300),
  googleReview: optional(googleReviewOk, 500),
});
export type VenueLinks = { instagram: string | null; googleReview: string | null };

/** The links, or none when they are not set or the columns do not exist yet. Never throws: the home page must load anyway. */
export async function readLinks(venueId: string): Promise<VenueLinks> {
  try {
    const { data, error } = await db().from("venues").select("instagram_url, google_review_url").eq("id", venueId).maybeSingle();
    if (error || !data) return { instagram: null, googleReview: null };
    return { instagram: (data.instagram_url as string | null) ?? null, googleReview: (data.google_review_url as string | null) ?? null };
  } catch {
    return { instagram: null, googleReview: null };
  }
}

/** Saves the links of the SIGNED-IN person's venue. Audited. */
export async function saveLinks(staff: Staff, links: VenueLinks): Promise<VenueLinks> {
  const { error } = await db().from("venues").update({ instagram_url: links.instagram, google_review_url: links.googleReview }).eq("id", staff.venueId);
  if (error) throw error;
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "links_changed", detail: links });
  return links;
}
