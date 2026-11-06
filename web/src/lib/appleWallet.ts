import "server-only";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { PKPass, PassType } from "passkit-generator";
import { db, type Card, type Venue } from "./supabase";
import { appleOfferField } from "./offers";
import { offerStateForCard } from "./passOffer";
import { qrStripImages } from "./qrStrip";
import { walletColors } from "./brand";

/**
 * Apple Wallet store cards (.pkpass), signed with our Pass Type ID certificate.
 * Images per venue live in web/passes/<venue-slug>/ (icon, logo, strip at 1x/2x/3x).
 * Docs: https://developer.apple.com/documentation/walletpasses
 */

const pem = (inline?: string, file?: string) =>
  inline ? inline.replace(/\\n/g, "\n") : file ? readFileSync(file, "utf8") : undefined;

export function appleCertificates() {
  const signerCert = pem(process.env.APPLE_PASS_CERT, process.env.APPLE_PASS_CERT_FILE);
  const signerKey = pem(process.env.APPLE_PASS_KEY, process.env.APPLE_PASS_KEY_FILE);
  const wwdr = pem(process.env.APPLE_WWDR_CERT, process.env.APPLE_WWDR_CERT_FILE);
  if (!signerCert || !signerKey || !wwdr) throw new Error("Apple Wallet is not configured (certificate, key or WWDR missing).");
  return { signerCert, signerKey, wwdr };
}

export const appleWalletConfigured = () =>
  Boolean(
    process.env.APPLE_PASS_TYPE_ID &&
      process.env.APPLE_TEAM_ID &&
      (process.env.APPLE_PASS_CERT || process.env.APPLE_PASS_CERT_FILE) &&
      (process.env.APPLE_PASS_KEY || process.env.APPLE_PASS_KEY_FILE) &&
      (process.env.APPLE_WWDR_CERT || process.env.APPLE_WWDR_CERT_FILE),
  );

/**
 * Size of the store card's strip image area, in points: ONE constant. The files in web/passes/<venue>/ are
 * strip.png (1x), strip@2x.png and strip@3x.png at exactly this size times 1, 2 and 3 (375 x 144 pt = 1125 x 432 px at 3x).
 * The strip is the card artwork only (nothing about the guest in it): marble card with transparent margins and
 * transparent rounded corners, so the pass background shows around it.
 */
export const STRIP = { w: 375, h: 144 } as const;
export const STRIP_FILES = { 1: "strip.png", 2: "strip@2x.png", 3: "strip@3x.png" } as const;
export type StripScale = keyof typeof STRIP_FILES;
export const stripPixels = (scale: StripScale) => ({ width: STRIP.w * scale, height: STRIP.h * scale });

/** Width and height from a PNG's header (null when the buffer is not a PNG). */
export function pngSize(png: Buffer): { width: number; height: number } | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (png.length < 24 || !png.subarray(0, 8).equals(signature) || png.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** Problems with the strip files of a venue (wrong size, not a PNG, missing). Empty list = fine. */
export function stripProblems(files: Record<string, Buffer>): string[] {
  const problems: string[] = [];
  for (const scale of Object.keys(STRIP_FILES).map(Number) as StripScale[]) {
    const name = STRIP_FILES[scale];
    const file = files[name];
    const want = stripPixels(scale);
    if (!file) problems.push(`${name} is missing`);
    else {
      const got = pngSize(file);
      if (!got) problems.push(`${name} is not a PNG`);
      else if (got.width !== want.width || got.height !== want.height) problems.push(`${name} is ${got.width}x${got.height}, expected ${want.width}x${want.height}`);
    }
  }
  return problems;
}

/**
 * Apple "Poster Generic" (iOS 27+): a full-bleed membership card. OFF unless APPLE_POSTER_PASS=1.
 * When on, the pass carries BOTH styles (poster for iOS 27, the store card for older iPhones).
 * Test on a real iOS 27 iPhone (or Apple's Pass Designer on a Mac) before turning it on in production.
 */
const posterEnabled = () => process.env.APPLE_POSTER_PASS === "1";

const warned = new Set<string>();

function venueImages(slug: string, poster: boolean): Record<string, Buffer> {
  const dir = path.join(process.cwd(), "passes", slug);
  const files: Record<string, Buffer> = {};
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".png")) continue;
    if (!poster && /^(artwork|primaryLogo)/.test(name)) continue; // poster artwork only travels with poster passes
    files[name] = readFileSync(path.join(dir, name));
  }
  // A strip of the wrong size is still drawn (Wallet crops or stretches it), so only warn, once per venue.
  if (!warned.has(slug)) {
    warned.add(slug);
    const problems = stripProblems(files);
    if (problems.length) console.warn(`apple pass strip for ${slug}: ${problems.join("; ")}`);
  }
  return files;
}

