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
import { parseTiers, stampState } from "./stamps";
import { ladderRows, rgb, stampCardStyle, stampStripImages, type StampCardStyle } from "./stampStrip";
import type { StampState } from "./stamps";
import { listBranches } from "./branchesDb";
import { passLocations, PASS_RADIUS_M } from "./branches";
import { cardVouchers } from "./vouchersDb";
import { passVoucher, voucherState } from "./vouchers";
import { noticeForCard } from "./autoMessagesDb";
import { qrMessage } from "./cardQr";
import { lampLevel, type LampLevel } from "./lamp";
import { giftStripImages } from "./giftPhoto";

/**
 * The Arabic side of a stamp card (Apple's ar.lproj): iPhones set to Arabic show the Arabic strip, the Arabic logo
 * (passes/<slug>/ar/logo*.png) and these words instead of the English ones. Field values that are names or numbers
 * stay as they are. Keys must match the English text on the pass exactly.
 */
function addArabic(pass: PKPass, venue: Venue, st: StampState, look: StampCardStyle, arStrip: Record<string, Buffer> | null) {
  if (arStrip) for (const [name, buf] of Object.entries(arStrip)) pass.addBuffer(`ar.lproj/${name}`, buf);
  try {
    const dir = path.join(process.cwd(), "passes", venue.slug, "ar");
    for (const name of readdirSync(dir)) if (/^logo(@[23]x)?\.png$/.test(name)) pass.addBuffer(`ar.lproj/${name}`, readFileSync(path.join(dir, name)));
  } catch {
    /* no Arabic logo: the English one is used */
  }
  const ar = (i: number) => st.tiers[i].ar || st.tiers[i].text;
  const strings: Record<string, string> = {
    "STAMPS": "الأختام",
    "MEMBER": "العضو",
    "NEXT REWARD": "المكافأة التالية",
    "REWARD READY": "المكافأة جاهزة",
    "To your reward": "المتبقي لمكافأتك",
    "Reward ready": "المكافأة جاهزة",
    "Your card": "بطاقتك",
    "How it works": "طريقة العمل",
    "Your next reward": "مكافأتك التالية",
    "Terms": "الشروط",
    "Powered by": "مقدّم من",
    "Your reward is ready: %@": "مكافأتك جاهزة: %@",
    [`Open your ${venue.name} card`]: `افتح بطاقة ${venue.name}`,
    [`Show this card at the counter. Every paid visit earns a stamp. Rewards: ${st.tiers.map((t) => `${t.at} stamps: ${t.text}`).join(" · ")}.`]:
      `اعرض هذه البطاقة عند الكاشير. كل زيارة مدفوعة تعطيك ختماً. المكافآت: ${st.tiers.map((t, i) => `${t.at} أختام: ${ar(i)}`).join(" · ")}.`,
    [`Stamps have no cash value. Rewards are set by ${venue.name} and can change.`]: `الأختام ليس لها قيمة نقدية. المكافآت يحددها ${venue.name} وقد تتغير.`,
  };
  st.tiers.forEach((t, i) => {
    if (t.ar) strings[t.text] = t.ar;
    const shortEn = look.short?.en?.[i], shortAr = look.short?.ar?.[i];
    if (shortEn && shortAr) strings[shortEn] = shortAr;
  });
  pass.localize("ar", strings);
}

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
    if (name === "stamp-mark.png") continue; // drawing material for the stamp strip, not a pass image
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

/**
 * The card picture for a lamp level (lib/lamp.ts): passes/<venue>/lamp/<level>/strip*.png for the levels in between,
 * the lit picture at the top level, and nothing (the venue's dark picture stays) at level 0 or where a venue has no
 * such pictures.
 */
export function lampStripImages(slug: string, level: LampLevel): Record<string, Buffer> {
  if (level === 0) return {};
  if (level === 4) return litStripImages(slug);
  const dir = path.join(process.cwd(), "passes", slug, "lamp", String(level));
  const files: Record<string, Buffer> = {};
  try {
    for (const name of readdirSync(dir)) if (/^strip(@[23]x)?\.png$/.test(name)) files[name] = readFileSync(path.join(dir, name));
  } catch {
    /* no lamp pictures for this venue: its dark picture stays */
  }
  return files;
}

