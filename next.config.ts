import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phone/other devices on LAN use this IP; without it, Next blocks /_next JS
  // and the auction page stays on "Loading transfer window…".
  allowedDevOrigins: ["192.168.1.215"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
