import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/supabase";
import { getCardView, isUuid } from "@/lib/cards";
import { buildPass } from "@/lib/appleWallet";
import { agreedToNews, normaliseMember } from "@/lib/offers";
import { offerStampsByVenue } from "@/lib/passOffer";

/**
 * Apple Wallet web service (the protocol Wallet uses to register a card and fetch updates).
 * https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes
 *   POST/DELETE /v1/devices/{device}/registrations/{passType}/{serial}
 *   GET         /v1/devices/{device}/registrations/{passType}?passesUpdatedSince=tag
 *   GET         /v1/passes/{passType}/{serial}
 *   POST        /v1/log
 */

type Ctx = RouteContext<"/api/applewallet/v1/[...path]">;
const passType = () => process.env.APPLE_PASS_TYPE_ID;
const empty = (status: number) => new Response(null, { status });

/** Checks "Authorization: ApplePass <token>" against the card's stored token. */
async function authorised(request: Request, serial: string): Promise<boolean> {
  if (!isUuid(serial)) return false;
  const given = (request.headers.get("authorization") ?? "").replace(/^ApplePass\s+/i, "");
  const { data } = await db().from("cards").select("apple_auth_token").eq("id", serial).maybeSingle();
  const stored = data?.apple_auth_token;
  if (!stored || !given || stored.length !== given.length) return false;
  return timingSafeEqual(Buffer.from(stored), Buffer.from(given));
}

/**
 * Bump this when the card layout or artwork changes, so every saved card refreshes.
 * 2026-10-15: the back of the card of guests who agreed to offers gained an "offer" field.
 * Set this to the moment of the deploy when merging (a time before the deploy can be older than what some phones
 * already hold, and those phones then keep the old layout until their next points change).
 */
const LAYOUT_UPDATED_AT = Date.parse("2026-10-16T12:08:00Z");

/**
 * When a card last changed: its newest ledger entry, its creation, the last layout change, or (for guests who agreed
 * to offers) the last time the offer on the card changed. Apple only fetches a card when this is newer than its last check.
 */
async function lastChanged(cardIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (cardIds.length === 0) return out;
  const { data: cards } = await db().from("cards").select("id, created_at, venue_id, members(consent_news, deleted_at)").in("id", cardIds);
  const offerStamps = await offerStampsByVenue([...new Set((cards ?? []).map((c) => c.venue_id as string))]);
  for (const c of cards ?? []) {
    const offerAt = agreedToNews(normaliseMember(c.members)) ? (offerStamps.get(c.venue_id) ?? 0) : 0;
    out.set(c.id, Math.max(new Date(c.created_at).getTime(), LAYOUT_UPDATED_AT, offerAt));
  }
  const { data: entries } = await db().from("ledger").select("card_id, created_at").in("card_id", cardIds).order("created_at", { ascending: false });
  for (const e of entries ?? []) {
    const t = new Date(e.created_at).getTime();
    if (t > (out.get(e.card_id) ?? 0)) out.set(e.card_id, t);
  }
  return out;
}

export async function POST(request: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  if (path[0] === "log") {
    const body = await request.json().catch(() => ({}));
    console.log("apple wallet log", JSON.stringify(body).slice(0, 2000));
    return empty(200);
  }
  // devices/{device}/registrations/{passType}/{serial}
  if (path.length !== 5 || path[0] !== "devices" || path[2] !== "registrations" || path[3] !== passType()) return empty(404);
  const [, device, , , serial] = path;
  if (!(await authorised(request, serial))) return empty(401);
  const { pushToken } = (await request.json().catch(() => ({}))) as { pushToken?: string };
  if (!pushToken) return empty(400);
  const { data: existing } = await db().from("apple_registrations").select("device_id").eq("device_id", device).eq("card_id", serial).maybeSingle();
  const { error } = await db().from("apple_registrations").upsert({ device_id: device, card_id: serial, push_token: pushToken }, { onConflict: "device_id,card_id" });
  if (error) { console.error("apple register failed", error.message); return empty(500); }
  return empty(existing ? 200 : 201);
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  if (path.length !== 5 || path[0] !== "devices" || path[2] !== "registrations" || path[3] !== passType()) return empty(404);
  const [, device, , , serial] = path;
  if (!(await authorised(request, serial))) return empty(401);
  await db().from("apple_registrations").delete().eq("device_id", device).eq("card_id", serial);
  return empty(200);
}

export async function GET(request: Request, ctx: Ctx) {
  const { path } = await ctx.params;

  // passes/{passType}/{serial}: the latest version of one card
  if (path.length === 3 && path[0] === "passes" && path[1] === passType()) {
    const serial = path[2];
    if (!(await authorised(request, serial))) return empty(401);
    const changed = (await lastChanged([serial])).get(serial) ?? Date.now();
    const since = request.headers.get("if-modified-since");
    if (since && Math.floor(changed / 1000) <= Math.floor(new Date(since).getTime() / 1000)) return empty(304);
    const view = await getCardView(serial);
    if (!view) return empty(404);
    const pass = await buildPass(view.venue, view.card, view.memberName, new URL(request.url).origin);
    return new Response(new Uint8Array(pass), {
      headers: { "content-type": "application/vnd.apple.pkpass", "last-modified": new Date(changed).toUTCString(), "cache-control": "no-store" },
    });
  }

  // devices/{device}/registrations/{passType}?passesUpdatedSince=tag: which cards changed
  if (path.length === 4 && path[0] === "devices" && path[2] === "registrations" && path[3] === passType()) {
    const { data } = await db().from("apple_registrations").select("card_id").eq("device_id", path[1]);
    const ids = (data ?? []).map((r) => r.card_id);
    if (ids.length === 0) return empty(204);
    const since = Number(new URL(request.url).searchParams.get("passesUpdatedSince") ?? 0) || 0;
    const changed = await lastChanged(ids);
    const updated = ids.filter((id) => (changed.get(id) ?? 0) > since);
    if (updated.length === 0) return empty(204);
    const newest = Math.max(...updated.map((id) => changed.get(id) ?? 0));
    return Response.json({ serialNumbers: updated, lastUpdated: String(newest) });
  }

  return empty(404);
}
