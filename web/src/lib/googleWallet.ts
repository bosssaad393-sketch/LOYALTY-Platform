import "server-only";
import { readFileSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";
import jwt from "jsonwebtoken";
import type { Card, Venue } from "./supabase";
import { mapPool } from "./pool";
import { walletColors } from "./brand";

/**
 * Google Wallet loyalty cards.
 * - One loyalty *class* per venue (the card design), created on demand.
 * - One loyalty *object* per guest card, embedded in a signed "Save to Google Wallet" link.
 * Docs: https://developers.google.com/wallet/retail/loyalty-cards
 */

const API = "https://walletobjects.googleapis.com/walletobjects/v1";

type ServiceAccount = { client_email: string; private_key: string };

function serviceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_WALLET_SA_JSON
    ?? (process.env.GOOGLE_WALLET_SA_FILE ? readFileSync(process.env.GOOGLE_WALLET_SA_FILE, "utf8") : undefined);
  if (!raw) throw new Error("Google Wallet is not configured (GOOGLE_WALLET_SA_JSON or GOOGLE_WALLET_SA_FILE).");
  const sa = JSON.parse(raw) as ServiceAccount;
  if (!sa.client_email || !sa.private_key) throw new Error("Google Wallet service account JSON is incomplete.");
  return sa;
}

function issuerId(): string {
  const id = process.env.GOOGLE_WALLET_ISSUER_ID;
  if (!id) throw new Error("GOOGLE_WALLET_ISSUER_ID is not set.");
  return id;
}

/** Google ids may only contain letters, digits, '.', '_' and '-'. */
const safe = (s: string) => s.replace(/[^\w.-]/g, "_");
export const classId = (venue: Pick<Venue, "slug">) => `${issuerId()}.loyalty_${safe(venue.slug)}`;
export const objectId = (card: Pick<Card, "id">) => `${issuerId()}.card_${safe(card.id)}`;

async function api(method: "GET" | "POST" | "PATCH", path: string, body?: unknown) {
  const sa = serviceAccount();
  const auth = new GoogleAuth({
    credentials: sa,
    scopes: ["https://www.googleapis.com/auth/wallet_object.issuer"],
  });
  const client = await auth.getClient();
  return client.request({ url: `${API}${path}`, method, data: body, validateStatus: () => true });
}

/** Creates the venue's card design in Google Wallet if it doesn't exist yet. */
export async function ensureClass(venue: Venue): Promise<void> {
  const id = classId(venue);
  const found = await api("GET", `/loyaltyClass/${id}`);
  if (found.status === 200) return;
  if (found.status !== 404) throw new Error(`Google Wallet class lookup failed (${found.status})`);

  const created = await api("POST", "/loyaltyClass", {
    id,
    issuerName: venue.name,
    programName: `${venue.name} Loyalty Rewards`,
    programLogo: {
      sourceUri: { uri: process.env.LOYALTY_LOGO_URL || `${process.env.PUBLIC_BASE_URL ?? ""}/venues/${venue.slug}/crest.png` },
      contentDescription: { defaultValue: { language: "en", value: `${venue.name} logo` } },
    },
    hexBackgroundColor: walletColors().googleBackground,
    reviewStatus: "UNDER_REVIEW",
    countryCode: "BH",
  });
  if (created.status >= 300) throw new Error(`Google Wallet class create failed (${created.status}): ${JSON.stringify(created.data)}`);
}

/** The loyalty object for one guest card (what the guest sees in Google Wallet). */
export function cardObject(venue: Venue, card: Card, memberName: string) {
  return {
    id: objectId(card),
    classId: classId(venue),
    state: "ACTIVE",
    accountId: card.code,
    accountName: memberName,
    loyaltyPoints: { label: "Points", balance: { int: card.points } },
    secondaryLoyaltyPoints: { label: "Reward at", balance: { int: venue.reward_goal } },
    barcode: { type: "QR_CODE", value: `LOYALTY:${venue.slug}:${card.code}`, alternateText: card.code },
    hexBackgroundColor: walletColors().googleBackground,
  };
}

/** Signed "Save to Google Wallet" link for a guest card. */
export function saveUrl(venue: Venue, card: Card, memberName: string, origin: string): string {
  const sa = serviceAccount();
  const token = jwt.sign(
    {
      iss: sa.client_email,
      aud: "google",
      typ: "savetowallet",
      origins: [origin],
      payload: { loyaltyObjects: [cardObject(venue, card, memberName)] },
    },
    sa.private_key,
    { algorithm: "RS256" },
  );
  return `https://pay.google.com/gp/v/save/${token}`;
}

/** Pushes a new points balance to a card that is already saved in Google Wallet. */
export async function updatePoints(card: Card): Promise<void> {
  const res = await api("PATCH", `/loyaltyObject/${objectId(card)}`, {
    loyaltyPoints: { label: "Points", balance: { int: card.points } },
  });
  if (res.status === 404) return; // guest never saved the card
  if (res.status >= 300) throw new Error(`Google Wallet update failed (${res.status})`);
}

/**
 * Adds an offer message to the Google Wallet cards of the given guests (callers pass only guests who agreed to offers).
 * The message shows on the card for `windowMs` and also triggers a notification (TEXT_AND_NOTIFY).
 * A card the guest never saved to Google Wallet answers 404 and is skipped. Never throws for a single card.
 * Docs: https://developers.google.com/wallet/retail/loyalty-cards/rest/v1/loyaltyobject/addmessage
 */
export async function addOfferMessages(
  venueName: string,
  offer: { id: string; message: string },
  cardIds: string[],
  windowMs: number,
): Promise<{ sent: number; notSaved: number; failed: number }> {
  const auth = new GoogleAuth({ credentials: serviceAccount(), scopes: ["https://www.googleapis.com/auth/wallet_object.issuer"] });
  const client = await auth.getClient(); // one login for the whole batch
  const now = Date.now();
  const body = {
    message: {
      id: offer.id,
      header: `From ${venueName}`,
      body: offer.message,
      messageType: "TEXT_AND_NOTIFY",
      displayInterval: { start: { date: new Date(now).toISOString() }, end: { date: new Date(now + windowMs).toISOString() } },
    },
  };
  const results = await mapPool(cardIds, 8, async (id) => {
    const res = await client.request({ url: `${API}/loyaltyObject/${objectId({ id })}/addMessage`, method: "POST", data: body, validateStatus: () => true });
    return res.status;
  });
  const out = { sent: 0, notSaved: 0, failed: 0 };
  for (const r of results) {
    if (r.status === "fulfilled" && r.value < 300) out.sent++;
    else if (r.status === "fulfilled" && r.value === 404) out.notSaved++;
    else out.failed++;
  }
  if (out.failed) console.error("google offer message failed for", out.failed, "of", cardIds.length, "cards");
  return out;
}

export const googleWalletConfigured = () =>
  Boolean(process.env.GOOGLE_WALLET_ISSUER_ID && (process.env.GOOGLE_WALLET_SA_JSON || process.env.GOOGLE_WALLET_SA_FILE));
