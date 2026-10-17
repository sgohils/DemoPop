import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["sharp"],
  experimental: { proxyClientMaxBodySize: "12mb" },
};
export default config;
