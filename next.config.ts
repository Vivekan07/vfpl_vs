import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phone/other devices on LAN use this IP; without it, Next blocks /_next JS
  // and the auction page stays on "Loading transfer window…".
  allowedDevOrigins: ["192.168.1.215", "192.168.1.237"],
  experimental: {
    // Player PPTX files with photos are far larger than the 10MB default.
    proxyClientMaxBodySize: "100mb",
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
