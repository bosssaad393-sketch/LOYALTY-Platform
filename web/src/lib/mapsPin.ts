import "server-only";
import { mapsHostOk, pinFromMapsUrl } from "./placeLinks";

/**
 * The map pin of a Google Maps link the owner pasted, so they never have to copy two numbers. A full link carries the
 * pin in its text. A short "share" link (maps.app.goo.gl/…) only says where to go next, so the server follows it:
 * at most four steps, only to Google's own maps addresses, reading the address of each step and never a page body.
 * Returns null when no pin is found or Google does not answer in time; the owner can still type the two numbers.
 */
export async function pinOfMapsLink(url: string): Promise<{ lat: number; lng: number } | null> {
  let next = url;
  for (let step = 0; step < 4; step++) {
    if (!mapsHostOk(next)) return null;
    const here = pinFromMapsUrl(next);
    if (here) return here;
    let res: Response;
    try {
      res = await fetch(next, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(4000), headers: { "user-agent": "Mozilla/5.0 (compatible; maps-pin)" } });
    } catch {
      return null;
    }
    const to = res.headers.get("location");
    await res.body?.cancel().catch(() => undefined);
    if (res.status < 300 || res.status >= 400 || !to) return null;
    try {
      next = new URL(to, next).toString();
    } catch {
      return null;
    }
  }
  return mapsHostOk(next) ? pinFromMapsUrl(next) : null;
}
