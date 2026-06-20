// SEO helperji za I Feel Slovenia platformo.
// Generirajo Next.js Metadata za različne entitete (destinacije, izdelki, izkušnje, listings).

import type { Metadata } from "next";

// BASE_URL naj bo brez zaključne poševnice.
export const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
  "https://ifeelslovenia.si";

export const SITE_NAME = "I Feel Slovenia";
export const SITE_TAGLINE = "AI načrtovalec potovanj";
export const SITE_DESCRIPTION =
  "Odkrijte Slovenijo z AI-poganjanim načrtovalcem potovanj. 22 najlepših destinacij od Bleda do Pirana, z interaktivnim zemljevidom, vremenom in direktnimi rezervacijami.";

// Privzeti OG/Twitter thumbnail. Uporablja obstoječo logotip SVG, ki ga podpira večina socialnih omrežij.
const DEFAULT_OG_IMAGE = "/logo.svg";

/** Metadata za posamezno destinacijo. */
export function destinationMetadata(dest: {
  name: string;
  tagline: string;
  description: string;
  image: string;
  slug: string;
}): Metadata {
  const title = `${dest.name} — ${dest.tagline} | ${SITE_NAME}`;
  const description = dest.description.substring(0, 160);
  const url = `${BASE_URL}/destinacija/${dest.slug}`;

  return {
    title,
    description,
    keywords: [dest.name, "Slovenija", "potovanje", "turizem", dest.tagline],
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      images: [{ url: dest.image, width: 1200, height: 800, alt: dest.name }],
      type: "website",
      locale: "sl_SI",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [dest.image],
    },
    alternates: {
      canonical: url,
    },
  };
}

/** Metadata za izdelek v tržnici. */
export function productMetadata(product: {
  name: string;
  description: string;
  images: string[];
  slug: string;
  price?: number;
  currency?: string;
}): Metadata {
  const title = `${product.name} | ${SITE_NAME} Tržnica`;
  const description = product.description.substring(0, 160);
  const url = `${BASE_URL}/trznica/${product.slug}`;
  const image = product.images?.[0] ?? DEFAULT_OG_IMAGE;

  return {
    title,
    description,
    keywords: [product.name, "Slovenija", "tržnica", "lokalni izdelki", "darila"],
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      images: [
        {
          url: image,
          width: 1200,
          height: 800,
          alt: product.name,
        },
      ],
      type: "website",
      locale: "sl_SI",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    alternates: {
      canonical: url,
    },
  };
}

/** Metadata za izkušnjo (experience). */
export function experienceMetadata(exp: {
  name: string;
  description: string;
  images: string[];
  slug: string;
}): Metadata {
  const title = `${exp.name} | ${SITE_NAME} Izkušnje`;
  const description = exp.description.substring(0, 160);
  const url = `${BASE_URL}/izkušnje/${exp.slug}`;
  const image = exp.images?.[0] ?? DEFAULT_OG_IMAGE;

  return {
    title,
    description,
    keywords: [exp.name, "Slovenija", "izkušnje", "aktivnosti", "doživetja"],
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      images: [
        {
          url: image,
          width: 1200,
          height: 800,
          alt: exp.name,
        },
      ],
      type: "website",
      locale: "sl_SI",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    alternates: {
      canonical: url,
    },
  };
}

/** Metadata za B2B listing (hotel/restavracija/aktivnost). */
export function listingMetadata(listing: {
  name: string;
  description: string;
  images: string[];
  slug: string;
  destinationName?: string | null;
}): Metadata {
  const title = `${listing.name} | ${SITE_NAME}`;
  const description = listing.description.substring(0, 160);
  const url = `${BASE_URL}/listing/${listing.slug}`;
  const image = listing.images?.[0] ?? DEFAULT_OG_IMAGE;
  const keywords = [
    listing.name,
    "Slovenija",
    "hotel",
    "restavracija",
    "aktivnosti",
  ];
  if (listing.destinationName) keywords.push(listing.destinationName);

  return {
    title,
    description,
    keywords,
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      images: [
        {
          url: image,
          width: 1200,
          height: 800,
          alt: listing.name,
        },
      ],
      type: "website",
      locale: "sl_SI",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    alternates: {
      canonical: url,
    },
  };
}

/** Glavni (globalni) metadata za homepage — uporablja se v layout.tsx. */
export const siteMetadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "Slovenija",
    "Bled",
    "Piran",
    "Ljubljana",
    "Triglav",
    "potovanje",
    "itinerer",
    "načrtovanje potovanj",
    "AI načrtovalec",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  applicationName: SITE_NAME,
  alternates: {
    canonical: BASE_URL,
  },
  openGraph: {
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: BASE_URL,
    siteName: SITE_NAME,
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: SITE_NAME,
      },
    ],
    type: "website",
    locale: "sl_SI",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192" }],
  },
};
