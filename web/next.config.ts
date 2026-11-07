import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const dev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy. What a page may load, and where it may send things.
 * - Scripts: our own, plus inline (Next.js streams its page data as inline scripts; nonces would force every page to render
 *   per request and break partial prerendering). 'unsafe-eval' in development only (React's dev tools need it).
 * - Images: ours, data: (QR codes), blob: (camera snapshots), Supabase Storage (menu photos).
 * - Tap Payments: card forms and redirects live on *.tap.company. The guest leaves for Tap's page by a normal navigation.
 * - Nobody may put these pages in a frame (owner screens cannot be clickjacked).
 */
export const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co https://*.tap.company${dev ? " ws: wss:" : ""}`,
  "frame-src https://*.tap.company",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.tap.company",
  "frame-ancestors 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

export const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The staff till scans guest cards with the camera. Nothing uses the microphone, location or USB. Payment stays ours only
  // (Apple Pay runs on Tap's own page, not inside ours).
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(self), usb=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Apple Wallet pass images are read from disk at request time.
  outputFileTracingIncludes: { "/api/wallet/apple/**": ["./passes/**/*"], "/api/applewallet/**": ["./passes/**/*"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default createNextIntlPlugin()(nextConfig);
