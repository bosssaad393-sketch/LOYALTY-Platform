import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Apple Wallet pass images are read from disk at request time.
  outputFileTracingIncludes: { "/api/wallet/apple/**": ["./passes/**/*"], "/api/applewallet/**": ["./passes/**/*"] },
};

export default createNextIntlPlugin()(nextConfig);