/** Preview "card": the strip with the name centred (passes/<venue>/card/strip*.png). Falls back to the normal strip. */
function cardStripImages(slug: string): Record<string, Buffer> {
  const dir = path.join(process.cwd(), "passes", slug, "card");
  const files: Record<string, Buffer> = {};
  try {
    for (const name of readdirSync(dir)) if (/^strip(@[23]x)?\.png$/.test(name)) files[name] = readFileSync(path.join(dir, name));
  } catch {
    /* no card strip for this venue */
  }
  return files;
}

/** The per-card secret Apple sends back when it asks for updates. Created on first use. */
export async function authTokenFor(cardId: string): Promise<string> {
  const { data, error } = await db().from("cards").select("apple_auth_token").eq("id", cardId).single();
  if (error) throw error;
  if (data.apple_auth_token) return data.apple_auth_token;
  const token = randomBytes(24).toString("hex");
  const { error: e2 } = await db().from("cards").update({ apple_auth_token: token, apple_serial: cardId }).eq("id", cardId).is("apple_auth_token", null);
  if (e2) throw e2;
  const { data: again } = await db().from("cards").select("apple_auth_token").eq("id", cardId).single();
  return again!.apple_auth_token;
}

/** Builds the signed .pkpass for one guest card. baseUrl is where Apple fetches updates. */
/**
 * Previews are separate test cards (own serial, never updated):
 * - "qr": the QR is drawn on the marble strip.
 * - "card": the strip only carries the centred name, points sit in the header, and the QR is Apple's own barcode at the bottom.
 */
