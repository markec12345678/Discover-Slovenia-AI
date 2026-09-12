// Reusable JSON-LD schema generators za SEO
import { safeJsonLd } from "@/lib/security";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { Destination } from "@/lib/types";
import { DEFAULT_BASE_URL } from "@/lib/host";

// SEO-2: BASE_URL ni več statičen — funkcije sprejmejo `baseUrl` (host-zavedno,
// iz resolveBaseUrlFromHeaders/currentBaseUrl iz lib/host.ts). Privzeta vrednost
// ostane domena (varno fallback), klicatelji v strežniških komponentah pa
// podajo DEJANSKEGA gostitelja requesta.
// P4-8: javno samo slovenščina — /en, /de, /it so trajno (308) preusmerjeni
// na slovensko pot (glej src/proxy.ts), zato NE objavljemo hreflang alternat
// za neobstoječe strani. Ko bodo celoviti prevodi (roadmap C5), dodajte
// jezike nazaj.
const LANGS = ["sl"];

// === HREFLANG HELPER ===
// Vrne alternates.languages za Next.js metadata — hreflang za javne jezike
// (trenutno samo sl — glej P4-8 opombo zgoraj)
export function hreflangForPath(path: string, baseUrl: string = DEFAULT_BASE_URL) {
  const languages: Record<string, string> = {};
  for (const lang of LANGS) {
    if (lang === "sl") {
      languages["sl-SI"] = `${baseUrl}${path}`;
    } else {
      languages[lang === "en" ? "en-US" : lang === "de" ? "de-DE" : "it-IT"] = `${baseUrl}/${lang}${path}`;
    }
  }
  // x-default → slovenščina
  languages["x-default"] = `${baseUrl}${path}`;
  return languages;
}

// === FAQ SCHEMA ===
export function faqJsonLd(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

// === BREADCRUMB SCHEMA ===
export function breadcrumbJsonLd(items: { name: string; url?: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      ...(item.url ? { item: item.url } : {}),
    })),
  };
}

// === ENHANCED DESTINATION SCHEMA ===
// TouristDestination + Place + GeoCoordinates + ImageObject
export function destinationSchema(dest: Destination, baseUrl: string = DEFAULT_BASE_URL) {
  return {
    "@context": "https://schema.org",
    "@type": ["TouristDestination", "Place"],
    "@id": `${baseUrl}/destinacija/${dest.slug}/things-to-do#destination`,
    name: dest.name,
    description: dest.description,
    tagline: dest.tagline,
    image: {
      "@type": "ImageObject",
      url: dest.image,
      width: 1200,
      height: 800,
    },
    photo: dest.image,
    geo: {
      "@type": "GeoCoordinates",
      latitude: dest.coords.lat,
      longitude: dest.coords.lng,
    },
    address: {
      "@type": "PostalAddress",
      addressCountry: "SI",
      addressRegion: dest.region,
    },
    // OPOMBA: aggregateRating NAMENOMA izpuščen — destinacije nimajo
    // pravih uporabniških recenzij (izmišljeni reviewCount = napihnjen
    // social proof + tveganje za Google rich-results kazni).
    touristType: dest.bestFor.map((b) => b.charAt(0).toUpperCase() + b.slice(1)),
    availableLanguage: ["Slovenian", "English", "German", "Italian"],
    containsPlace: DESTINATIONS
      .filter((d) => d.region === dest.region && d.id !== dest.id)
      .slice(0, 5)
      .map((d) => ({
        "@type": "Place",
        name: d.name,
        url: `${baseUrl}/destinacija/${d.slug}/things-to-do`,
      })),
    isAccessibleForFree: dest.costPerPerson === 0,
    publicAccess: true,
    url: `${baseUrl}/destinacija/${dest.slug}/things-to-do`,
    sameAs: [
      `https://en.wikipedia.org/wiki/${dest.name.replace(/\s/g, "_")}`,
      `https://www.slovenia.info/en/destinations`,
    ],
  };
}

// === LOCAL BUSINESS SCHEMA (za listings) ===
export function localBusinessSchema(listing: {
  name: string;
  description: string;
  address: string;
  phone?: string | null;
  website?: string | null;
  rating: number;
  reviewCount: number;
  priceRange: string;
  destinationName?: string | null;
  images?: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: listing.name,
    description: listing.description,
    image: listing.images?.[0] || undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: listing.address,
      addressCountry: "SI",
      addressRegion: listing.destinationName || undefined,
    },
    telephone: listing.phone || undefined,
    url: listing.website || undefined,
    priceRange: listing.priceRange,
    aggregateRating:
      listing.rating > 0 && listing.reviewCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: listing.rating,
            reviewCount: listing.reviewCount,
            bestRating: 5,
          }
        : undefined,
  };
}

// === ARTICLE SCHEMA (za blog) ===
export function articleJsonLd(
  article: {
    title: string;
    description: string;
    image: string;
    datePublished: string;
    author: string;
    url: string;
  },
  baseUrl: string = DEFAULT_BASE_URL,
) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    image: {
      "@type": "ImageObject",
      url: article.image,
      width: 1200,
      height: 800,
    },
    datePublished: article.datePublished,
    author: { "@type": "Person", name: article.author },
    publisher: {
      "@type": "Organization",
      name: "Discover Slovenia AI",
      logo: {
        "@type": "ImageObject",
        url: `${baseUrl}/icon-192.png`,
        width: 192,
        height: 192,
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": article.url },
  };
}

// === WEBSITE SCHEMA (za homepage) ===
export function websiteSchema(baseUrl: string = DEFAULT_BASE_URL) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${baseUrl}/#website`,
    url: baseUrl,
    name: "Discover Slovenia AI",
    description: "AI-poganjana turistična platforma za Slovenijo",
    publisher: {
      "@type": "Organization",
      name: "Discover Slovenia AI",
      url: baseUrl,
    },
    potentialAction: {
      "@type": "SearchAction",
      target: `${baseUrl}/destinacije?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
    inLanguage: ["sl-SI", "en-US", "de-DE", "it-IT"],
  };
}

// === ORGANIZATION SCHEMA ===
export function organizationSchema(baseUrl: string = DEFAULT_BASE_URL) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${baseUrl}/#organization`,
    name: "Discover Slovenia AI",
    url: baseUrl,
    logo: `${baseUrl}/icon-512.png`,
    description: "AI turistična platforma za Slovenijo — destinacije, tržnica, B2B portali.",
    areaServed: "SI",
    knowsLanguage: ["sl", "en", "de", "it"],
  };
}

// Helper za render JSON-LD v komponentah
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }}
    />
  );
}
