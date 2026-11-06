import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { Amiri, Cormorant_Garamond, Outfit, Tajawal } from "next/font/google";
import "./globals.css";
import { brandColors, brandName, brandStyle, brandVenue } from "@/lib/brand";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  const venue = brandVenue();
  const style = { ...brandStyle(), "--brand-marble": `url("/venues/${venue}/marble.jpg")` } as CSSProperties;
  return (
    <html lang="en" style={style} className={`${sans.variable} ${arabic.variable} ${display.variable} ${displayArabic.variable}`}>
      <body>{children}</body>
    </html>
  );
}
