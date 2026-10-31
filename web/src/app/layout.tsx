import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { brandColors, brandName, brandStyle, brandVenue } from "@/lib/brand";

// The client's name, colours and venue come from environment variables (src/lib/brand.ts, .env.example).
export function generateMetadata(): Metadata {
  return {
    title: `${brandName()} Rewards`,
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

const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["600", "700"], variable: "--display", display: "swap" });

export default function RootLayout({ children }: LayoutProps<"/">) {
  const venue = brandVenue();
  const style = { ...brandStyle(), "--brand-marble": `url("/venues/${venue}/marble.jpg")` } as CSSProperties;
  return (
    <html lang="en" style={style} className={display.variable}>
      <body>{children}</body>
    </html>
  );
}
