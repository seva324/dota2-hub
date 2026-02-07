import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  distDir: 'dist',
  basePath: '/dota2-hub',
  assetPrefix: '/dota2-hub',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
