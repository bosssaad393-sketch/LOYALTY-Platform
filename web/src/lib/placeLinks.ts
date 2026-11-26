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

/** The Google addresses a maps link can have. Short links (maps.app.goo.gl, goo.gl) carry no pin until followed. */
export const MAPS_HOSTS = ["maps.app.goo.gl", "goo.gl", "g.co", "google.com", "www.google.com", "maps.google.com"];
export const mapsHostOk = (u: string) => { try { const x = new URL(u); return x.protocol === "https:" && MAPS_HOSTS.includes(x.hostname.toLowerCase()); } catch { return false; } };

/**
 * The map pin written inside a full Google Maps link, or null. Reads the place's own pin first ("!3d26.17!4d50.60"),
 * then a search for two numbers ("?q=26.17,50.60"), then the centre of the view ("@26.17,50.60,17z"), which is
 * usually a few metres off.
 */
export function pinFromMapsUrl(url: string): { lat: number; lng: number } | null {
  let text: string;
  try { text = decodeURIComponent(url); } catch { text = url; }
  const num = "(-?\\d{1,3}\\.\\d{3,})";
  const found =
    text.match(new RegExp(`!3d${num}!4d${num}`)) ??
    text.match(new RegExp(`[?&](?:q|query|ll|destination)=(?:loc:)?${num},\\s*${num}`)) ??
    text.match(new RegExp(`@${num},${num}`));
  if (!found) return null;
  const lat = Number(found[1]);
  const lng = Number(found[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
