/**
 * White-label branding. One deployment = one client, and everything that is client-specific comes from
 * environment variables (see .env.example). With no variables set the app looks exactly like the template
 * (the Orbyn look: deep teal, cyan). Used by the layout, the pages, the manifests and both Wallet passes.
 *
 * Pure functions that take an `env` object, so they are easy to test.
 */

import { isLocale, type Locale } from "@/i18n/locale";

type Env = Record<string, string | undefined>;

export type BrandColors = { bg: string; text: string; accent: string };

export const DEFAULT_COLORS: BrandColors = { bg: "#04191d", text: "#eaf7f5", accent: "#14f1e9" };

const HEX = /^#[0-9a-f]{6}$/i;
const SLUG = /^[a-z0-9-]+$/;

const hexOr = (v: string | undefined, fallback: string) => (v && HEX.test(v.trim()) ? v.trim().toLowerCase() : fallback);

/** The client's three base colours: background, text and accent. Anything that is not #rrggbb is ignored. */
export function brandColors(env: Env = process.env): BrandColors {
  return {
    bg: hexOr(env.BRAND_BG, DEFAULT_COLORS.bg),
    text: hexOr(env.BRAND_TEXT, DEFAULT_COLORS.text),
    accent: hexOr(env.BRAND_ACCENT, DEFAULT_COLORS.accent),
  };
}

/** The client's name as shown on the app titles, the home-screen icons and the sign-in screens. */
export function brandName(env: Env = process.env): string {
  return env.BRAND_NAME?.trim() || "Rewards";
}

/** The venue (folder under public/venues and passes) used by the sign-in screens and the owner app. */
export function brandVenue(env: Env = process.env): string {
  const v = env.BRAND_DEFAULT_VENUE?.trim().toLowerCase();
  return v && SLUG.test(v) ? v : "orbyn";
}

/** "Powered by Orbyn" by default. Set BRAND_POWERED_BY to your own words, or to nothing to hide it. */
export function poweredBy(env: Env = process.env): string {
  return env.BRAND_POWERED_BY === undefined ? "Powered by Orbyn" : env.BRAND_POWERED_BY.trim();
}

/** The languages this client offers, default first: "en,ar", "ar,en" or just "en". Codes without text are ignored. */
export function brandLanguages(env: Env = process.env): Locale[] {
  const codes = (env.BRAND_LANGUAGES ?? "").split(",").map((c) => c.trim().toLowerCase()).filter(isLocale);
  return codes.length ? [...new Set(codes)] : ["en", "ar"];
}

/** The line under the pages:"<venue> Loyalty Rewards · Powered by Orbyn". */
export function footerLine(venueName: string, env: Env = process.env): string {
  return [`${venueName} Loyalty Rewards`, poweredBy(env)].filter(Boolean).join(" · ");
}

/**
 * BRAND_MARK=type: the client has no clean logo file yet, so the screens set the name in type inside a thin frame
 * instead of showing public/venues/<slug>/crest.png. When the real logo arrives: replace crest.png and icon.png and
 * remove the setting. Default = the crest image.
 */
/**
 * Whether the "send me news and offers" box on the join page starts ticked. Ticked unless BRAND_OFFERS_BOX=unticked.
 * Unticked is the careful choice under Bahrain's data law (the guest opts in by their own tap); fewer guests then
 * receive offers and automatic notices. The terms box is separate and is not affected.
 */
export function offersBoxTicked(env: Env = process.env): boolean {
  return env.BRAND_OFFERS_BOX?.trim().toLowerCase() !== "unticked";
}

export function brandMark(env: Env = process.env): "image" | "type" {
  return env.BRAND_MARK?.trim().toLowerCase() === "type" ? "type" : "image";
}

/** What the staff and owner screens need to show the client's identity. Built on the server, passed down as a prop. */
export type BrandProps = { name: string; slug: string; poweredBy: string; mark?: "type" };

export function brandProps(env: Env = process.env): BrandProps {
  return { name: brandName(env), slug: brandVenue(env), poweredBy: poweredBy(env), ...(brandMark(env) === "type" ? { mark: "type" as const } : {}) };
}

// ---- colour maths ------------------------------------------------------------------------------------------------

