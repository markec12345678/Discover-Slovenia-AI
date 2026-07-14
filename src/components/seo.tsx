// Reusable JSON-LD schema generators za SEO
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { Destination } from "@/lib/types";

const BASE_URL = "https://discoverslovenia.ai";
const LANGS = ["sl", "en", "de", "it"];

// === HREFLANG HELPER ===
// Vrne alternates.languages za Next.js metadata — hreflang za vse 4 jezike
export function hreflangForPath(path: string) {
  const languages: Record<string, string> = {};
  for (const lang of LANGS) {
    if (lang === "sl") {
      languages["sl-SI"] = `${BASE_URL}${path}`;
    } else {
      languages[lang === "en" ? "en-US" : lang === "de" ? "de-DE" : "it-IT"] = `${BASE_URL}/${lang}${path}`;
    }
  }
  // x-default → slovenščina
  languages["x-default"] = `${BASE_URL}${path}`;
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
export function destinationSchema(dest: Destination) {
  return {
    "@context": "https://schema.org",
    "@type": ["TouristDestination", "Place"],
    "@id": `${BASE_URL}/destinacija/${dest.slug}/things-to-do#destination`,
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
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: dest.rating,
      reviewCount: Math.floor(dest.rating * 50),
      bestRating: 5,
      worstRating: 1,
    },
    touristType: dest.bestFor.map((b) => b.charAt(0).toUpperCase() + b.slice(1)),
    availableLanguage: ["Slovenian", "English", "German", "Italian"],
    containsPlace: DESTINATIONS
      .filter((d) => d.region === dest.region && d.id !== dest.id)
      .slice(0, 5)
      .map((d) => ({
        "@type": "Place",
        name: d.name,
        url: `${BASE_URL}/destinacija/${d.slug}/things-to-do`,
      })),
    isAccessibleForFree: dest.costPerPerson === 0,
    publicAccess: true,
    url: `${BASE_URL}/destinacija/${dest.slug}/things-to-do`,
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
    aggregateRating: listing.rating > 0 ? {
      "@type": "AggregateRating",
      ratingValue: listing.rating,
      reviewCount: listing.reviewCount,
      bestRating: 5,
    } : undefined,
  };
}

// === ARTICLE SCHEMA (za blog) ===
export function articleJsonLd(article: {
  title: string;
  description: string;
  image: string;
  datePublished: string;
  author: string;
  url: string;
}) {
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
        url: `${BASE_URL}/icon-192.png`,
        width: 192,
        height: 192,
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": article.url },
  };
}

// === WEBSITE SCHEMA (za homepage) ===
export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${BASE_URL}/#website`,
    url: BASE_URL,
    name: "Discover Slovenia AI",
    description: "AI-poganjana turistična platforma za Slovenijo",
    publisher: {
      "@type": "Organization",
      name: "Discover Slovenia AI",
      url: BASE_URL,
    },
    potentialAction: {
      "@type": "SearchAction",
      target: `${BASE_URL}/#destinacije?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
    inLanguage: ["sl-SI", "en-US", "de-DE", "it-IT"],
  };
}

// === ORGANIZATION SCHEMA ===
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${BASE_URL}/#organization`,
    name: "Discover Slovenia AI",
    url: BASE_URL,
    logo: `${BASE_URL}/icon-512.png`,
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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
