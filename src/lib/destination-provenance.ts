import type { Destination, DestinationProvenance } from "./types";

// ============================================================================
// ISSUE #4 §18 (VAL 7, 1.99.0) — DESTINATION CONTENT + OFFICIAL DATA
// ============================================================================
//
// Zahteva Issue #4 besedno: "Preveri 38 kuriranih destinacij: source, datum,
// jezik, last update, structured facts, images, links in seasonal
// information. STO ima leta 2026 NiST kot nacionalno podatkovno središče …
// Discover naj ga ne kopira, ampak naj po potrebi uporablja strukturirane
// javne podatke kot source layer z provenance, datumom, obdobjem, enoto in
// virom."
//
// IZKRENOST (raziskava 2026-09-25, 2 spletni iskanji + curl verifikacija):
// 1. NiST kot javen, preverljiv portal NI bil dosegljiv (zadetki: US NIST +
//    splošne statistike SURS/STO). NE izmišljujemo integracije, ki je ni —
//    dokumentirano na /vir-podatkov.
// 2. Preverljivi uradni viri, ki JIH imamo (vsak URL curl-preverjen 200):
//    - 5 uradnih domen destinacij iz F5.5 opening podatkov (urniki),
//    - 4 kanonične STO slovenia.info strani (EN poti — /sl/znamenitosti/*
//      poti iz posnetka so 404!).
// 3. Vse ostalo (29 destinacij) nosi ISKRENO oznako uredniške kuracije —
//    brez izmišljenih zunanjih virov.
//
// ČISTOST (isti standard kot route-intent.ts iz VAL 6): čisti listni modul —
// brez Date.now/fetch/prisma; samo konstante + čiste funkcije.
// ============================================================================

/**
 * Datum zadnje VSEBINSKE spremembe dataseta destinacij — resnica je git
 * (sled sprememb src/lib/slovenia-data.ts; zadnja: 35fcc29 2026-09-20,
 * TASK 62 je dodal 16 regionalnih destinacij).
 *
 * PRETEKLOST (zakaj tu živi ta konstanta): do VAL 7 je stal v
 * stop-insights.ts z vrednostjo "2026-09-13" — 7 dni NEREŠNIČNO, ker je
 * TASK 62 (2026-09-20) spremenil vsebino, konstante pa nihče ni prenesel.
 * Zdaj: enotna točka resnice TU + varovalka (test past), ki konstanto
 * veže na `git log -1 --format=%as -- src/lib/slovenia-data.ts`.
 */
export const DESTINATIONS_DATA_AS_OF = "2026-09-20";

/** Izvozi za obstoječe porabnike (stop-insights / vir-podatkov). */
export { DESTINATIONS_DATA_AS_OF as DESTINATIONS_CONTENT_AS_OF };

/**
 * Jezikovni model dataseta: SL je vir resnice (slovenia-data.ts), EN je
 * prekrivni prevod (slovenia-data-en.ts, ključ = id). Zahteva §18 "jezik"
 * — isto za VSE zapise, zato konstanta in ne per-zapisno polje.
 */
export const DESTINATIONS_CONTENT_LANG = "sl" as const;

/** Oznaka uredniške kuracije (prikaz uporabniku, SL+EN varianti v UI). */
export const INTERNAL_SOURCE_LABEL = "Discover Slovenia — uredniška kuracija";

interface OfficialSourceEntry {
  /** Oznaka vira (domena) — prikaz uporabniku. */
  source: string;
  /** https URL — curl-preverjen živ (datum v verifiedAt). */
  sourceUrl: string;
  /** ISO datum zadnjega preverjanja vira. */
  verifiedAt: string;
}

/**
 * Registr ZUNANJE preverjenih virov (9/38). Vsak entry:
 * - opening 5 (F5.5, verifiedAt 2026-09-14 — datum preverjanja urnikov):
 *   postojnska-jama.eu · kobariski-muzej.si · vintgar.si · pmpo.si ·
 *   visitcelje.eu (domene žive v opening.source od F5.5; URL-ji
 *   liveness ponovno potrjeni 2026-09-25 med VAL 7).
 * - STO 4 (verifiedAt 2026-09-25 — curl 200 danes):
 *   bled/ljubljana/piran/soca → kanonične EN places-to-go strani STO
 *   (SL poti iz posnetka so 404 — ZAKAJ EN: edine žive kanonične strani).
 *
 * DOVOLJENE domene — varovalka testov preverja, da se tu ne prikrade
 * izmišljen URL (allowlist). postojna ima tudi živo STO stran, a je
 * uradna domena destinacije MOČNEJŠI vir (urnik) — zato le en zapis.
 */
