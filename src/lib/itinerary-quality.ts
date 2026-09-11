import { DESTINATIONS } from "@/lib/slovenia-data";
import type {
  Budget,
  Itinerary,
  ItineraryQuality,
  PlannerInput,
  TempoLabel,
} from "@/lib/types";

// ============================================================================
// ITINERARY QUALITY — deterministične strukturne metrike poti (FW4.1)
// ============================================================================
//
// NAČELO: metrike so IZRAČUNANE, ne "ocenjene". Vožnja iz realnih koordinat
// (haversine), strošek iz estimated_cost lokacij, tempo iz strukture dni,
// narava iz tipov destinacij, hrana iz interesov + omemb v notes.
// Ista čista funkcija teče na serverju (ob generiranju) in po potrebi na
// clientu (stari shranjeni načrti brez quality polja) — enak rezultat.
//
// AI prispeva SAMO `rationale` ("Zakaj ta pot?") — utemeljitev, ne številke.
// ============================================================================

/** Tipi destinacij, ki štejejo kot "narava" za natureScore. */
const NATURE_TYPES = new Set([
  "lake",
  "mountain",
  "gorge",
  "cave",
  "river",
  "coast",
]);

/** Interesi potnika, ki dvignejo foodScore. */
const FOOD_INTEREST_PATTERNS = [
  "hrana",
  "vino",
  "kulin",
  "gastro",
  "food",
  "wine",
];

/** Ključne besede v notes/recommendations, ki nakazujejo kulinarične vsebine. */
const FOOD_NOTE_PATTERNS = [
  "kosilo",
  "večerja",
  "zajtrk",
  "restavrac",
  "gostiln",
  "vinotek",
  "vino",
  "kavarn",
  "degust",
  "sir",
  "brbonč",
];

/** Cestni faktor — dejanske ceste so daljše od ravne črte (dolina/ prelaz). */
const ROAD_FACTOR = 1.3;
/** Povprečna hitrost (km/h) vključno z mestnimi/počasnimi odseki. */
const AVG_SPEED_KMH = 55;
/** Zgornja meja dolžine rationale (znaki) — 1–2 povedi. */
const RATIONALE_MAX_LEN = 240;

/** Haversine razdalja med dvema točkama v km. */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Skupni čas vožnje (minute): seštevek razdalj med VSA zaporednima
 * lokacijama na poti (tudi prek meje dni — tam pač pelješ do naslednje
 * izhodiščne točke), × cestni faktor ÷ povprečna hitrost.
 */
function computeDrivingMinutes(days: Itinerary["days"]): number {
  const coords = days.flatMap((d) =>
    (d.locations ?? [])
      .map((l) => DESTINATIONS.find((x) => x.id === l.destination_id)?.coords)
      .filter((c): c is { lat: number; lng: number } => !!c)
  );
  if (coords.length < 2) return 0;

  let km = 0;
  for (let i = 1; i < coords.length; i++) {
    km += haversineKm(
      coords[i - 1].lat,
      coords[i - 1].lng,
      coords[i].lat,
      coords[i].lng
    );
  }
  return Math.round(((km * ROAD_FACTOR) / AVG_SPEED_KMH) * 60);
}

/** Seštevek stroškov vseh lokacij (EUR, defenzivno — neveljavne vrednosti → 0). */
function computeEstimatedCost(days: Itinerary["days"]): number {
  return days.reduce(
    (sum, d) =>
      sum +
      (d.locations ?? []).reduce(
        (s, l) => s + (Number.isFinite(l.estimated_cost) ? l.estimated_cost : 0),
        0
      ),
    0
  );
}

/** €/€€/€€€ glede na strošek na osebo na dan (slovenske realnosti). */
function computeBudgetTier(
  estimatedCost: number,
  groupSize: number,
  days: number
): Budget {
  const perPersonPerDay = estimatedCost / Math.max(1, groupSize) / Math.max(1, days);
  if (perPersonPerDay < 80) return "€";
  if (perPersonPerDay < 160) return "€€";
  return "€€€";
}

/** Tempo: povprečno število lokacij na dan. */
function computeTempo(days: Itinerary["days"]): TempoLabel {
  const total = days.reduce((n, d) => n + (d.locations?.length ?? 0), 0);
  if (days.length === 0) return "Miren";
  const avg = total / days.length;
  if (avg <= 2) return "Miren";
  if (avg <= 3) return "Umirjen";
  return "Poln";
}

