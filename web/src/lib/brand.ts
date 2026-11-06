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

/** What the staff and owner screens need to show the client's identity. Built on the server, passed down as a prop. */
export type BrandProps = { name: string; slug: string; poweredBy: string };

export function brandProps(env: Env = process.env): BrandProps {
  return { name: brandName(env), slug: brandVenue(env), poweredBy: poweredBy(env) };
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

/** True when a deployment has no client colours: it gets the Orbyn look, including the moving ground. */
export function usesOrbynLook(env: Env = process.env): boolean {
  const c = brandColors(env);
  return c.bg === DEFAULT_COLORS.bg && c.text === DEFAULT_COLORS.text && c.accent === DEFAULT_COLORS.accent;
}

/** Inline style for <html>: empty when the colours are the template's own, so nothing changes by default. */
export function brandStyle(env: Env = process.env): Record<string, string> {
  const c = brandColors(env);
  const same = c.bg === DEFAULT_COLORS.bg && c.text === DEFAULT_COLORS.text && c.accent === DEFAULT_COLORS.accent;
  return { ...(same ? {} : brandTokens(c)), ...(env.BRAND_FONT?.trim().toLowerCase() === "classic" ? CLASSIC_FONTS : {}) };
}

/** Wallet colours. With the template colours these are exactly the values the app always used. */
export function walletColors(env: Env = process.env) {
  const c = brandColors(env);
  return {
    appleBackground: rgbText(mix(c.bg, "#000000", 0.6)),
    applePreviewBackground: rgbText(mix(c.bg, "#000000", 0.3)),
    appleForeground: rgbText(c.text),
    appleLabel: rgbText(c.accent),
    googleBackground: c.bg,
  };
}