const OFFICIAL_SOURCES: Record<string, OfficialSourceEntry> = {
  // ── uradne domene destinacij (opening urniki, F5.5) ─────────────────
  postojna: {
    source: "postojnska-jama.eu",
    sourceUrl: "https://www.postojnska-jama.eu",
    verifiedAt: "2026-09-14",
  },
  kobarid: {
    source: "kobariski-muzej.si",
    sourceUrl: "https://www.kobariski-muzej.si",
    verifiedAt: "2026-09-14",
  },
  vintgar: {
    source: "vintgar.si",
    sourceUrl: "https://www.vintgar.si",
    verifiedAt: "2026-09-14",
  },
  ptuj: {
    source: "pmpo.si",
    sourceUrl: "https://www.pmpo.si",
    verifiedAt: "2026-09-14",
  },
  celje: {
    source: "visitcelje.eu",
    sourceUrl: "https://www.visitcelje.eu",
    verifiedAt: "2026-09-14",
  },
  // ── STO slovenia.info kanonične strani (preverjene 2026-09-25) ──────
  bled: {
    source: "slovenia.info (STO)",
    sourceUrl:
      "https://www.slovenia.info/en/places-to-go/regions/alpine-slovenia/bled",
    verifiedAt: "2026-09-25",
  },
  ljubljana: {
    source: "slovenia.info (STO)",
    sourceUrl:
      "https://www.slovenia.info/en/places-to-go/regions/ljubljana-central-slovenia/ljubljana",
    verifiedAt: "2026-09-25",
  },
  piran: {
    source: "slovenia.info (STO)",
    sourceUrl:
      "https://www.slovenia.info/en/places-to-go/attractions/piran-and-salt-pans",
    verifiedAt: "2026-09-25",
  },
  soca: {
    source: "slovenia.info (STO)",
    sourceUrl:
      "https://www.slovenia.info/en/places-to-go/attractions/soca-valley",
    verifiedAt: "2026-09-25",
  },
};

/** Dovoljene domene v OFFICIAL_SOURCES (varovalka proti izmišljenim URL-jem). */
export const OFFICIAL_SOURCE_DOMAIN_ALLOWLIST = [
  "www.postojnska-jama.eu",
  "www.kobariski-muzej.si",
  "www.vintgar.si",
  "www.pmpo.si",
  "www.visitcelje.eu",
  "www.slovenia.info",
] as const;

/**
 * Provenance destinacije (čista funkcija, klient-varna):
 * - uradni vir, če je id v OFFICIAL_SOURCES (source + URL + datum);
 * - sicer ISKRENA uredniška kuracija z datumom zadnje vsebinske spremembe
 *   dataseta (DESTINATIONS_DATA_AS_OF) — BREZ izmišljenega zunanjega vira.
 */
export function getDestinationProvenance(
  destination: Pick<Destination, "id">
): DestinationProvenance {
  const official = OFFICIAL_SOURCES[destination.id];
  if (official) {
    return {
      kind: "official",
      source: official.source,
      sourceUrl: official.sourceUrl,
      verifiedAt: official.verifiedAt,
    };
  }
  return {
    kind: "internal",
    source: INTERNAL_SOURCE_LABEL,
    verifiedAt: DESTINATIONS_DATA_AS_OF,
  };
}

/** Pripne provenance VSEM destinacijam (API serializacija / površine). */
export function withDestinationProvenance<T extends Destination>(
  destinations: readonly T[]
): (T & { provenance: DestinationProvenance })[] {
  return destinations.map((d) => ({ ...d, provenance: getDestinationProvenance(d) }));
}

export interface ProvenanceSummary {
  /** Skupno število destinacij v datasetu. */
  total: number;
  /** Število z zunanjim preverjenim virom. */
  official: number;
  /** Število z uredniško kuracijo (iskrena oznaka). */
  internal: number;
  /** Datum zadnje vsebinske spremembe dataseta (ISO). */
  asOf: string;
  /** Jezik vira resnice ("sl"; EN je prekrivni prevod). */
  contentLang: "sl";
  /** IDs z uradnim virom (za /vir-podatkov razpredelnico). */
  officialIds: string[];
}

/** Povzetek za /vir-podatkov (§18 sekcija) in API metapodatke. */
export function provenanceSummary(
  destinations: readonly Destination[]
): ProvenanceSummary {
  const officialIds = destinations
    .filter((d) => OFFICIAL_SOURCES[d.id] !== undefined)
    .map((d) => d.id);
  return {
    total: destinations.length,
    official: officialIds.length,
    internal: destinations.length - officialIds.length,
    asOf: DESTINATIONS_DATA_AS_OF,
    contentLang: DESTINATIONS_CONTENT_LANG,
    officialIds,
  };
}


/** Vrstica uradnega vira za tabelo na /vir-podatkov (sourceUrl OBVEZEN). */
export interface OfficialSourceRow {
  id: string;
  source: string;
  sourceUrl: string;
  verifiedAt: string;
}

/** Vsi uradni viri kot vrstice (tipovno varno — sourceUrl je string). */
export function officialSourceRows(): OfficialSourceRow[] {
  return Object.entries(OFFICIAL_SOURCES).map(([id, entry]) => ({
    id,
    source: entry.source,
    sourceUrl: entry.sourceUrl,
    verifiedAt: entry.verifiedAt,
  }));
}
