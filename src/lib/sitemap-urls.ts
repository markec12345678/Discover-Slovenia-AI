import type { MetadataRoute } from "next";
import { DESTINATIONS } from "@/lib/slovenia-data";

// Skupni seznam vseh URL-jev, ki jih generira platforma.
// Uporablja ga /sitemap.ts in /api/admin/indexing za poročanje o indeksaciji.

export const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://ifeelslovenia.si";

export const DURATION_SLUGS = [
  "1-dan",
  "vikend",
  "3-dnevi",
  "5-dnevi",
  "7-dnevi",
] as const;

export const SEASON_SLUGS = ["pomlad", "poletje", "jesen", "zima"] as const;

// 4 tipi programatskih vodnikov (city clusters)
export const GUIDE_TYPES = [
  "romanticni-pobeg",
  "druzinski",
  "budget",
  "vikend",
] as const;

export type GuideType = (typeof GUIDE_TYPES)[number];

export const GUIDE_TYPE_META: Record<
  GuideType,
  { label: string; shortLabel: string; emoji: string; description: string }
> = {
  "romanticni-pobeg": {
    label: "Romantični pobeg",
    shortLabel: "Romantično",
    emoji: "❤️",
    description:
      "Pobeg za dva — romantične aktivnosti, večerje ob svečkah, zasebne izkušnje in nastanitve z razgledom.",
  },
  druzinski: {
    label: "Družinski izlet",
    shortLabel: "Družinsko",
    emoji: "👨‍👩‍👧",
    description:
      "Družinski prijazne aktivnosti za vse starosti — varne pohodne poti, zabavišča, otroški meniji in interaktivne izkušnje.",
  },
  budget: {
    label: "Cenovno ugoden obisk",
    shortLabel: "Budget",
    emoji: "💰",
    description:
      "Maksimalna izkušnja z minimalnim proračunom — brezplačne atrakcije, lokalni picnik, poceni prenočišča in javni transport.",
  },
  vikend: {
    label: "Vikend pobeg",
    shortLabel: "Vikend",
    emoji: "🗓️",
    description:
      "Popoln 2-dnevni pobeg — petek zvečer do nedelje popoldan. Uravnotežen program z glavnimi znamenitostmi in lokalno kulinarike.",
  },
};

export interface SitemapUrl {
  /** Polna URL z domeno */
  url: string;
  /** Relativna pot, npr. /destinacija/bled/things-to-do */
  path: string;
  /** Naziv kategorije strani za prikaz v admin UI */
  category: string;
  priority: number;
  changeFrequency: "daily" | "weekly" | "monthly";
}

function makeUrl(
  path: string,
  priority: number,
  category: string,
  changeFrequency: SitemapUrl["changeFrequency"] = "monthly",
): SitemapUrl {
  return {
    url: `${BASE_URL}${path}`,
    path,
    category,
    priority,
    changeFrequency,
  };
}

/**
 * Vrne vse URL-je, ki jih platforma generira.
 * Trenutno: 9 statičnih + 22 things-to-do + 110 itinererjev + 88 best-time + 88 vodnikov = 317
 */
export function getAllSitemapUrls(): SitemapUrl[] {
  const urls: SitemapUrl[] = [];

  // === Statične strani (14) ===
  urls.push(makeUrl("/", 1.0, "Domov", "daily"));
  urls.push(makeUrl("/#destinacije", 0.9, "Sekcija", "weekly"));
  urls.push(makeUrl("/#nacrtuj", 0.9, "Sekcija", "weekly"));
  urls.push(makeUrl("/#trznica", 0.8, "Sekcija", "daily"));
  urls.push(makeUrl("/#zemljevid", 0.7, "Sekcija", "weekly"));
  urls.push(makeUrl("/#dogodki", 0.7, "Sekcija", "weekly"));
  urls.push(makeUrl("/#blog", 0.6, "Sekcija", "weekly"));
  urls.push(makeUrl("/#pridruzi-se", 0.6, "Sekcija", "monthly"));
  urls.push(makeUrl("/#partnerji", 0.6, "Sekcija", "monthly"));
  // E-E-A-T strani (Google trust)
  urls.push(makeUrl("/o-strani", 0.5, "O strani", "monthly"));
  urls.push(makeUrl("/kontakt", 0.5, "Kontakt", "monthly"));
  urls.push(makeUrl("/politika-zasebnosti", 0.3, "Politika zasebnosti", "monthly"));
  urls.push(makeUrl("/pogoji-uporabe", 0.3, "Pogoji uporabe", "monthly"));
  urls.push(makeUrl("/vir-podatkov", 0.4, "Vir podatkov", "monthly"));

  // === Things to do (22) ===
  for (const d of DESTINATIONS) {
    urls.push(
      makeUrl(`/destinacija/${d.slug}/things-to-do`, 0.8, "Things to do", "weekly"),
    );
  }

  // === Itinererji (22 × 5 = 110) ===
  for (const d of DESTINATIONS) {
    for (const dur of DURATION_SLUGS) {
      urls.push(
        makeUrl(`/destinacija/${d.slug}/itinerary/${dur}`, 0.7, "Itinerer"),
      );
    }
  }

  // === Best time to visit (22 × 4 = 88) ===
  for (const d of DESTINATIONS) {
    for (const season of SEASON_SLUGS) {
      urls.push(
        makeUrl(
          `/destinacija/${d.slug}/best-time-to-visit/${season}`,
          0.7,
          "Best time to visit",
        ),
      );
    }
  }

  // === Vodniki / city clusters (22 × 4 = 88) ===
  for (const d of DESTINATIONS) {
    for (const type of GUIDE_TYPES) {
      urls.push(
        makeUrl(`/destinacija/${d.slug}/guide/${type}`, 0.7, "Vodnik"),
      );
    }
  }

  return urls;
}

/** Skupno število vseh URL-jev (za hitro poročanje brez gradnje seznama) */
export function getTotalSitemapUrlCount(): number {
  // 9 statičnih + 22 + 110 + 88 + 88 = 317
  return (
    9 +
    DESTINATIONS.length +
    DESTINATIONS.length * 5 +
    DESTINATIONS.length * 4 +
    DESTINATIONS.length * 4
  );
}

/** Normalizira path za primerjavo (odstrani hash, doda leading slash) */
export function normalizePath(input: string): string {
  if (!input) return "/";
  let p = input.trim();
  if (p.includes("#")) p = p.split("#")[0];
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

/** Pretvori SitemapUrl v Next.js MetadataRoute.Sitemap format */
export function toNextSitemap(
  urls: SitemapUrl[],
  now: Date = new Date(),
): MetadataRoute.Sitemap {
  return urls.map((u) => ({
    url: u.url,
    lastModified: now,
    changeFrequency: u.changeFrequency,
    priority: u.priority,
  }));
}
