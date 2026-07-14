// Structured data (Schema.org JSON-LD) komponente za Discover Slovenia AI.
// Server component — generira <script type="application/ld+json"> za različne entitete.

import type { Destination } from "@/lib/types";
import type { Listing } from "@/lib/listings-types";
import type { Product, Experience } from "@/lib/marketplace-types";
import { BASE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/seo";

// Slovenske oznake regij za berljiv prikaz v strukturiiranih podatkih.
const REGION_LABELS: Record<string, string> = {
  gorenjska: "Gorenjska",
  primorska: "Primorska",
  osrednja: "Osrednja Slovenija",
  kras: "Kras",
  stajerska: "Štajerska",
  koroska: "Koroška",
  prekmurje: "Prekmurje",
  dolenjska: "Dolenjska",
  "bela-krajina": "Bela krajina",
};

interface JsonLdProps {
  data: Record<string, unknown>;
}

/** Osnovni wrapper za izpis JSON-LD skripte. */
function JsonLdScript({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/** TouristDestination — za vsako destinacijo. */
export function DestinationJsonLd({ dest }: { dest: Destination }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristDestination",
    name: dest.name,
    description: dest.description,
    image: dest.image,
    url: `${BASE_URL}/destinacija/${dest.slug}`,
    geo: {
      "@type": "GeoCoordinates",
      latitude: dest.coords.lat,
      longitude: dest.coords.lng,
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: dest.rating,
      reviewCount: 100,
      bestRating: 5,
      worstRating: 1,
    },
    address: {
      "@type": "PostalAddress",
      addressCountry: "SI",
      addressRegion: REGION_LABELS[dest.region] ?? dest.region,
    },
    touristType: dest.bestFor,
    keywords: dest.highlights.join(", "),
  };

  return <JsonLdScript data={jsonLd} />;
}

/** LocalBusiness — za B2B listings (hoteli, restavracije, aktivnosti). */
export function ListingJsonLd({ listing }: { listing: Listing }) {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: listing.name,
    description: listing.description,
    image: listing.images,
    url: `${BASE_URL}/listing/${listing.slug}`,
    address: {
      "@type": "PostalAddress",
      streetAddress: listing.address,
      addressCountry: "SI",
    },
    telephone: listing.phone,
    email: listing.email,
    priceRange: listing.priceRange,
    openingHours: listing.openingHours,
    specialty: listing.specialties,
  };

  if (listing.website) {
    jsonLd.sameAs = listing.website;
  }

  if (listing.rating > 0) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: listing.rating,
      reviewCount: listing.reviewCount || 1,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return <JsonLdScript data={jsonLd} />;
}

/** Product — za izdelke v tržnici. */
export function ProductJsonLd({ product }: { product: Product }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images,
    url: `${BASE_URL}/trznica/${product.slug}`,
    sku: product.id,
    brand: {
      "@type": "Brand",
      name: product.sellerName,
    },
    offers: {
      "@type": "Offer",
      price: product.price,
      priceCurrency: product.currency,
      availability:
        product.stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      url: `${BASE_URL}/trznica/${product.slug}`,
      seller: {
        "@type": "Organization",
        name: product.sellerName,
      },
    },
    aggregateRating:
      product.reviewCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: product.reviewCount,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
  };

  return <JsonLdScript data={jsonLd} />;
}

/** TouristTrip — za izkušnje (experiences). */
export function ExperienceJsonLd({ exp }: { exp: Experience }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: exp.name,
    description: exp.description,
    image: exp.images,
    url: `${BASE_URL}/izkušnje/${exp.slug}`,
    provider: {
      "@type": "LocalBusiness",
      name: exp.providerName,
      telephone: exp.providerPhone,
      email: exp.providerEmail,
      address: {
        "@type": "PostalAddress",
        streetAddress: exp.address,
        addressCountry: "SI",
      },
    },
    offers: {
      "@type": "Offer",
      price: exp.pricePerPerson,
      priceCurrency: exp.currency,
      url: `${BASE_URL}/izkušnje/${exp.slug}`,
    },
    subTrip: [],
    inLanguage: exp.languages,
    touristType: exp.familyFriendly ? "family" : undefined,
    aggregateRating:
      exp.reviewCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: exp.rating,
            reviewCount: exp.reviewCount,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
  };

  return <JsonLdScript data={jsonLd} />;
}

/** WebSite — za homepage, označuje spletno mesto in njegove možnosti iskanja. */
export function WebSiteJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: "Discover Slovenia AI — AI turistična platforma",
    url: BASE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: "sl-SI",
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: BASE_URL,
    },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${BASE_URL}/?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return <JsonLdScript data={jsonLd} />;
}

/** Organization — za platformo (lastnik, kontakt, social). */
export function OrganizationJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    alternateName: "Discover Slovenia AI",
    url: BASE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${BASE_URL}/logo.svg`,
    },
    description: SITE_DESCRIPTION,
    foundingDate: "2024",
    areaServed: {
      "@type": "Country",
      name: "Slovenija",
    },
    sameAs: [
      "https://www.instagram.com/discoverslovenia",
      "https://www.facebook.com/discoverslovenia",
      "https://www.youtube.com/discoverslovenia",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      availableLanguage: ["Slovenščina", "English"],
    },
  };

  return <JsonLdScript data={jsonLd} />;
}

/** BreadcrumbList — za navigacijske drobtine. */
export function BreadcrumbJsonLd({
  items,
}: {
  items: { name: string; url: string }[];
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return <JsonLdScript data={jsonLd} />;
}