type Rgb = [number, number, number];

const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (c: Rgb) => "#" + c.map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0")).join("");

/** `t` of the way from colour a to colour b (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

const luminance = (hex: string) => {
  const [r, g, b] = toRgb(hex).map((n) => {
    const s = n / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** `rgb(r, g, b)` text, the form Apple Wallet wants. */
export function rgbText(hex: string): string {
  const [r, g, b] = toRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
}

/** The CSS variables for a set of base colours. Same names as the :root block in globals.css. */
export function brandTokens(c: BrandColors): Record<string, string> {
  const [r, g, b] = toRgb(c.accent);
  const [gr, gg, gb] = toRgb(mix(c.bg, c.accent, 0.38));
  return {
    "--bg": c.bg,
    "--text": c.text,
    "--surface": mix(c.bg, c.text, 0.06),
    "--surface2": mix(c.bg, c.text, 0.11),
    "--line": mix(c.bg, c.text, 0.2),
    "--muted": mix(c.text, c.bg, 0.1),
    "--dim": mix(c.text, c.bg, 0.45),
    "--gold": c.accent,
    "--gold2": mix(c.accent, "#ffffff", 0.3),
    "--gold-hi": mix(c.accent, "#ffffff", 0.6),
    "--gold-mid": mix(c.accent, "#000000", 0.12),
    "--gold-dim": mix(c.accent, "#000000", 0.42),
    "--gold-rgb": `${r} ${g} ${b}`,
    "--glow2-rgb": `${gr} ${gg} ${gb}`,
    "--card-top": mix(c.bg, c.text, 0.14),
    "--card-mid": mix(c.bg, c.text, 0.07),
    "--on-gold": luminance(c.accent) > 0.4 ? "#1a1410" : "#ffffff",
    "--deep": mix(c.bg, "#000000", 0.45),
    "--shade-rgb": toRgb(mix(c.bg, "#000000", 0.6)).join(" "),
    "--gold-hi-rgb": toRgb(mix(c.accent, "#ffffff", 0.6)).join(" "),
    // A client's own look keeps its marble photo under a dark layer and the moving network; the Orbyn look has its own ground.
    "--scrim-a": "0.93",
    "--net": "block",
  };
}

/** BRAND_FONT=classic: serif headings and figures for a client who wants a traditional look instead of Outfit. */
const CLASSIC_FONTS = {
  "--serif": 'Georgia, "Times New Roman", serif',
  "--sans": 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  "--display": "var(--display-classic), var(--serif)",
  "--display-arabic": "var(--display-classic-ar)",
};

/**
 * BRAND_FONT=baskerville: Libre Baskerville for headings and figures, Jost for text, Noto Naskh Arabic for Arabic
 * (a heritage restaurant look). The three faces are self-hosted by next/font (layout.tsx) and only drawn when chosen.
 */
const BASKERVILLE_FONTS = {
  "--font-sans": "var(--font-jost)",
  "--font-ar": "var(--font-naskh)",
  "--serif": 'var(--font-baskerville), var(--font-naskh), Georgia, "Times New Roman", serif',
  "--sans": 'var(--font-jost), var(--font-naskh), system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  "--display": "var(--serif)",
  "--display-arabic": "var(--font-naskh), var(--serif)",
};

/**
 * BRAND_FONT=marcellus: Marcellus (drawn from Roman inscriptions: letters that look cut into a wall) for headings,
 * Hanken Grotesk for text and figures, Noto Sans Arabic for all Arabic (a Latin name inside an Arabic heading stays
 * in Marcellus). Marcellus has one weight, so layout.tsx switches made-up bold off (class type-inscribed).
 */
const MARCELLUS_FONTS = {
  "--font-sans": "var(--font-hanken)",
  "--font-ar": "var(--font-arsans)",
  "--font-latin-display": "var(--font-marcellus)",
  "--font-ar-display": "var(--font-arsans)",
  "--serif": 'var(--font-marcellus), var(--font-arsans), Georgia, "Times New Roman", serif',
  "--sans": 'var(--font-hanken), var(--font-arsans), system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  "--display": "var(--serif)",
  "--display-arabic": "var(--serif)",
};

