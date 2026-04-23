import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.cdiscount.com" },
      { protocol: "https", hostname: "i2.cdscdn.com" },
    ],
  },
};

export default nextConfig;
