import { defineRouting } from "next-intl/routing";

/**
 * Next-intl routing konfiguracija.
 *
 * FW4.3-2 (EN Phase 2): javno sta zdaj slovenščina (default, brez prefix-a)
 * IN angleščina (`/en` prefix) — a LE za poti na EN whitelisti spodaj
 * (jedro lijaka: domov, načrtuj, destinacije s programatskimi podstranmi,
 * info/E-E-A-T strani). Vse ostale poti (ADRIA vodniki, blog, dogodki,
 * tržnica, admin/owner/auth …) ostanejo izključno slovenske — proxy
 * zahteve `/en/<nedovoljena-pot>` trajno (308) preusmeri na slovensko pot
 * (P4-8: nikoli mešanja jezikov, nikoli 404).
 *
 * Zgodovina (P4-8, Phase 1): prej so bile javno dostopne delno prevedene
 * strani (/en, /de, /it — prevedena navigacija + noga, hardcoded slovenska
 * vsebina). /de in /it ostajata legacy (308 na slovensko pot) dokler ne
 * dobita celovitih prevodov.
 *
 * `localePrefix: "as-needed"`: default locale ("sl") NIMA prefix-a (URL je
 * `/`); "en" ga ima (`/en/…`).
 */
export const routing = defineRouting({
  locales: ["sl", "en"],
  defaultLocale: "sl",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];

// ============================================================================
// EN WHITELISTA (FW4.3-2) — edini vir resnice o tem, kje angleščina ŽIVI.
// Uporabniki: src/proxy.ts (308 guard), language-switcher (vidnost),
// hreflangForPath (alternati), sitemap-urls.ts (EN URL-ji), strani sami
// (skrivanje DB sekcij na EN).
// ============================================================================

/** Destinacijske pod-poti, ki so EN-različice (×22 destinacij). */
const EN_DESTINATION_SUBROUTES = [
  /^\/destinacija\/[^/]+\/things-to-do$/,
  /^\/destinacija\/[^/]+\/itinerary\/[^/]+$/,
  /^\/destinacija\/[^/]+\/best-time-to-visit\/[^/]+$/,
  /^\/destinacija\/[^/]+\/guide\/[^/]+$/,
];

/**
 * ADRIA-EN: jadranski vodniki — seznam + 10 detail strani (EN različice
 * obstajajo kot full prevodi v src/lib/adria-guides-en; isti slugi).
 */
const EN_ADRIA_ROUTES = [/^\/vodici\/[a-z0-9-]+$/];

/** Statične poti z EN različico (jedro lijaka + info/E-E-A-T strani). */
const EN_STATIC_ROUTES = new Set([
  "/",
  "/nacrtuj",
  "/destinacije",
  "/vodici",
  "/o-strani",
  "/kontakt",
  "/pogoji-uporabe",
  "/politika-zasebnosti",
  "/vir-podatkov",
  "/zaupanje-in-varnost",
]);

/**
 * Ali ima ta POT (brez locale prefix-a!) angleško različico.
 * Uporablja se na REWRITTEN poti (kar vrne usePathname() / notranja pot
 * rendera), NIKAKOR ne na URL-ju z `/en` prefix-om.
 */
export function isEnRoute(pathname: string): boolean {
  if (EN_STATIC_ROUTES.has(pathname)) return true;
  if (EN_ADRIA_ROUTES.some((re) => re.test(pathname))) return true;
  return EN_DESTINATION_SUBROUTES.some((re) => re.test(pathname));
}

/** Locale prefix za URL-je: "" za default ("sl"), "/en" za angleščino. */
export function localePrefix(locale: string): string {
  return locale === routing.defaultLocale ? "" : `/${locale}`;
}
