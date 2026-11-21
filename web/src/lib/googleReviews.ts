import "server-only";

/**
 * The venue's public Google rating and latest reviews, for the owner's Feedback screen.
 * Read only, from the Google Places API (New). Needs GOOGLE_PLACES_API_KEY on the server; without it the screen
 * says so and nothing is fetched. The place comes from the venue's "write a review" link (…writereview?placeid=…).
 * Google returns at most 5 reviews (its own pick) plus the overall rating and count.
 * Cached for an hour so opening the screen often stays inside Google's free monthly allowance.
 */

export type GoogleReview = { author: string; authorUrl: string | null; rating: number; text: string; when: string };
export type GoogleReviews =
  | { configured: false; reason: "no_key" | "no_place" }
  | { configured: true; ok: false; error: string }
  | { configured: true; ok: true; rating: number | null; count: number; mapsUrl: string | null; reviewUrl: string; reviews: GoogleReview[] };

/** The Google place id inside a review link, or null. Accepts writereview?placeid=… and maps ?q=place_id:… links. */
export function placeIdFrom(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const q = u.searchParams.get("q") ?? "";
    const id = u.searchParams.get("placeid") ?? u.searchParams.get("place_id") ?? (q.startsWith("place_id:") ? q.slice(9) : null);
    return id && /^[A-Za-z0-9_-]{10,300}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export type RawPlace = {
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  reviews?: {
    rating?: number;
    relativePublishTimeDescription?: string;
    text?: { text?: string };
    originalText?: { text?: string };
    authorAttribution?: { displayName?: string; uri?: string };
  }[];
};

/** Turns Google's answer into what the screen shows. Pure, so it is tested without the network. */
export function mapPlace(raw: RawPlace, reviewUrl: string): Extract<GoogleReviews, { ok: true }> {
  const https = (u?: string) => (u && u.startsWith("https://") ? u : null);
  return {
    configured: true,
    ok: true,
    rating: typeof raw.rating === "number" ? raw.rating : null,
    count: typeof raw.userRatingCount === "number" ? raw.userRatingCount : 0,
    mapsUrl: https(raw.googleMapsUri),
    reviewUrl,
    reviews: (raw.reviews ?? []).slice(0, 5).map((r) => ({
      author: (r.authorAttribution?.displayName ?? "").trim() || "A Google user",
      authorUrl: https(r.authorAttribution?.uri),
      rating: Math.max(0, Math.min(5, Math.round(r.rating ?? 0))),
      text: (r.text?.text ?? r.originalText?.text ?? "").trim().slice(0, 2000),
      when: r.relativePublishTimeDescription ?? "",
    })),
  };
}

export async function readGoogleReviews(reviewLink: string | null): Promise<GoogleReviews> {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) return { configured: false, reason: "no_key" };
  const placeId = placeIdFrom(reviewLink);
  if (!placeId || !reviewLink) return { configured: false, reason: "no_place" };
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "rating,userRatingCount,googleMapsUri,reviews" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { configured: true, ok: false, error: `Google answered ${res.status}. Check the API key and that "Places API (New)" is enabled for it.` };
    return mapPlace((await res.json()) as RawPlace, reviewLink);
  } catch {
    return { configured: true, ok: false, error: "Could not reach Google. Try again in a minute." };
  }
}
