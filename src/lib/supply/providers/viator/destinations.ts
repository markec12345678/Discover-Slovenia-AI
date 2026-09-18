// ============================================================================
// TRAVEL SUPPLY MAP — VIATOR: DESTINACIJSKA TAKSONOMIJA (Task 45, 1.50.0)
// ============================================================================
// Pogodba vira: GET /destinations vrne CELA taksonomijo (države/regije/
// mesta), "Destinations should be refreshed weekly" (docs.viator.com).
// Ref iz products[].destinations[].ref razrešimo KRAJEVNO po tem indeksu —
// dokumentacija IZRECNO priporoča hrambo lokalne kopije.
//
// VIEWPORT SEMANTIKA (dokumentirana omejitev, naročnik §9): Viator
// /products/search filtra PO DESTINACIJI (destinationId), NE po bbox.
// Preslikava viewport → poizvedba:
//  1. Katere od NAŠIH kanonskih destinacij ležijo v bbox (naše koordinate
//     so avtoriteta zemljevida).
//  2. 1–3 v pogledu → iskanje PO TEH destinacijah (≤ 3 klicev).
//  3. ≥ 4 v pogledu (širok/državni pogled) → ENO iskanje po državi
//     "Slovenia" (COUNTRY) + KRAJEVNI post-filter pinov na bbox (pin je
//     vedno center PRIMARNE destinacije produkta — geoPrecision
//     destination_center, NIKOLI lažni bbox).
// Pina NIKOLI ne predstavimo kot točen meeting point (naročnik §8).
// ============================================================================

import type { ViatorDestination, ViatorProductSummary } from "./types";
import { isViatorDestination } from "./types";
import type { ViatorClient } from "./client";

/** Naše kanonske destinacije (ime + koordinate) — vhod za ujemanje. */
export interface CanonicalDestInput {
  slug: string;
  name: string;
  lat: number;
  lng: number;
}

/** Ujemanje naše destinacije ↔ Viator destinacija. */
export interface MatchedDestination {
  ourSlug: string;
  ourName: string;
  viatorId: number;
  viatorName: string;
  /** Pin: center Viator destinacije (fallback naše koordinate). */
  center: { lat: number; lng: number };
  type: string;
}

export interface ViatorDestIndex {
  byId: Map<number, ViatorDestination>;
  /** Slovenija (COUNTRY) vozlišče — koren slovenskega poddrevesa. */
  country: ViatorDestination | null;
  /** ID-ji VSEH destinacij pod Slovenijo (katera koli globina). */
  slovenianIds: Set<number>;
  /** Naše kanonske destinacije, ujete v Viator taksonomiji. */
  matched: MatchedDestination[];
}

// ---------------------------------------------------------------------------
// TAKSONOMIJA: 7-dnevni predpomnilnik + single-flight (pogodba: tedensko)
// ---------------------------------------------------------------------------

const TAXONOMY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let taxonomyCache: { index: ViatorDestIndex; at: number } | null = null;
let taxonomyInflight: Promise<ViatorDestIndex> | null = null;

/** Počisti predpomnilnik taksonomije (testi / administracija). */
export function resetViatorDestinations(): void {
  taxonomyCache = null;
  taxonomyInflight = null;
}

/** Taksonomija (cache 7 dni; sočasni klici delijo EN izvedbo). */
export async function getViatorDestIndex(
  client: ViatorClient,
  canonical: CanonicalDestInput[],
  opts: { signal?: AbortSignal } = {}
): Promise<ViatorDestIndex> {
  if (taxonomyCache && Date.now() - taxonomyCache.at < TAXONOMY_TTL_MS) {
    return taxonomyCache.index;
  }
  if (taxonomyInflight) return taxonomyInflight;

  const task = (async () => {
    const raw = await client.getDestinations({ signal: opts.signal });
    const valid = raw.filter(isViatorDestination);
    const index = buildDestIndex(valid, canonical);
    taxonomyCache = { index, at: Date.now() };
    return index;
  })();

  taxonomyInflight = task;
  try {
    return await task;
  } finally {
    taxonomyInflight = null;
  }
}

// ---------------------------------------------------------------------------
// GRADNJA INDEKSA
// ---------------------------------------------------------------------------

/** Ime → normaliziran ključ za ujemanje (brez diakritik, male črke). */
function nameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Prednost tipov pri več istoimenskih destinacijah (mesto > ostalo). */
const TYPE_PRIORITY: Record<string, number> = {
  CITY: 0,
  TOWN: 1,
  VILLAGE: 2,
  AREA: 3,
  DISTRICT: 4,
  NEIGHBORHOOD: 5,
  COUNTY: 6,
  REGION: 7,
  PROVINCE: 8,
  STATE: 9,
  COUNTRY: 10,
};

function typePriority(type: string | undefined): number {
  return TYPE_PRIORITY[type ?? ""] ?? 8;
}

