import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  const venue = brandVenue();
  const style = { ...brandStyle(), "--brand-marble": `url("/venues/${venue}/marble.jpg")` } as CSSProperties;
  // An optional venue backdrop (public/venues/<slug>/ambient.svg) sits behind every screen.
  const ambient = existsSync(join(process.cwd(), "public", "venues", venue, "ambient.svg"));
  if (ambient) (style as Record<string, string>)["--brand-ambient"] = `url("/venues/${venue}/ambient.svg")`;
  return (
    <html lang="en" style={style}>
      <body className={ambient ? "has-ambient" : undefined}>{children}</body>
    </html>
  );
}
