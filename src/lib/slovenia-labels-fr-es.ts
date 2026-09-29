/**
 * W12 (smer 2, faza 1 — 1.144.0): FR/ES oznake za sezname destinacij.
 *
 * Ročno napisani drobni prevodi kontrolnih oznak (države/regije/interesi/
 * bestFor) za francoščino in španščino — isto vlogo kot COUNTRIES_EN /
 * REGIONS_EN / INTERESTS_EN / BEST_FOR_EN v slovenia-data-en.ts (EN) in
 * COUNTRIES_IT/DE … v slovenia-labels-it-de.ts (W1). Skupni
 * `withLocaleOverlay` helper (v slovenia-labels-it-de.ts, W12 razširjen)
 * služi destinations.tsx in destination-modal.tsx.
 *
 * Varnost: neznan ključ pade nazaj na izvirnik (identiteta, ne izmišljena
 * oznaka) — isti kanon kot _EN/_IT/_DE različice.
 *
 * Prevod: ročni (avtor W12), turistična poimenovanja po uveljavljeni
 * francoski/španski praksi (Haute-Carniole, Bouches de Kotor, Eslovenia,
 * Bahía de Kotor …).
 */
import type { Destination } from "@/lib/types";
import { getFrDestination } from "./slovenia-data-fr";
import { getEsDestination } from "./slovenia-data-es";

// ─── FRANCOŠČINA ────────────────────────────────────────────────────────────

export const COUNTRIES_FR: Record<string, string> = {
  SI: "Slovénie",
  HR: "Croatie",
  ME: "Monténégro",
  AL: "Albanie",
};

export const REGIONS_FR: Record<string, string> = {
  gorenjska: "Haute-Carniole",
  primorska: "Littoral slovène",
  osrednja: "Slovénie centrale",
  kras: "Karst",
  stajerska: "Styrie",
  koroska: "Carinthie",
  prekmurje: "Prekmurje",
  dolenjska: "Basse-Carniole",
  "bela-krajina": "Carniole-Blanche",
  // TASK 62: regionalne regije (HR/ME/AL)
  "kontinentalna-hrvaska": "Croatie continentale",
  istra: "Istrie",
  kvartner: "Kvarner",
  lika: "Lika",
  dalmacija: "Dalmatie",
  "boka-kotorska": "Bouches de Kotor",
  "crnogorsko-primorje": "Littoral monténégrin",
  "osrednja-crna-gora": "Monténégro central",
  "severna-crna-gora": "Monténégro septentrional",
  "osrednja-albanija": "Albanie centrale",
  "juana-albanija": "Albanie méridionale",
};

export const INTERESTS_FR: Record<string, string> = {
  narava: "Nature",
  kultura: "Culture",
  hrana: "Gastronomie & vin",
  avantura: "Aventure",
  adrenalin: "Adrénaline",
  romantika: "Romantisme",
  družina: "Famille",
  wellness: "Bien-être",
};

export const BEST_FOR_FR: Record<string, string> = {
  narava: "Nature",
  kultura: "Culture",
  hrana: "Gastronomie & vin",
  avantura: "Aventure",
  adrenalin: "Adrénaline",
  romantika: "Romantisme",
  družina: "Famille",
  wellness: "Bien-être",
  poletje: "Été",
  mir: "Quiétude",
  zgodovina: "Histoire",
  vino: "Vin",
  pohodništvo: "Randonnée",
  mesto: "Ville",
  fotografija: "Photographie",
  zdravje: "Santé",
  sprostitev: "Détente",
  smučanje: "Ski",
  festival: "Festivals",
  aktivnosti: "Activités",
};

// ─── ŠPANŠČINA ──────────────────────────────────────────────────────────────

export const COUNTRIES_ES: Record<string, string> = {
  SI: "Eslovenia",
  HR: "Croacia",
  ME: "Montenegro",
  AL: "Albania",
};

export const REGIONS_ES: Record<string, string> = {
  gorenjska: "Alta Carniola",
  primorska: "Litoral esloveno",
  osrednja: "Eslovenia central",
  kras: "Karst",
  stajerska: "Estiria",
  koroska: "Carintia",
  prekmurje: "Prekmurje",
  dolenjska: "Baja Carniola",
  "bela-krajina": "Carniola Blanca",
  // TASK 62: regionalne regije (HR/ME/AL)
  "kontinentalna-hrvaska": "Croacia continental",
  istra: "Istria",
  kvartner: "Kvarner",
  lika: "Lika",
  dalmacija: "Dalmacia",
  "boka-kotorska": "Bahía de Kotor",
  "crnogorsko-primorje": "Litoral montenegrino",
  "osrednja-crna-gora": "Montenegro central",
  "severna-crna-gora": "Montenegro septentrional",
  "osrednja-albanija": "Albania central",
  "juana-albanija": "Albania meridional",
};

export const INTERESTS_ES: Record<string, string> = {
  narava: "Naturaleza",
  kultura: "Cultura",
  hrana: "Gastronomía y vino",
  avantura: "Aventura",
  adrenalin: "Adrenalina",
  romantika: "Romanticismo",
  družina: "Familia",
  wellness: "Bienestar",
};

export const BEST_FOR_ES: Record<string, string> = {
  narava: "Naturaleza",
  kultura: "Cultura",
  hrana: "Gastronomía y vino",
  avantura: "Aventura",
  adrenalin: "Adrenalina",
  romantika: "Romanticismo",
  družina: "Familia",
  wellness: "Bienestar",
  poletje: "Verano",
  mir: "Tranquilidad",
  zgodovina: "Historia",
  vino: "Vino",
  pohodništvo: "Senderismo",
  mesto: "Ciudad",
  fotografija: "Fotografía",
  zdravje: "Salud",
  sprostitev: "Relajación",
  smučanje: "Esquí",
  festival: "Festivales",
  aktivnosti: "Actividades",
};

// ─── FR/ES data overlay getterji (isti kanon kot getItDestination) ──────────

/**
 * FR overlay destinacije (W12 faza 1) — tagline/description/highlights/
 * activities/duration iz slovenia-data-fr.ts; manjkajoč (id ne poznam)
 * → undefined (klicatelj pade na izvirnik — identiteta, P4-8).
 */
export function withFrOverlay(d: Destination): Destination {
  const overlay = getFrDestination(d.id);
  return overlay ? { ...d, ...overlay } : d;
}

/** ES overlay destinacije (W12 faza 1) — isti kanon kot withFrOverlay. */
export function withEsOverlay(d: Destination): Destination {
  const overlay = getEsDestination(d.id);
  return overlay ? { ...d, ...overlay } : d;
}