export type PassPreview = "qr" | "card";
export async function buildPass(venue: Venue, card: Card, memberName: string, baseUrl: string, preview?: PassPreview): Promise<Buffer> {
  const live = preview
    ? {}
    : { webServiceURL: `${process.env.PUBLIC_BASE_URL ?? baseUrl}/api/applewallet`, authenticationToken: await authTokenFor(card.id) };
  const colors = walletColors();
  const props = {
    ...live,
    passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID,
    teamIdentifier: process.env.APPLE_TEAM_ID,
    serialNumber: preview ? `${card.id}.preview-${preview}` : card.id,
    organizationName: venue.name,
    description: preview ? `${venue.name} Loyalty Rewards (preview)` : `${venue.name} Loyalty Rewards`,
    // Live card: tinted black, which shows around the card artwork (its strip has transparent margins). Previews keep their own colour.
    backgroundColor: preview ? colors.applePreviewBackground : colors.appleBackground,
    foregroundColor: colors.appleForeground,
    labelColor: colors.appleLabel,
    sharingProhibited: true,
  };

  const poster = posterEnabled();
  const images = venueImages(venue.slug, poster);
  if (preview === "qr") Object.assign(images, await qrStripImages(venue.slug, `LOYALTY:${venue.slug}:${card.code}`));
  if (preview === "card") Object.assign(images, cardStripImages(venue.slug));
  const pass = new PKPass(
    images,
    appleCertificates(),
    props,
  );
  const ready = card.points >= venue.reward_goal;
  const progress = {
    key: "progress",
    label: "TO YOUR REWARD",
    value: ready ? "Reward ready" : venue.reward_goal - card.points,
    textAlignment: "PKTextAlignmentRight" as const,
  };
  const pointsField = { key: "points", label: "POINTS", value: card.points, changeMessage: "You now have %@ points." };
  const codeField = { key: "code", label: "YOUR CODE", value: card.code };
  const poweredField = { key: "by", label: "POWERED BY", value: "Orbyn" }; // small, top right of the front (the back also says it)
  // The offer comes first on the back, but only for guests who agreed to offers (see appleOfferField in offers.ts).
  const offer = await offerStateForCard(card.id, venue.id);
  // The landscape card itself lives on the web: a Wallet pass is always a tall card, so the back links to it (it also shows the latest points).
  const cardUrl = `${process.env.PUBLIC_BASE_URL ?? baseUrl}/card/${card.id}`;
  const backFields = [
    ...(offer ? [appleOfferField(venue.name, offer.message, offer.alert)] : []),
    { key: "open", label: "Your card", value: `Open your ${venue.name} card`, attributedValue: `<a href="${cardUrl}">Open your ${venue.name} card</a>` },
    { key: "how", label: "How it works", value: `Show this card at the till. You earn ${venue.points_per_bhd} points for every BHD 1.` },
    { key: "reward", label: "Your reward", value: venue.reward_text },
    { key: "terms", label: "Terms", value: `Points have no cash value. Rewards are set by ${venue.name} and can change.` },
    { key: "powered", label: "Powered by", value: "Orbyn" },
  ];

  // Store card (all iPhones): the strip is the card artwork only and nothing is printed over it (no primary fields).
  // Wallet puts secondary and auxiliary fields on ONE row and four of them do not fit next to a name (measured on a real
  // iPhone), so the row holds three: MEMBER, POINTS, YOUR CODE. How far to the reward is the first thing on the back.
  const storeCard = new PassType("storeCard");
  if (preview) {
    // Test cards only (?preview=qr or card, separate serial, never updated): points small in the header, nothing printed on top of the strip.
    storeCard.headerFields.push(pointsField);
    storeCard.secondaryFields.push({ key: "member", label: "MEMBER", value: memberName }, progress);
    storeCard.auxiliaryFields.push(codeField);
    storeCard.backFields.push(...backFields);
  } else {
    storeCard.headerFields.push(poweredField);
    storeCard.secondaryFields.push({ key: "member", label: "MEMBER", value: memberName }, { ...pointsField, textAlignment: "PKTextAlignmentCenter" as const });
    storeCard.auxiliaryFields.push({ ...codeField, textAlignment: "PKTextAlignmentRight" as const });
    const togo = { key: "togo", label: "To your reward", value: progress.value };
    storeCard.backFields.push(...(offer ? [backFields[0], togo, ...backFields.slice(1)] : [togo, ...backFields]));
  }

  if (poster) {
    // Poster (iOS 27+): the marble is the whole card, the venue name is in the artwork. Wallet prints MEMBER and the name,
    // POINTS directly under it (same order as the member card in the app), progress beside it, and the code in the footer.
    const posterCard = new PassType("posterGeneric");
    posterCard.headerFields.push(poweredField);
    posterCard.primaryFields.push({ key: "member", label: "MEMBER", value: memberName }, pointsField, progress);
    posterCard.footerFields.push(codeField);
    posterCard.backFields.push(...backFields);
    pass.types.push(posterCard, storeCard);
  } else {
    pass.types.push(storeCard);
  }
  if (preview !== "qr") pass.setBarcodes({
    format: "PKBarcodeFormatQR",
    message: `LOYALTY:${venue.slug}:${card.code}`,
    messageEncoding: "iso-8859-1",
    altText: card.code,
  });
  return pass.getAsBuffer();
}
