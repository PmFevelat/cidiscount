/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.cdiscount.com" },
      { protocol: "https", hostname: "i2.cdscdn.com" },
    ],
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Huge snapshot HTML under public/ can slow or confuse the dev watcher.
      const extraIgnored = ["**/public/snapshots/**"];
      const currentIgnored = config.watchOptions?.ignored;
      if (Array.isArray(currentIgnored)) {
        config.watchOptions = {
          ...(config.watchOptions || {}),
          ignored: [...currentIgnored, ...extraIgnored],
        };
      } else if (typeof currentIgnored === "string") {
        config.watchOptions = {
          ...(config.watchOptions || {}),
          ignored: [currentIgnored, ...extraIgnored],
        };
      } else {
        config.watchOptions = {
          ...(config.watchOptions || {}),
          ignored: extraIgnored,
        };
      }
    }
    return config;
  },
};

export default nextConfig;
