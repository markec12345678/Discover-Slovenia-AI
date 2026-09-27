/**
 * W1 (Issue #15 V0, 1.126.0): IT/DE oznake za sezname destinacij.
 *
 * Ročno napisani drobni prevodi kontrolnih oznak (države/regije/interesi/
 * bestFor) za italijanščino in nemščino — isto vlogo kot COUNTRIES_EN /
 * REGIONS_EN / INTERESTS_EN / BEST_FOR_EN v slovenia-data-en.ts, ki pa je
 * vezan na EN. Skupni `withLocaleOverlay` helper služi destinations.tsx in
 * destination-modal.tsx (isti vzorec kot withEnOverlay, generaliziran).
 *
 * Varnost: neznan ključ pade nazaj na izvirnik (identiteta, ne izmišljena
 * oznaka) — isti kanon kot _EN različice.
 */
import type { Destination } from "@/lib/types";
import { getEnDestination } from "./slovenia-data-en";
import { getItDestination } from "./slovenia-data-it";
import { getDeDestination } from "./slovenia-data-de";

// ─── ITALIJANŠČINA ──────────────────────────────────────────────────────────

export const COUNTRIES_IT: Record<string, string> = {
  SI: "Slovenia",
  HR: "Croazia",
  ME: "Montenegro",
  AL: "Albania",
};

export const REGIONS_IT: Record<string, string> = {
  gorenjska: "Alta Carniola",
  primorska: "Litorale sloveno",
  osrednja: "Slovenia centrale",
  kras: "Carso",
  stajerska: "Stiria",
  koroska: "Carinzia",
  prekmurje: "Prekmurje",
  dolenjska: "Bassa Carniola",
  "bela-krajina": "Carniola Bianca",
  // TASK 62: regionalne regije (HR/ME/AL)
  "kontinentalna-hrvaska": "Croazia continentale",
  istra: "Istria",
  kvartner: "Quarnaro",
  lika: "Lika",
  dalmacija: "Dalmazia",
  "boka-kotorska": "Bocche di Cattaro",
  "crnogorsko-primorje": "Costa montenegrina",
  "osrednja-crna-gora": "Montenegro centrale",
  "severna-crna-gora": "Montenegro settentrionale",
  "osrednja-albanija": "Albania centrale",
  "juana-albanija": "Albania meridionale",
};

export const INTERESTS_IT: Record<string, string> = {
  narava: "Natura",
  kultura: "Cultura",
  hrana: "Cibo & vino",
  avantura: "Avventura",
  adrenalin: "Adrenalina",
  romantika: "Romanticismo",
  družina: "Famiglia",
  wellness: "Wellness",
};

export const BEST_FOR_IT: Record<string, string> = {
  narava: "Natura",
  kultura: "Cultura",
  hrana: "Cibo & vino",
  avantura: "Avventura",
  adrenalin: "Adrenalina",
  romantika: "Romanticismo",
  družina: "Famiglia",
  wellness: "Wellness",
  poletje: "Estate",
  mir: "Tranquillità",
  zgodovina: "Storia",
  vino: "Vino",
  pohodništvo: "Escursionismo",
  mesto: "Città",
  fotografija: "Fotografia",
  zdravje: "Salute",
  sprostitev: "Relax",
  smučanje: "Sci",
  festival: "Festival",
  aktivnosti: "Attività",
};

// ─── NEMŠČINA ───────────────────────────────────────────────────────────────

export const COUNTRIES_DE: Record<string, string> = {
  SI: "Slowenien",
  HR: "Kroatien",
  ME: "Montenegro",
  AL: "Albanien",
};

