import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { Amiri, Cinzel, Cormorant_Garamond, Hanken_Grotesk, Jost, Libre_Baskerville, Marcellus, Noto_Kufi_Arabic, Noto_Naskh_Arabic, Noto_Sans_Arabic, Oswald, Outfit, Tajawal } from "next/font/google";
import "./globals.css";
import "./ground.css";
import "./screens.css";
import "./visit.css";
import "./glass.css";
import { cardArt, wallLoop, wordmark } from "@/lib/venueArt";
import WallLoop from "@/components/WallLoop";
import "@/components/motion.css";
import { brandColors, brandFinish, brandFont, brandName, brandStyle, brandVenue, usesOrbynLook } from "@/lib/brand";

// The client's name, colours and venue come from environment variables (src/lib/brand.ts, .env.example).
export function generateMetadata(): Metadata {
  return {
    title: brandName() === "Rewards" ? "Rewards" : `${brandName()} Rewards`,
    description: "Your digital rewards card, in Apple Wallet and Google Wallet.",
  };
}

export function generateViewport(): Viewport {
  return {
    themeColor: brandColors().bg,
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

const sans = Outfit({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const arabic = Tajawal({ subsets: ["arabic"], weight: ["400", "500", "700"], variable: "--font-ar", display: "swap", preload: false });
// Only drawn when a client sets BRAND_FONT=classic, so they are not preloaded.
const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["600", "700"], variable: "--display-classic", display: "swap", preload: false });
const displayArabic = Amiri({ subsets: ["arabic"], weight: "700", variable: "--display-classic-ar", display: "swap", preload: false });
// BRAND_FONT=baskerville (a heritage look): headings, text and Arabic. Self-hosted at build time, never fetched from Google by the browser.
const baskerville = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-baskerville", display: "swap", preload: false });
const jost = Jost({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-jost", display: "swap", preload: false });
const naskh = Noto_Naskh_Arabic({ subsets: ["arabic"], weight: ["400", "600", "700"], variable: "--font-naskh", display: "swap", preload: false });

// BRAND_FONT=marcellus (an inscriptional look): Marcellus for headings, Hanken Grotesk for text and figures, and
// Noto Sans Arabic for all Arabic. Only fetched by a browser when the set is chosen.
// No size-matched stand-in for the two Latin faces: that stand-in is a system font holding every script, so Arabic
// would be drawn from it and never reach the Arabic faces listed after it.
const marcellus = Marcellus({ subsets: ["latin"], weight: "400", variable: "--font-marcellus", display: "swap", preload: false, adjustFontFallback: false });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken", display: "swap", preload: false, adjustFontFallback: false });
// BRAND_FONT=oswald (a signboard look, for a logo set in condensed capitals and Kufic): Oswald for headings and
// figures, Noto Kufi Arabic for Arabic headings; text stays Hanken Grotesk and Noto Sans Arabic.
const oswald = Oswald({ subsets: ["latin"], variable: "--font-oswald", display: "swap", preload: false, adjustFontFallback: false });
// BRAND_FONT=cinzel (Saad's pick for Al Roshinah, 2026-11-25): Cinzel capitals for headings and figures, the same
// Arabic and text faces as the oswald set.
const cinzel = Cinzel({ subsets: ["latin"], variable: "--font-cinzel", display: "swap", preload: false, adjustFontFallback: false });
const arKufi = Noto_Kufi_Arabic({ subsets: ["arabic"], variable: "--font-arkufi", display: "swap", preload: false });
const arSans = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-arsans", display: "swap", preload: false });

export default function RootLayout({ children }: LayoutProps<"/">) {
  const venue = brandVenue();
  const orbyn = usesOrbynLook();
  const finish = brandFinish();
  const font = brandFont();
  const loop = finish === "glass" ? wallLoop(venue) : null;
  const mark = wordmark(venue);
  const style = {
    ...brandStyle(),
    "--brand-marble": `url("/venues/${venue}/marble.jpg")`,
    ...(cardArt(venue) ? { "--venue-card": `url("${cardArt(venue)!.src}")` } : {}),
    ...(mark ? { "--venue-wordmark": `url("${mark.src}")`, "--venue-wordmark-ratio": String(mark.ratio) } : {}),
    ...(loop ? { "--glass-still": `url("/venues/${venue}/glass-loop.webp")` } : {}),
    ...(finish === "glass" ? { "--glass-photo-p": `url("/venues/${venue}/glass-portrait.webp")`, "--glass-photo-w": `url("/venues/${venue}/glass-wide.webp")` } : {}),
  } as CSSProperties;
  return (
    // suppressHydrationWarning: the guest hub marks "opening already seen" on this element before the page hydrates.
    <html lang="en" suppressHydrationWarning style={style} className={`${orbyn ? "look-orbyn " : ""}${finish !== "default" ? "look-matte " : ""}${finish === "glass" ? "look-glass " : ""}${sans.variable} ${arabic.variable} ${display.variable} ${displayArabic.variable} ${baskerville.variable} ${jost.variable} ${naskh.variable} ${marcellus.variable} ${hanken.variable} ${arSans.variable} ${oswald.variable} ${cinzel.variable} ${arKufi.variable}${font === "marcellus" || font === "oswald" || font === "cinzel" ? " type-inscribed" : ""}${font === "oswald" || font === "cinzel" ? " type-poster" : ""}${font === "cinzel" ? " type-wide" : ""}`}>
      <body>
        {orbyn && (
          <div className="og" aria-hidden="true">
            <i className="og-lines" />
            <i className="og-mark" />
            <i className="og-spot og-a"><i className="og-lit" /></i>
            <i className="og-spot og-b"><i className="og-lit" /></i>
          </div>
        )}
        {loop && <WallLoop src={loop} />}
        {children}
      </body>
    </html>
  );
}
