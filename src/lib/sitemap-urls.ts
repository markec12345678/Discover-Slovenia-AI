import { DESTINATIONS } from "@/lib/slovenia-data";
import { ADRIA_GUIDES } from "@/lib/adria-guides";

// Skupni seznam vseh URL-jev, ki jih generira platforma.
// Uporablja ga /sitemap.xml route handler in /api/admin/indexing za poročanje o indeksaciji.

export const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://discoverslovenia.ai";

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

/**
 * Vrne vse URL-je, ki jih platforma generira.
 * Trenutno: 18 stalnih + 22 things-to-do + 110 itinererjev + 88 best-time + 88 vodnikov
 * + 10 jadranskih vodnikov (ADRIA-1) = 336
 *
 * `baseUrl` (MONET-10): dinamična pot (route handler /sitemap.xml) poda
 * DEJANSKEGA gostitelja zahteve → Google/Bing ne zavrnejo cross-host sitemapa.
 */
export function getAllSitemapUrls(baseUrl: string = BASE_URL): SitemapUrl[] {
  const urls: SitemapUrl[] = [];
  // Lokalni ovojec — vsi URL-ji znotraj funkcije uporabljajo DEJANSKEGA
  // gostitelja zahteve (ne statični BASE_URL iz env).
  const add = (
    path: string,
    priority: number,
    category: string,
    changeFrequency: SitemapUrl["changeFrequency"] = "monthly",
  ) => {
    urls.push({
      url: `${baseUrl}${path}`,
      path,
      category,
      priority,
      changeFrequency,
    });
  };

  // === Statične strani ===
  // FW3: hash sekcije so postale prave strani (AI-first hierarhija) —
  // prave URL-je Google indexira bolje kot /#anchorje.
  add("/", 1.0, "Domov", "daily");
  add("/nacrtuj", 0.9, "AI načrtovalec", "weekly");
  add("/destinacije", 0.9, "Destinacije", "weekly");
  add("/dozivetja", 0.8, "Doživetja", "weekly");
  add("/trznica", 0.8, "Tržnica", "daily");
  add("/lokali", 0.7, "Lokalni ponudniki", "weekly");
  add("/zemljevid", 0.7, "Zemljevid", "weekly");
  add("/dogodki", 0.7, "Dogodki", "weekly");
  add("/vodici", 0.6, "Vodiči", "weekly");
  add("/slovenia-pass", 0.6, "Slovenia Pass", "monthly");
  add("/za-ponudnike", 0.6, "Za ponudnike", "monthly");
  // E-E-A-T strani (Google trust)
  add("/o-strani", 0.5, "O strani", "monthly");
  add("/kontakt", 0.5, "Kontakt", "monthly");
  add("/politika-zasebnosti", 0.3, "Politika zasebnosti", "monthly");
  add("/pogoji-uporabe", 0.3, "Pogoji uporabe", "monthly");
  add("/vir-podatkov", 0.4, "Vir podatkov", "monthly");
  // GEO (MONET-10): formati, ki jih AI agenti in iskalniki iščejo na korenu.
  add("/llms.txt", 0.3, "GEO", "monthly");
  add("/rss.xml", 0.3, "GEO", "daily");

  // === Things to do (22) ===
  for (const d of DESTINATIONS) {
    add(`/destinacija/${d.slug}/things-to-do`, 0.8, "Things to do", "weekly");
  }

  // === Itinererji (22 × 5 = 110) ===
  for (const d of DESTINATIONS) {
    for (const dur of DURATION_SLUGS) {
      add(`/destinacija/${d.slug}/itinerary/${dur}`, 0.7, "Itinerer");
    }
  }

  // === Best time to visit (22 × 4 = 88) ===
  for (const d of DESTINATIONS) {
    for (const season of SEASON_SLUGS) {
      add(`/destinacija/${d.slug}/best-time-to-visit/${season}`, 0.7, "Best time to visit");
    }
  }

  // === Vodniki / city clusters (22 × 4 = 88) ===
  for (const d of DESTINATIONS) {
    for (const type of GUIDE_TYPES) {
      add(`/destinacija/${d.slug}/guide/${type}`, 0.7, "Vodnik");
    }
  }

  // === Jadranski vodniki (ADRIA-1: 10 cross-border) ===
  for (const g of ADRIA_GUIDES) {
    add(`/vodici/${g.slug}`, 0.7, "Jadranski vodnik", "weekly");
  }

  return urls;
}

/** Skupno število vseh URL-jev (za hitro poročanje brez gradnje seznama) */
export function getTotalSitemapUrlCount(): number {
  // 18 stalnih + 22 + 110 + 88 + 88 + 10 jadranskih (ADRIA-1) = 336
  return (
    18 +
    DESTINATIONS.length +
    DESTINATIONS.length * 5 +
    DESTINATIONS.length * 4 +
    DESTINATIONS.length * 4 +
    ADRIA_GUIDES.length
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