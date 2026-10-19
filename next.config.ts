import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.DEMOPOP_TEST_DIST_DIR || ".next",
  poweredByHeader: false,
  serverExternalPackages: [
    "sharp",
    "playwright-core",
    "@remotion/renderer",
    "@remotion/bundler",
  ],
  experimental: { proxyClientMaxBodySize: "12mb" },
};
export default config;
