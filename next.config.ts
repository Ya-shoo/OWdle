import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