export const REGIONS_DE: Record<string, string> = {
  gorenjska: "Oberkrain",
  primorska: "Küstenland",
  osrednja: "Zentralslowenien",
  kras: "Karst",
  stajerska: "Steiermark",
  koroska: "Kärnten",
  prekmurje: "Prekmurje",
  dolenjska: "Unterkrain",
  "bela-krajina": "Weißkrain",
  // TASK 62: regionalne regije (HR/ME/AL)
  "kontinentalna-hrvaska": "Kontinentalkroatien",
  istra: "Istrien",
  kvartner: "Kvarner",
  lika: "Lika",
  dalmacija: "Dalmatien",
  "boka-kotorska": "Bucht von Kotor",
  "crnogorsko-primorje": "Montenegrinische Küste",
  "osrednja-crna-gora": "Zentralmontenegro",
  "severna-crna-gora": "Nordmontenegro",
  "osrednja-albanija": "Zentralalbanien",
  "juana-albanija": "Südalbanien",
};

export const INTERESTS_DE: Record<string, string> = {
  narava: "Natur",
  kultura: "Kultur",
  hrana: "Essen & Wein",
  avantura: "Abenteuer",
  adrenalin: "Adrenalin",
  romantika: "Romantik",
  družina: "Familie",
  wellness: "Wellness",
};

export const BEST_FOR_DE: Record<string, string> = {
  narava: "Natur",
  kultura: "Kultur",
  hrana: "Essen & Wein",
  avantura: "Abenteuer",
  adrenalin: "Adrenalin",
  romantika: "Romantik",
  družina: "Familie",
  wellness: "Wellness",
  poletje: "Sommer",
  mir: "Ruhe",
  zgodovina: "Geschichte",
  vino: "Wein",
  pohodništvo: "Wandern",
  mesto: "Städtetrip",
  fotografija: "Fotografie",
  zdravje: "Gesundheit",
  sprostitev: "Entspannung",
  smučanje: "Skifahren",
  festival: "Festivals",
  aktivnosti: "Aktivitäten",
};

// ─── Skupni helperji (generalizacija FW4.3-2 EN vzorca na 4 jezike) ────────

/**
 * Overlay destinacije po locale: tekstovna polja (tagline, description,
 * highlights, activities, duration) zamenjana z jeziku primernim virom
 * (slovenia-data-en/-it/-de); id/slug/name/slike/cene ostanejo izvirni.
 * SL (default) in neznan locale → izvirnik. Vrne isti objekt, če overlay
 * manjka (identiteta — P4-8: nikoli mešanja znotraj EN/IT/DE pogleda).
 */
export function withLocaleOverlay(d: Destination, locale: string): Destination {
  const overlay =
    locale === "en"
      ? getEnDestination(d.id)
      : locale === "it"
        ? (getItDestination(d.id) ?? undefined)
        : locale === "de"
          ? (getDeDestination(d.id) ?? undefined)
          : undefined;
  return overlay ? { ...d, ...overlay } : d;
}

/** Državna oznaka po locale (neznana → null → klicatelj pade na SL). */
export function countryLabelFor(value: string, locale: string): string | null {
  if (locale === "it") return COUNTRIES_IT[value] ?? null;
  if (locale === "de") return COUNTRIES_DE[value] ?? null;
  return null; // EN ima svoj COUNTRIES_EN pri klicatelju (FW4.3-2 vzorec)
}

/** Regionalna oznaka po locale (neznana → null → klicatelj pade na SL). */
export function regionLabelFor(value: string, locale: string): string | null {
  if (locale === "it") return REGIONS_IT[value] ?? null;
  if (locale === "de") return REGIONS_DE[value] ?? null;
  return null;
}

/** Oznaka interesa po locale (neznana → null). */
export function interestLabelFor(value: string, locale: string): string | null {
  if (locale === "it") return INTERESTS_IT[value] ?? null;
  if (locale === "de") return INTERESTS_DE[value] ?? null;
  return null;
}

/** bestFor oznaka po locale (neznana → null). */
export function bestForLabelFor(value: string, locale: string): string | null {
  if (locale === "it") return BEST_FOR_IT[value] ?? null;
  if (locale === "de") return BEST_FOR_DE[value] ?? null;
  return null;
}
