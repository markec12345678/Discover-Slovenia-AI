// ADRIA-1 — tipi za jadranske (cross-border) vodnike.
// Vodniki so čisto statični (brez DB) in se izrisujejo na /vodici/[slug].

export interface AdriaGuideStop {
  name: string;
  country: string; // "SI" | "HR" | "BA" | "ME" | "AL"
  nights: number;
  highlight: string;
}

export interface AdriaGuideListItem {
  title: string;
  text: string;
}

export interface AdriaGuideSection {
  heading: string;
  body: string[]; // 2–3 odstavka
  list?: AdriaGuideListItem[]; // neobvezna kartična dopolnitev
}

export interface AdriaGuidePracticalItem {
  title: string;
  text: string;
}

export interface AdriaGuideFaq {
  question: string;
  answer: string;
}

export interface AdriaGuide {
  slug: string;
  title: string; // H1 na strani
  metaTitle: string; // ≤ 60 znakov
  description: string; // ≤ 155 znakov (meta description)
  excerpt: string; // krajši uvod za kartico na /vodici
  route: string; // npr. "Ljubljana → Zagreb → Split → Ljubljana"
  countries: string[]; // krstice držav na poti
  days: number;
  km: number;
  heroImage: string; // "/adria/{slug}.png" (izpolni ADRIA-1e)
  heroAlt: string;
  author: string; // "Tanja Novak" | "Marko Kovač"
  date: string; // ISO datum objave
  readTime: number; // minute
  stops: AdriaGuideStop[]; // 4–8 postaj; vsota nights = days - 1 (prva postaja 0)
  sections: AdriaGuideSection[]; // 4–6 vsebinskih sekcij
  practical: AdriaGuidePracticalItem[]; // 5–7 praktičnih kartic
  faqs: AdriaGuideFaq[]; // 5–7 FAQ (JSON-LD)
  relatedSlugs: string[]; // 2–4 povezani adria vodniki (iz ADRIA_SLUGS)
  relatedSloveniaIds: string[]; // 2–4 veljavni ID-ji slovenskih destinacij
}

// Vsi slugi v valu ADRIA-1 (fiksni vrstni red po pomembnosti).
// SLO-LOOP-1 (2026): +4 domači krožni vodniki po Sloveniji (ist format,
// ista infrastruktura /vodici/[slug]; countries = ["SI"]).
// ADRIA-1 (10) + SLO-LOOP-1 (4) + SLO-WINTER-1 (4) + SLO-WINTER-2 (4) = 22.
// SLO-WINTER-2 (2026): +4 zimski vodniki (božični Bohinj, silvestrovanje,
// smučanje v januarju, zimske počitnice z otroki) — isti format.
export const ADRIA_SLUGS = [
  "ljubljana-dubrovnik-road-trip",
  "slovenija-hrvaska-10-dni",
  "bled-plitvice-split",
  "istria-vikend-iz-slovenije",
  "hrvaska-obala-prakticni-vodnik",
  "najem-avta-cross-border",
  "kotor-crna-gora-iz-slovenije",
  "albanija-z-avtom-iz-slovenije",
  "sarajevo-mostar-iz-slovenije",
  "hrvaski-otoki-iz-slovenije",
  "slovenija-v-7-dneh",
  "slovenija-v-10-dneh",
  "slovenija-vikend",
  "slovenija-z-otroki",
  "slovenija-pozimi",
  "bozicni-vikend-ljubljana",
  "smuci-vikend-iz-ljubljane",
  "zima-v-termah",
  "bozicni-bohinj",
  "silvestrovanje-v-sloveniji",
  "smucanje-v-januarju",
  "zimske-pocitnice-z-otroki",
] as const;

export type AdriaSlug = (typeof ADRIA_SLUGS)[number];
