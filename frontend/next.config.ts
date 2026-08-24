import type { NextConfig } from "next";

const backendOrigin = process.env.NEXT_PUBLIC_API_URL
  ? new URL(process.env.NEXT_PUBLIC_API_URL).origin
  : "http://localhost:3000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Allow the Arena preview iframe host in development.
  allowedDevOrigins: [".e2b.app"],
  images: {
    // Product media can come from the backend (local /static or CDN).
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  env: {
    BACKEND_ORIGIN: backendOrigin,
  },
};

export default nextConfig;