/** "A gift is waiting" strip (passes/<venue>/lit/strip*.png): the same picture with the light on. Empty when the venue has none. */
function litStripImages(slug: string): Record<string, Buffer> {
  const dir = path.join(process.cwd(), "passes", slug, "lit");
  const files: Record<string, Buffer> = {};
  try {
    for (const name of readdirSync(dir)) if (/^strip(@[23]x)?\.png$/.test(name)) files[name] = readFileSync(path.join(dir, name));
  } catch {
    /* no lit strip for this venue */
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
  // Stamp venues (0020): the reward due next depends on the rewards already used.
  // Best effort: a points venue (or a failed read) simply keeps the points layout.
  const extra = (await Promise.resolve()
    .then(() => db().from("cards").select("rewards_given, venues(stamp_tiers)").eq("id", card.id).maybeSingle())
    .then((r) => r.data)
    .catch(() => null)) as { rewards_given: number | null; venues: { stamp_tiers: unknown } | null } | null;
  const tiers = parseTiers(extra?.venues?.stamp_tiers);
  const st = tiers ? stampState(tiers, card.points, Number(extra?.rewards_given ?? 0)) : null;
  // Stamp card look (venue has passes/<slug>/stamp-card.json): its colours and a strip drawn for this guest's stamps.
  const look = st && !preview ? stampCardStyle(venue.slug) : null;
  const ladderStrip = look && st ? await stampStripImages(venue.slug, ladderRows(st, st.tiers.map((t) => t.text)), look, "en") : null;
  // Arabic iPhones get their own strip, logo and words (Apple's ar.lproj), from the Arabic reward names when given.
  const arStrip = look && st && ladderStrip ? await stampStripImages(venue.slug, ladderRows(st, st.tiers.map((t) => t.ar || t.text)), look, "ar") : null;
  // Visit card (0022): no points. The front shows the visits and the gift that is ready; the card comes up on the
  // lock screen near a branch. All best effort: a failed read still gives a working card.
  const visitMode = venue.card_mode === "visits";
  const branches = visitMode ? await listBranches(venue.id) : [];
  const vouchers = visitMode ? await cardVouchers(card.id, venue.id) : [];
  const gift = visitMode ? passVoucher(vouchers) : null;
  const notice = visitMode ? await noticeForCard(card.id) : null;
  const locations = passLocations(branches, venue.name);
  const colors = walletColors();
  const props = {
    ...(locations.length ? { maxDistance: PASS_RADIUS_M } : {}),
    ...live,
    passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID,
    teamIdentifier: process.env.APPLE_TEAM_ID,
    serialNumber: preview ? `${card.id}.preview-${preview}` : card.id,
    organizationName: venue.name,
    description: preview ? `${venue.name} Loyalty Rewards (preview)` : `${venue.name} Loyalty Rewards`,
    // Live card: tinted black, which shows around the card artwork (its strip has transparent margins). Previews keep their own colour.
    backgroundColor: ladderStrip && look ? rgb(look.background) : preview ? colors.applePreviewBackground : colors.appleBackground,
    foregroundColor: ladderStrip && look ? rgb(look.foreground) : colors.appleForeground,
    labelColor: ladderStrip && look ? rgb(look.label) : colors.appleLabel,
    sharingProhibited: true,
  };

  const poster = posterEnabled();
  const images = venueImages(venue.slug, poster);
  if (preview === "qr") Object.assign(images, await qrStripImages(venue.slug, qrMessage(venue.slug, card.code, card.id)));
  if (preview === "card") Object.assign(images, cardStripImages(venue.slug));
  if (ladderStrip) Object.assign(images, ladderStrip);
  // Visit card: the lamp in the niche burns brighter with every few visits, and fully while a gift is waiting.
  if (visitMode && !preview) Object.assign(images, lampStripImages(venue.slug, lampLevel(card.visits, Boolean(gift))));
  // A waiting gift with its own photo (0033): the niche becomes a window onto it. No photo, or it cannot be read: the lit niche stays.
  if (visitMode && !preview && gift?.imageUrl) Object.assign(images, await giftStripImages(venue.slug, gift.imageUrl));
  const pass = new PKPass(
    images,
    appleCertificates(),
    props,
  );
  const goal = st ? st.cost : venue.reward_goal;
  const rewardText = st ? st.reward : venue.reward_text;
  const ready = card.points >= goal;
  const progress = {
    key: "progress",
    label: "TO YOUR REWARD",
    value: ready ? "Reward ready" : goal - card.points,
    textAlignment: "PKTextAlignmentRight" as const,
  };
  const pointsField = st
    ? { key: "points", label: "STAMPS", value: card.points, changeMessage: "You now have %@ stamps." }
    : { key: "points", label: "POINTS", value: card.points, changeMessage: "You now have %@ points." };
  const codeField = { key: "code", label: "YOUR CODE", value: card.code };
  const poweredField = { key: "by", label: "POWERED BY", value: "Orbyn" }; // small, top right of the front (the back also says it)
  // The offer comes first on the back, but only for guests who agreed to offers (see appleOfferField in offers.ts).
  const offer = await offerStateForCard(card.id, venue.id);
  // The landscape card itself lives on the web: a Wallet pass is always a tall card, so the back links to it (it also shows the latest points).
  const cardUrl = `${process.env.PUBLIC_BASE_URL ?? baseUrl}/card/${card.id}`;
  const backFields = [
    ...(offer ? [appleOfferField(venue.name, offer.message, offer.alert)] : []),
    { key: "open", label: "Your card", value: `Open your ${venue.name} card`, attributedValue: `<a href="${cardUrl}">Open your ${venue.name} card</a>` },
    st
      ? { key: "how", label: "How it works", value: `Show this card at the counter. Every paid visit earns a stamp. Rewards: ${st.tiers.map((t) => `${t.at} stamps: ${t.text}`).join(" · ")}.` }
      : { key: "how", label: "How it works", value: `Show this card at the till. You earn ${venue.points_per_bhd} points for every BHD 1.` },
    { key: "reward", label: st ? "Your next reward" : "Your reward", value: rewardText },
    { key: "terms", label: "Terms", value: `${st ? "Stamps" : "Points"} have no cash value. Rewards are set by ${venue.name} and can change.` },
    { key: "powered", label: "Powered by", value: "Orbyn" },
  ];

  // Store card (all iPhones): the strip is the card artwork only and nothing is printed over it (no primary fields).
  // Wallet puts secondary and auxiliary fields on ONE row and four of them do not fit next to a name (measured on a real
  // iPhone), so the row holds three: MEMBER, POINTS, YOUR CODE. How far to the reward is the first thing on the back.
  const storeCard = new PassType("storeCard");
  if (visitMode && !preview) {
    // Visit card: visits in the header, the member and the gift below the artwork. Wallet announces a gift once, when
    // it is unlocked (the field's value changes from the welcome line to the gift).
    const base = process.env.PUBLIC_BASE_URL ?? baseUrl;
    const main = branches.find((b) => b.kind === "branch");
    const used = vouchers.filter((v) => voucherState(v) === "used");
    storeCard.headerFields.push({ key: "visits", label: "VISITS", value: card.visits, textAlignment: "PKTextAlignmentRight" as const });
    storeCard.secondaryFields.push(
      { key: "member", label: "MEMBER", value: memberName },
      gift
        ? { key: "gift", label: "YOUR GIFT", value: gift.title, textAlignment: "PKTextAlignmentRight" as const, changeMessage: "Your gift is ready: %@" }
        : { key: "gift", label: "MEMBER CODE", value: card.code, textAlignment: "PKTextAlignmentRight" as const },
    );
    // Wallet renders a little HTML here; names, addresses and links come from the owner's settings, so escape them.
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const link = (key: string, label: string, text: string, url: string | null | undefined) =>
      url && /^https?:\/\//i.test(url) ? [{ key, label, value: text, attributedValue: `<a href="${esc(url)}">${esc(text)}</a>` }] : [];
    storeCard.backFields.push(
      ...(notice ? [{ key: "notice", label: `From ${venue.name}`, value: notice.message, changeMessage: "%@" }] : []),
      ...(offer ? [backFields[0]] : []),
      ...(gift ? [{ key: "giftHow", label: "Your gift", value: [gift.title, gift.detail, gift.redeemBranchName ? `Use it at ${gift.redeemBranchName}.` : null, gift.expiresAt ? `Valid until ${new Date(gift.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bahrain" })}.` : null, "One use only. Show this card to the staff."].filter(Boolean).join(" ") }] : []),
      ...(used.length ? [{ key: "giftUsed", label: "Used", value: used.map((v) => v.title).join(" · ") }] : []),
      { key: "open", label: "Your card", value: `Open your ${venue.name} card`, attributedValue: `<a href="${cardUrl}">Open your ${venue.name} card</a>` },
      ...link("menu", "Menu", "See the menu", main?.menuUrl ?? `${base}/menu/${venue.slug}`),
      ...branches.filter((b) => b.kind === "branch").flatMap((b) => link(`map-${b.slug}`, b.name, b.address ? `${b.address}. Directions` : "Directions", b.mapsUrl)),
      // The review link is on every card, whoever the guest is: never tied to a reward, never shown only to happy guests.
      ...link("review", "Tell us how we did", "Leave a Google review", main?.reviewUrl),
      { key: "how", label: "How it works", value: "Show this card each time you visit. The staff scan it, and gifts appear on the card when they are ready." },
      { key: "terms", label: "Terms", value: `Gifts are set by ${venue.name}, can change, have no cash value and can be used once.` },
      { key: "powered", label: "Powered by", value: "Orbyn" },
    );
  } else if (preview) {
    // Test cards only (?preview=qr or card, separate serial, never updated): points small in the header, nothing printed on top of the strip.
    storeCard.headerFields.push(pointsField);
    storeCard.secondaryFields.push({ key: "member", label: "MEMBER", value: memberName }, progress);
    storeCard.auxiliaryFields.push(codeField);
    storeCard.backFields.push(...backFields);
  } else if (look && ladderStrip && st) {
    // Stamp card: the count in the header, the ladder in the strip, the member and the reward due below it, the code
    // under the QR (Apple's altText). Wallet buzzes only when a reward becomes ready (Apple: change messages are for
    // time-sensitive news), so the change message is only on the pass while the reward is ready.
    storeCard.headerFields.push({ key: "stamps", label: "STAMPS", value: `${st.position} / ${st.cycle}`, textAlignment: "PKTextAlignmentRight" as const });
    storeCard.secondaryFields.push(
      { key: "member", label: "MEMBER", value: memberName },
      {
        key: "due",
        label: st.ready ? "REWARD READY" : "NEXT REWARD",
        // short name on the front so Wallet never cuts it; the full wording is on the back
        value: look.short?.en?.[st.index] || st.reward,
        textAlignment: "PKTextAlignmentRight" as const,
        ...(st.ready ? { changeMessage: "Your reward is ready: %@" } : {}),
      },
    );
    const togo = { key: "togo", label: "To your reward", value: progress.value };
    storeCard.backFields.push(...(offer ? [backFields[0], togo, ...backFields.slice(1)] : [togo, ...backFields]));
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
  if (look && ladderStrip && st) addArabic(pass, venue, st, look, arStrip);
  // Near a branch the card comes up on the lock screen (only for guests who hold the card: Wallet cannot reach anyone else).
  if (locations.length && !preview) pass.setLocations(...locations);
  if (preview !== "qr") pass.setBarcodes({
    format: "PKBarcodeFormatQR",
    message: qrMessage(venue.slug, card.code, card.id),
    messageEncoding: "iso-8859-1",
    altText: card.code,
  });
  return pass.getAsBuffer();
}
