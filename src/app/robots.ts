// Next.js 16 robots generator — Discover Slovenia AI.
// Dostopen na /robots.txt.

import type { MetadataRoute } from "next";
import { BASE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/owner", "/api/"],
      },
      // Dovoli glavnim socialnim crawlerjem dostop do slik za predogled.
      {
        userAgent: ["Googlebot", "Bingbot", "Twitterbot", "facebookexternalhit"],
        allow: "/",
        disallow: ["/admin", "/owner", "/api/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
