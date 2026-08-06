import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.INTERNAL_API_ORIGIN ?? "http://127.0.0.1:3001"}/:path*` }];
  },
};

export default nextConfig;