export function buildDestIndex(
  taxonomy: ViatorDestination[],
  canonical: CanonicalDestInput[]
): ViatorDestIndex {
  const byId = new Map<number, ViatorDestination>();
  const byName = new Map<string, ViatorDestination>();
  for (const d of taxonomy) {
    byId.set(d.destinationId, d);
    // Istoimenske: obdrži boljši (manjši) tip — mehanizem istoimenskih
    // destinacij (npr. mesto istoimensko regiji).
    const key = nameKey(d.name);
    const prev = byName.get(key);
    if (!prev || typePriority(d.type) < typePriority(prev.type)) {
      byName.set(key, d);
    }
  }

  const country = byName.get("slovenia") ?? null;

  // Slovensko poddreveso (katera koli globina pod COUNTRY vozliščem).
  const slovenianIds = new Set<number>();
  if (country) {
    const queue: number[] = [country.destinationId];
    const parents = new Map<number, number[]>();
    for (const d of taxonomy) {
      if (d.parentDestinationId != null) {
        const arr = parents.get(d.parentDestinationId) ?? [];
        arr.push(d.destinationId);
        parents.set(d.parentDestinationId, arr);
      }
    }
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (slovenianIds.has(id)) continue;
      slovenianIds.add(id);
      for (const child of parents.get(id) ?? []) queue.push(child);
    }
  }

  // Ujemanje naših kanonskih destinacij (ime → Viator, prednost tipu CITY).
  const matched: MatchedDestination[] = [];
  for (const ours of canonical) {
    const v = byName.get(nameKey(ours.name));
    if (!v) continue;
    const lat = v.center?.latitude;
    const lng = v.center?.longitude;
    const center =
      typeof lat === "number" &&
      typeof lng === "number" &&
      Number.isFinite(lat) &&
      Math.abs(lat) <= 90 &&
      Number.isFinite(lng) &&
      Math.abs(lng) <= 180
        ? { lat, lng }
        : { lat: ours.lat, lng: ours.lng };
    matched.push({
      ourSlug: ours.slug,
      ourName: ours.name,
      viatorId: v.destinationId,
      viatorName: v.name,
      center,
      type: v.type ?? "",
    });
  }

  return { byId, country, slovenianIds, matched };
}

// ---------------------------------------------------------------------------
// VIEWPORT → DESTINACIJE ZA ISKANJE
// ---------------------------------------------------------------------------

export interface ViewportDestinations {
  /** Destinacije za KATEGORIČNA iskanja (≤ 3). */
  cities: MatchedDestination[];
  /** Širok pogled → državno iskanje (1 klic) + krajevni post-filter. */
  country: ViatorDestination | null;
  /** Koliko naših destinacij je v pogledu (diagnostika). */
  inViewCount: number;
}

/** Naše destinacije, katerih center leži v bbox. */
export function canonicalInView(
  matched: MatchedDestination[],
  bbox: [number, number, number, number]
): MatchedDestination[] {
  const [s, w, n, e] = bbox;
  return matched.filter(
    (m) => m.center.lat >= s && m.center.lat <= n && m.center.lng >= w && m.center.lng <= e
  );
}

/**
 * Izbor destinacij za iskanje po viewportu (≤ 3 klicev na poizvedbo):
 *  - ozek pogled (1–3 destinacije v bbox) → te destinacije;
 *  - širok pogled (≥ 4) → država (country) + post-filter pinov.
 *  Red v `cities` sledi redu naših kanonskih destinacij (stabilnost).
 */
export function selectViewportDestinations(
  index: ViatorDestIndex,
  bbox: [number, number, number, number]
): ViewportDestinations {
  const inView = canonicalInView(index.matched, bbox);
  if (inView.length >= 1 && inView.length <= 3) {
    return { cities: inView, country: null, inViewCount: inView.length };
  }
  // Širok pogled (≥ 4) ALI prazen (0 — npr. morje/meja): državno iskanje
  // + krajevni post-filter; brez države v taksonomiji → (dokumentirano)
  // pademo na največ 3 najbližje destinacije našega kanonskega reda.
  if (index.country) {
    return { cities: [], country: index.country, inViewCount: inView.length };
  }
  return { cities: inView.slice(0, 3), country: null, inViewCount: inView.length };
}

// ---------------------------------------------------------------------------
// RAZREŠEVANJE PINA PRODUKTA (primarna destinacija)
// ---------------------------------------------------------------------------

export interface ResolvedPin {
  lat: number;
  lng: number;
  /** Prikazno ime destinacije (naziv vira). */
  name: string;
  /** Ali je bil razrešen fallback (iskana destinacija namesto lastne). */
  fallback: boolean;
}

/**
 * Pin produkta = center NJEGOVE primarne destinacije (destinations[].ref,
 * primary prednost). Dokumentirana semantika: destination_center.
 * Fallback: če ref ni razrešljiv (novo dodana destinacija vira), pin na
 * center ISKANE destinacije (produkt JE iz tega iskanja) — iskreno
 * označeno. Obe poti sta centroida destinacije, NIKOLI točen meeting
 * point.
 */
export function resolveProductPin(
  summary: ViatorProductSummary,
  index: ViatorDestIndex,
  searched: { center: { lat: number; lng: number }; name: string }
): ResolvedPin | null {
  const refs = summary.destinations ?? [];
  const primary =
    refs.find((r) => r.primary === true && r.ref != null) ??
    refs.find((r) => r.ref != null);
  const refId = primary?.ref != null ? Number(primary.ref) : NaN;

  if (Number.isFinite(refId)) {
    const dest = index.byId.get(refId);
    const lat = dest?.center?.latitude;
    const lng = dest?.center?.longitude;
    if (
      dest &&
      typeof lat === "number" &&
      typeof lng === "number" &&
      Number.isFinite(lat) &&
      Math.abs(lat) <= 90 &&
      Number.isFinite(lng) &&
      Math.abs(lng) <= 180
    ) {
      return { lat, lng, name: dest.name, fallback: false };
    }
  }
  // Fallback: center iskane destinacije (dokumentirano).
  return {
    lat: searched.center.lat,
    lng: searched.center.lng,
    name: searched.name,
    fallback: true,
  };
}

/** Ali pin (produktova destinacija) leži v bbox (post-filter). */
export function pinInBbox(pin: ResolvedPin, bbox: [number, number, number, number]): boolean {
  const [s, w, n, e] = bbox;
  return pin.lat >= s && pin.lat <= n && pin.lng >= w && pin.lng <= e;
}