/**
 * BRAND_FONT=oswald: for a venue whose own logo is condensed capitals and Kufic lettering. Oswald for headings and
 * figures (set in capitals, see app/visit.css .type-poster), Hanken Grotesk for text; in Arabic, Noto Kufi Arabic
 * for headings and Noto Sans Arabic for text.
 */
const OSWALD_FONTS = {
  "--font-sans": "var(--font-hanken)",
  "--font-ar": "var(--font-arsans)",
  "--font-latin-display": "var(--font-oswald)",
  "--font-ar-display": "var(--font-arkufi)",
  "--serif": 'var(--font-oswald), var(--font-arkufi), "Arial Narrow", Arial, sans-serif',
  "--sans": 'var(--font-hanken), var(--font-arsans), system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  "--display": "var(--serif)",
  "--display-arabic": "var(--serif)",
};

export type BrandFont = "default" | "classic" | "baskerville" | "marcellus" | "oswald";

/** Which type set the client chose. Anything unknown = the template's own (Outfit and Tajawal). */
export function brandFont(env: Env = process.env): BrandFont {
  const v = env.BRAND_FONT?.trim().toLowerCase();
  return v === "classic" || v === "baskerville" || v === "marcellus" || v === "oswald" ? v : "default";
}

export type BrandFinish = "default" | "matte" | "glass";

/**
 * BRAND_FINISH=matte: the quiet finish for a client whose brand is flat colour and fine lines. No moving network, no
 * travelling light on the cards, no foil gradients or glows; primary buttons in the text colour; the accent kept for
 * hairlines and the gift. The Wallet pass uses the brand colour itself as its background. Default = the template finish.
 */
export function brandFinish(env: Env = process.env): BrandFinish {
  const v = env.BRAND_FINISH?.trim().toLowerCase();
  return v === "matte" || v === "glass" ? v : "default";
}

/**
 * BRAND_FINISH=glass: the matte finish's calm rules (no network, no foil, the accent as a hairline) with frosted glass
 * surfaces over the client's own background picture: public/venues/<slug>/glass-portrait.webp (phones) and
 * glass-wide.webp (wide screens). Styles in app/glass.css. Without the two pictures the glass sits on the plain
 * brand colour.
 */
export const isQuietFinish = (env: Env = process.env) => brandFinish(env) !== "default";

const MATTE_TOKENS = { "--net": "none", "--scrim-a": "1" };

/** True when a deployment has no client colours: it gets the Orbyn look, including the moving ground. */
export function usesOrbynLook(env: Env = process.env): boolean {
  const c = brandColors(env);
  return c.bg === DEFAULT_COLORS.bg && c.text === DEFAULT_COLORS.text && c.accent === DEFAULT_COLORS.accent;
}

/** Inline style for <html>: empty when the colours are the template's own, so nothing changes by default. */
export function brandStyle(env: Env = process.env): Record<string, string> {
  const c = brandColors(env);
  const same = c.bg === DEFAULT_COLORS.bg && c.text === DEFAULT_COLORS.text && c.accent === DEFAULT_COLORS.accent;
  const font = brandFont(env);
  return {
    ...(same ? {} : brandTokens(c)),
    ...(font === "classic" ? CLASSIC_FONTS : font === "baskerville" ? BASKERVILLE_FONTS : font === "marcellus" ? MARCELLUS_FONTS : font === "oswald" ? OSWALD_FONTS : {}),
    ...(isQuietFinish(env) ? MATTE_TOKENS : {}),
  };
}

/** Wallet colours. With the template colours these are exactly the values the app always used. */
export function walletColors(env: Env = process.env) {
  const c = brandColors(env);
  // Matte finish: the brand colour itself (a deep green stays green on the lock screen instead of going near black).
  const matte = isQuietFinish(env);
  return {
    appleBackground: rgbText(matte ? c.bg : mix(c.bg, "#000000", 0.6)),
    applePreviewBackground: rgbText(matte ? c.bg : mix(c.bg, "#000000", 0.3)),
    appleForeground: rgbText(c.text),
    appleLabel: rgbText(c.accent),
    googleBackground: c.bg,
  };
}
