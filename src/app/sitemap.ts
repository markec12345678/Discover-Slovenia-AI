import type { MetadataRoute } from "next";
import { getAllSitemapUrls, toNextSitemap } from "@/lib/sitemap-urls";

// Sitemap: 9 statičnih + 22 things-to-do + 110 itinererjev + 88 best-time + 88 vodnikov = 317 URL-jev
export default function sitemap(): MetadataRoute.Sitemap {
  return toNextSitemap(getAllSitemapUrls());
}
