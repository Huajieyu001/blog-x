import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: ["@blog-x/contracts"],
  async rewrites() {
    const apiOrigin = process.env.INTERNAL_API_ORIGIN ?? "http://127.0.0.1:3001";
    return [
      { source: "/api/:path*", destination: `${apiOrigin}/:path*` },
      { source: "/media/:path*", destination: `${apiOrigin}/media/:path*` },
    ];
  },
};

export default nextConfig;
