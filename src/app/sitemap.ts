import type { MetadataRoute } from "next";
import { getAllSitemapUrls, toNextSitemap } from "@/lib/sitemap-urls";

// Sitemap: 14 statičnih + 22 things-to-do + 110 itinererjev + 88 best-time + 88 vodnikov = 322 URL-jev
export default function sitemap(): MetadataRoute.Sitemap {
  return toNextSitemap(getAllSitemapUrls());
}
