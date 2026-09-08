import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const securityHeaders = [
  // Prepreči MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Prepreči clickjacking (iframe embedding)
  { key: "X-Frame-Options", value: "DENY" },
  // Omeji razkrivanje origina pri navzkrižnih zahtevah
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Onemogoči neuporabljene browser APIje
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=()",
  },
  // HSTS — vsili HTTPS za 2 leti (vključno s subdomenami)
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  // CSP — dovoljuje Next.js hydration skripte, Leaflet tile serverje in
  // slike iz dovoljenih CDN-ov; frame-ancestors prepreči embedding.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js App Router potrebuje inline skripte za hydration
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // slike: local + data URI + vsi https (unsplash, OSM tiles, sfile CDN)
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // API klici: lastni origin + zunanji (Open-Meteo preko proxy, Puter)
      "connect-src 'self' https: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "plus.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "sfile.chatglm.cn",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
