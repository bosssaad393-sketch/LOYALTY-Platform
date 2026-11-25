// Links for one branch on the guest card: directions and a phone call. Pure, so it is easy to test.
import type { Branch } from "./branches";

/** Directions: the branch's own maps link, else its coordinates, else nothing. */
export function directionsUrl(b: Pick<Branch, "mapsUrl" | "lat" | "lng">): string | null {
  if (b.mapsUrl) return b.mapsUrl;
  if (b.lat !== null && b.lng !== null) return `https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lng}`;
  return null;
}

/** A phone number as a tel: link (digits and a leading +), or null when it is too short to be one. */
export function telUrl(phone: string | null): string | null {
  const n = (phone ?? "").trim().replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  return n.replace(/\D/g, "").length >= 6 ? `tel:${n}` : null;
}
