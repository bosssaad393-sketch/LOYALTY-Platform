/**
 * The welcome on the lock screen when a guest is near the venue.
 *
 * Apple Wallet brings a saved card up on the lock screen, with one line of text, when the phone is within about
 * 100 metres of a place written on the card. The phone decides that by itself: this server is never told the guest
 * arrived, and nothing at all happens when they leave (Apple gives a card no such signal).
 *
 * Two settings of the deployment:
 *   BRAND_PIN          the venue's place as "latitude,longitude", for example "26.2338508,50.5965259"
 *   BRAND_ARRIVAL_TEXT the line shown there, for example "حياك تنورنا يا غالي" (up to 80 characters)
 * Without BRAND_PIN the card carries no place and behaves as before.
 */

export type PassLocation = { latitude: number; longitude: number; relevantText: string };

/** Apple: "on the order of a hundred meters" for a store card; a card cannot ask for more than its own style allows. */
export const ARRIVAL_RADIUS_M = 100;

const MAX_TEXT = 80;

export function arrivalLocations(venueName: string, env: Record<string, string | undefined> = process.env): PassLocation[] {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(env.BRAND_PIN ?? "");
  if (!m) return [];
  const latitude = Number(m[1]), longitude = Number(m[2]);
  if (!(Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) || (latitude === 0 && longitude === 0)) return [];
  const own = (env.BRAND_ARRIVAL_TEXT ?? "").trim().slice(0, MAX_TEXT);
  return [{ latitude, longitude, relevantText: own || `Welcome to ${venueName}. Show your card.` }];
}
