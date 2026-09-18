// ============================================================================
// TRAVEL SUPPLY MAP — DEDUPLIKACIJSKA ARHITEKTURA (F1, 1.49.0)
// ============================================================================
// Isti objekt lahko pride iz več virov (OSM hotel + FSQ hotel + bodoči
// Booking hotel). Dedupe ključ = geohash(~80 m) + normaliziran naslov.
// Združeni pin ohrani NAJBOLJŠI primarni zapis (ocena/cena/bogatost) in
// evidenco alternativnih virov (altSources) — pin nikoli ni podvojen.
//
// Čiste funkcije (brez omrežja) → supply-dedupe.test.ts.
// V F1 je aktiven samo OSM → dedupe deluje znotraj-vir (Overpass vrača
// node+way duplikate) in je ARHITEKTURA pripravljena za čez-vir.
// ============================================================================

import type { ProviderProduct, ProviderSlug } from "./types";

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Geohash kodiranje ( standardni algoritem, dolžina 7 ≈ ±76 m). */
export function geohash(lat: number, lng: number, precision = 7): string {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let hash = "";
  let even = true;
  let bit = 0;
  let ch = 0;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        ch = (ch << 1) | 1;
        lngMin = mid;
      } else {
        ch = ch << 1;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        latMin = mid;
      } else {
        ch = ch << 1;
        latMax = mid;
      }
    }
    even = !even;
    bit++;
    if (bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

/** Normaliziran naslov (čšž → csz, brez ločil, lowercase) — isti vzorec
 *  kot chat-add-place (enkraten vir semantike dedupe). */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Dedupe ključ: geohash7 + normaliziran naslov (brez geo → samo naslov). */
export function dedupeKey(p: ProviderProduct): string {
  if (
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng)
  ) {
    return `${geohash(p.lat, p.lng, 7)}:${normalizeTitle(p.title)}`;
  }
  return `nogeo:${p.provider}:${normalizeTitle(p.title)}`;
}

/** Kvaliteta zapisa (primarni izbor pri združevanju): ocena, recenzije,
 *  cena, slika, opis — bogatejši zapis je boljši primarni predstavnik. */
export function productRichness(p: ProviderProduct): number {
  return (
    (p.rating != null ? p.rating * 10 : 0) +
    (p.reviewCount != null ? Math.min(10, p.reviewCount / 50) : 0) +
    (p.price != null ? 8 : 0) +
    (p.image != null ? 4 : 0) +
    (p.description != null ? 2 : 0) +
    (p.address != null ? 1 : 0) +
    (p.sourceUrl != null ? 1 : 0)
  );
}

export interface DedupeResult {
  products: ProviderProduct[];
  /** Št. odstranjenih podvojenih zapisov (telemetrija/iskrenost). */
  duplicates: number;
}

/**
 * Deduplikacija seznama produktov.
 *  - ENAK providerProductId → vedno duplikat (isti objekt drugačen way).
 *  - Enak dedupeKey (geo+ime) → združitev: primarni ostane bogatejši
 *    zapis; alternativni viri se zapišejo v altSources (izpeljano polje,
 *    ne dela kanonskega modela — ker je izpeljano ob vsakem iskanju).
 */
export function dedupeProducts(products: ProviderProduct[]): DedupeResult {
  const byKey = new Map<string, ProviderProduct>();
  const byId = new Set<string>();
  let duplicates = 0;

  for (const p of products) {
    if (byId.has(p.id)) {
      duplicates++;
      continue;
    }
    byId.add(p.id);

    const key = dedupeKey(p);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...p, altSources: undefined });
      continue;
    }

    // Združitev: bogatejši zapis postane primarni; viri se seštejejo.
    duplicates++;
    const primary =
      productRichness(p) > productRichness(existing) ? p : existing;
    const secondary = primary === p ? existing : p;
    const sources = new Set<string>([
      ...(existing.altSources ?? [existing.provider]),
      ...(p.altSources ?? [p.provider]),
    ]);
    sources.add(secondary.provider);
    byKey.set(key, {
      ...primary,
      altSources: [...sources].filter((s) => s !== primary.provider) as ProviderSlug[],
    });
  }

  return { products: [...byKey.values()], duplicates };
}
