import type { NextConfig } from "next";

const backendOrigin = process.env.NEXT_PUBLIC_API_URL
  ? new URL(process.env.NEXT_PUBLIC_API_URL).origin
  : "http://localhost:3000";

/**
 * Optional dev/preview reverse proxy. When API_PROXY_TARGET is set (e.g.
 * `http://127.0.0.1:3000`), /api/v1/* is proxied by this Next.js server, so
 * the browser talks same-origin — no CORS setup and cookies just work.
 * Leave unset to call the backend origin directly.
 */
const apiProxyTarget = process.env.API_PROXY_TARGET;

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
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiProxyTarget.replace(/\/$/, "")}/api/v1/:path*`,
      },
    ];
  },
  env: {
    BACKEND_ORIGIN: backendOrigin,
  },
};

export default nextConfig;
