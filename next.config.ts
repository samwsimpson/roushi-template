import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  serverExternalPackages: ["postgres", "@neondatabase/serverless"],
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default config;
