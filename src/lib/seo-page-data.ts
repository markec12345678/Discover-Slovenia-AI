import { unstable_cache } from "next/cache";
import type {
  Experience as DbExperience,
  Listing as DbListing,
  Product as DbProduct,
} from "@prisma/client";
import { db } from "@/lib/db";
import type { Experience } from "@/lib/marketplace-types";
import type { PartnerStatus } from "@/components/partner-badge";
import type { SeoListingInput } from "@/components/sections/seo-conversion";

/**
 * PREDPOMNJENI DB poizvedbe za programatske SEO strani
 * (/destinacija/[slug]/things-to-do in /destinacija/[slug]/guide/[type]).
 *
 * ZAKAJ (fix produkcijske napake, 2026-09-13): ti strani sta dinamični
 * (host-zavedni canonicali prek currentBaseUrl() → headers()), zato je VSAK
 * request izvedel 2–3 DB poizvedbe. Ob vzporednem obremenjevanju (paralelno
 * pridobivanje sitemap-a, Googlebot) se je Neon pooler (connection_limit=1)
 * zamašil → timeouti → 61/689 sitemap URL-jev je vračalo HTTP 500
 * (zaporedni retest istih URL-jev: vse 200 — potrjena časovna, ne podatkovna
 * pogojenost napake).
 * Strani brez DB poizvedb (itinerary/best-time-to-visit) niso nikoli odpadle.
 *
 * REŠITEV (2 plasti):
 * 1. unstable_cache (revalidate 3600 s, tags: ["marketplace", "seo-pages"]) —
 *    podatki so gostiteljsko in lokalno neodvisni; spremembe moderacije
 *    (approve/reject/objava) se na SEO straneh prenesejo v roku 1 h;
 *    revalidateTag("marketplace") omogoča prihodnjo takojšnjo osvežitev.
 * 2. try/catch fallback NA KLICI (ne znotraj predpomnjene funkcije!) — ob
 *    napaki DB se kartične sekcije preprosto ne izrišejo (stran NIKOLI ne
 *    500), predpomnilnik pa se NE zastrupi s praznim rezultatom.
 *
 * NAPOMBA o serializaciji: unstable_cache shranjuje vrednosti kot JSON, zato
 * Date polja Prisma vrstic (createdAt/updatedAt) postanejo ISO stringi.
 * Kartice (SeoExperienceCard/SeoListingCard) teh polj ne uporabljajo —
 * preslikava namerno enaka originalni (razširjen spread) za identično
 * izpisovanje.
 */

/** Trajanje predpomnilnika (sekunde) — 1 ura. */
const REVALIDATE_SECONDS = 3600;

/** JSON string iz Prisma → string[] (robustno ob neveljavnih podatkih). */
function parseJsonArray(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

/** Izdelek za kartično sekcijo na things-to-do (samo polja, ki se izrisujejo). */
export interface SeoProductCardInput {
  id: string;
  name: string;
  description: string;
  price: number;
}

export interface SeoThingsToDoData {
  listings: SeoListingInput[];
  experiences: Experience[];
  products: SeoProductCardInput[];
}

export interface SeoGuideData {
  listings: SeoListingInput[];
  experiences: Experience[];
}

/** Prazni rezultat za EN strani (P4-8: na EN se sploh NE povprašuje po DB). */
export const EMPTY_SEO_THINGS_TO_DO: SeoThingsToDoData = {
  listings: [],
  experiences: [],
  products: [],
};

/** Prazni rezultat za EN strani (P4-8). */
export const EMPTY_SEO_GUIDE: SeoGuideData = {
  listings: [],
  experiences: [],
};

function toSeoListing(l: DbListing, destinationName: string): SeoListingInput {
  return {
    id: l.id,
    name: l.name,
    category: l.category,
    description: l.description,
    address: l.address,
    rating: l.rating,
    reviewCount: l.reviewCount,
    plan: l.plan,
    featured: l.featured,
    partnerStatus: (l.partnerStatus as PartnerStatus | null) ?? "standard",
    destinationName: l.destinationName ?? destinationName,
  };
}

function toSeoExperience(e: DbExperience): Experience {
  return {
    ...e,
    images: parseJsonArray(e.images),
    languages: parseJsonArray(e.languages),
    category: e.category as Experience["category"],
  };
}

async function fetchThingsToDoData(
  destinationId: string,
  destinationName: string
): Promise<SeoThingsToDoData> {
  const [listings, experiences, products] = await Promise.all([
    db.listing.findMany({
      where: { destinationId },
      take: 6,
      orderBy: { featured: "desc" },
    }),
    db.experience.findMany({
      where: { destinationId },
      take: 6,
      orderBy: { featured: "desc" },
    }),
    db.product.findMany({
      where: { destinationId },
      take: 4,
      orderBy: { featured: "desc" },
    }),
  ]);

  return {
    listings: listings.map((l) => toSeoListing(l, destinationName)),
    experiences: experiences.map(toSeoExperience),
    products: products.map((p: DbProduct) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
    })),
  };
}

async function fetchGuideData(
  destinationId: string,
  destinationName: string,
  listingCategories: string[],
  experienceCategories: string[]
): Promise<SeoGuideData> {
  const [listings, experiences] = await Promise.all([
    db.listing.findMany({
      where: {
        destinationId,
        category: { in: listingCategories },
      },
      take: 6,
      orderBy: [{ featured: "desc" }, { rating: "desc" }],
    }),
    db.experience.findMany({
      where: {
        destinationId,
        category: { in: experienceCategories },
      },
      take: 4,
      orderBy: [{ featured: "desc" }, { rating: "desc" }],
    }),
  ]);

  return {
    listings: listings.map((l) => toSeoListing(l, destinationName)),
    experiences: experiences.map(toSeoExperience),
  };
}

// Modul-nivo ovojnice (stabilna identiteta funkcije = stabilen ključ
// predpomnilnika; argumenti klica so del ključa).
const cachedThingsToDoData = unstable_cache(
  fetchThingsToDoData,
  ["seo-things-to-do"],
  { revalidate: REVALIDATE_SECONDS, tags: ["marketplace", "seo-pages"] }
);

const cachedGuideData = unstable_cache(
  fetchGuideData,
  ["seo-guide"],
  { revalidate: REVALIDATE_SECONDS, tags: ["marketplace", "seo-pages"] }
);

/**
 * Predpomnjene poizvedbe za /destinacija/[slug]/things-to-do.
 * Napaka DB/cache → prazni seznami (sekcije se ne izrišejo, stran ostane 200).
 */
export async function getSeoThingsToDoData(
  destinationId: string,
  destinationName: string
): Promise<SeoThingsToDoData> {
  try {
    return await cachedThingsToDoData(destinationId, destinationName);
  } catch (error) {
    console.error("[seo-page-data] things-to-do DB/cache napaka:", error);
    return EMPTY_SEO_THINGS_TO_DO;
  }
}

/**
 * Predpomnjene poizvedbe za /destinacija/[slug]/guide/[type]
 * (filtrirano po kategorijah tipa vodnika).
 * Napaka DB/cache → prazni seznami (sekcije se ne izrišejo, stran ostane 200).
 */
export async function getSeoGuideData(
  destinationId: string,
  destinationName: string,
  listingCategories: string[],
  experienceCategories: string[]
): Promise<SeoGuideData> {
  try {
    return await cachedGuideData(
      destinationId,
      destinationName,
      listingCategories,
      experienceCategories
    );
  } catch (error) {
    console.error("[seo-page-data] guide DB/cache napaka:", error);
    return EMPTY_SEO_GUIDE;
  }
}