/** 1–5 glede na delež naravnih destinacij (unikatni ID-ji, brez dvojnih štetij). */
function computeNatureScore(days: Itinerary["days"]): 1 | 2 | 3 | 4 | 5 {
  const ids = new Set<string>();
  for (const d of days) {
    for (const l of d.locations ?? []) {
      if (typeof l.destination_id === "string") ids.add(l.destination_id);
    }
  }
  if (ids.size === 0) return 1;
  let nature = 0;
  for (const id of ids) {
    const dest = DESTINATIONS.find((x) => x.id === id);
    if (dest && NATURE_TYPES.has(dest.type)) nature++;
  }
  const share = nature / ids.size;
  if (share >= 0.75) return 5;
  if (share >= 0.5) return 4;
  if (share >= 0.25) return 3;
  if (share > 0) return 2;
  return 1;
}

/** 1–5: interesi potnika (baza) + kulinarične omembe v notes/recommendations. */
function computeFoodScore(
  input: Pick<PlannerInput, "interests">,
  itinerary: Itinerary
): 1 | 2 | 3 | 4 | 5 {
  const haystack = [
    ...itinerary.recommendations,
    ...itinerary.days.flatMap((d) => (d.locations ?? []).map((l) => l.notes)),
  ]
    .join(" ")
    .toLowerCase();

  const hasFoodInterest = input.interests.some((i) =>
    FOOD_INTEREST_PATTERNS.some((p) => i.toLowerCase().includes(p))
  );
  const hasFoodMention = FOOD_NOTE_PATTERNS.some((p) => haystack.includes(p));

  if (hasFoodInterest && hasFoodMention) return 5;
  if (hasFoodInterest) return 4;
  if (hasFoodMention) return 3;
  return 1;
}

/**
 * Glavna čista funkcija — strukturne metrike itinererja.
 * Deterministična, brez stranskih učinkov, uporabna na serverju in clientu.
 */
export function computeItineraryQuality(
  itinerary: Itinerary,
  input: PlannerInput
): ItineraryQuality {
  const days = Array.isArray(itinerary.days) ? itinerary.days : [];
  const groupSize =
    Number.isFinite(input.groupSize) && input.groupSize > 0
      ? input.groupSize
      : 1;
  const estimatedCost = computeEstimatedCost(days);

  return {
    drivingMinutes: computeDrivingMinutes(days),
    estimatedCost,
    budgetTier: computeBudgetTier(estimatedCost, groupSize, days.length),
    tempo: computeTempo(days),
    natureScore: computeNatureScore(days),
    foodScore: computeFoodScore(
      { interests: Array.isArray(input.interests) ? input.interests : [] },
      itinerary
    ),
    days: days.length,
    groupSize,
  };
}

/**
 * Sanitizacija AI rationale: samo čist string razumne dolžine.
 * Vrne null, če AI ni vrnil uporabne utemeljitve (→ deterministični fallback).
 */
export function sanitizeAiRationale(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Odstrani kontrolne znake, obreže presledke
  const cleaned = raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (cleaned.length < 20) return null; // prekratko → ni smiselna utemeljitev
  if (cleaned.length <= RATIONALE_MAX_LEN) return cleaned;
  // Obreži na meji besede
  const cut = cleaned.slice(0, RATIONALE_MAX_LEN);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

/**
 * Deterministična utemeljitev, kadar AI ne prispeva svoje.
 * Sestavljena iz vnosnih želja + strukturnih dejstev poti — brez izmišljenih
 * trditev.
 */
export function buildFallbackRationale(
  input: PlannerInput,
  quality: ItineraryQuality
): string {
  const interests =
    input.interests.length > 0
      ? `z željami: ${input.interests.slice(0, 3).join(", ")}`
      : "glede na splošne želje";
  const driving =
    quality.drivingMinutes > 0
      ? `skupna vožnja ~${formatDrivingMinutes(quality.drivingMinutes)}`
      : "destinacije so v neposredni bližini";
  return `Pot je sestavljena za ${input.days}-dnevno potovanje ${interests}. Destinacije so izbrane po ujemanju s interesi, sezonski ustreznosti in geografski bližini (${driving}).`;
}

/** "1h 35 min" / "45 min" / "—" (0 min → ni vožnje med znanimi točkami). */
export function formatDrivingMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
