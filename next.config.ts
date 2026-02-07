import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  distDir: 'dist',
  images: {
    unoptimized: true,
  },
  // 排除 API 路由，使用静态数据文件
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
