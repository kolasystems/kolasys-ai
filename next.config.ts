// Kolasys AI — Next.js Configuration
// Next.js 16 · Turbopack is the default bundler

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.amazonaws.com",
        pathname: "/**",
      },
    ],
  },
  // Silence import warnings from server-only packages used in workers
  serverExternalPackages: ["ioredis", "bullmq"],
};

export default nextConfig;
