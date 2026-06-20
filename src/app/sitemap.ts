import type { MetadataRoute } from "next";
import { DESTINATIONS } from "@/lib/slovenia-data";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://ifeelslovenia.si";

const DURATION_SLUGS = ["1-dan", "vikend", "3-dnevi", "5-dnevi", "7-dnevi"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/#destinacije`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/#nacrtuj`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/#trznica`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/#zemljevid`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/#dogodki`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/#blog`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE_URL}/#pridruzi-se`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/#partnerji`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];

  // "Things to do" strani (22)
  const thingsToDoPages: MetadataRoute.Sitemap = DESTINATIONS.map((d) => ({
    url: `${BASE_URL}/destinacija/${d.slug}/things-to-do`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // Itinerary strani (22 × 5 trajanj = 110)
  const itineraryPages: MetadataRoute.Sitemap = [];
  for (const dest of DESTINATIONS) {
    for (const dur of DURATION_SLUGS) {
      itineraryPages.push({
        url: `${BASE_URL}/destinacija/${dest.slug}/itinerary/${dur}`,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
  }

  return [...staticPages, ...thingsToDoPages, ...itineraryPages];
}
