// ============================================================================
// TASK 67 — GO MODE NAVIGACIJSKI HANDOFF (čista plast, 1.67.0)
// ============================================================================
// AGENTS.md §13: Go Mode je execution-focused — „current stop, next stop,
// ETA, status, NAVIGATION HANDOFF, completion". Razdalja/smer (TASK 64) je
// PREMICA — ta plast uporabniku dejansko ODPRE navigacijo do postanka:
//
//  - MOBITEL (pointer: coarse): geo: URI (RFC 5870) → SISTEMSKI izbirnik
//    navigacijskih aplikacij (Google Maps, Waze, Organic Maps, Apple Maps …)
//    — spoštujemo uporabnikovo izbiro aplikacije; platforma NI lastna
//    navigacijska aplikacija (AGENTS.md: no proprietary navigation engine).
//  - DESKTOP / pad: Google Maps Directions URL (uradni Maps URL API,
//    destination = REALNE koordinate postanka iz vira).
//
// ISKRENOST (isti kanon kot go-view §iskrenost / go-weather):
//  - Postanek BREZ geo → handoff PREPROSTO NI (null) — NE izmišljujemo
//    cilja po imenu (iskanje po imenu je netočno; trip-timeline vzorec
//    „ime + Slovenia" bi za Kotor/Tirano našel NAPAČEN kraj).
//  - Web URL vsebuje SAMO validirane številke (0 uporabniškega besedila)
//    → URL injection nemogoč. Label v geo: URI je sanitiziran + encodan.
//  - Handoff je IZRECNO zunanji (label/title to pove) — platforma ne
//    trdi, da vodi po poti; vožnja/peša pot je odgovornost aplikacije,
//    ki jo uporabnik izbere.
//  - ČISTO: 0 omrežja, 0 db, 0 localStorage — testirljivo.
// ============================================================================

import type { TripEntry } from "./trip-view";

// ---------------------------------------------------------------------------
// VALIDACIJA KOORDINAT (isti kanon kot go-weather parse — fail-closed)
// ---------------------------------------------------------------------------

/** Veljavna WGS84 širina/dolžina (končno število znotraj meja)? */
function isValidCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Koordinata v fiksnem 6-mestnem formatu (0 eksponentov, 0 locale presledkov). */
function fixed6(n: number): string {
  return n.toFixed(6);
}

// ---------------------------------------------------------------------------
// GEO URI (RFC 5870) — MOBITEL: sistemski izbirnik aplikacij
// ---------------------------------------------------------------------------

/**
 * Label za geo: q parameter: odstrani oklepaje (so STRUKTURA q formata
 * „lat,lng(Label)") in znake, ki ne sodijo v prikazano ime.
 */
function sanitizeGeoLabel(label: string): string {
  return label.replace(/[()\\<>"]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * `geo:lat,lng?q=lat,lng(Label)` — Android/Google Maps konvencija za geo URI
 * z oznako cilja (parserji, ki q oznake ne razumejo, ignorirajo parameter in
 * odprejo kar točko lat,lng — koordinate ostanejo pravilne).
 *
 * Neveljavna koordinata → null (fail-closed — ne delamo URI iz smeti).
 * Prazna/odstranjena oznaka → brez `?q=` dela (samo `geo:lat,lng`).
 */
export function buildGeoNavUri(
  lat: number,
  lng: number,
  label?: string
): string | null {
  if (!isValidCoord(lat, lng)) return null;
  const base = `geo:${fixed6(lat)},${fixed6(lng)}`;
  const clean = label != null ? sanitizeGeoLabel(label) : "";
  if (clean === "") return base;
  return `${base}?q=${fixed6(lat)},${fixed6(lng)}(${encodeURIComponent(clean)})`;
}

// ---------------------------------------------------------------------------
// WEB URL (Google Maps Directions URL API) — DESKTOP/pad + splošni fallback
// ---------------------------------------------------------------------------

/**
 * `https://www.google.com/maps/dir/?api=1&destination=lat,lng` — uradni
 * Maps URL API (destination je edini obvezen parameter; izhodišče privzeto
 * uporabnikova lokacija). V URL grejo SAMO validirane številke — naslov se
 * NE vstavlja (koordinate iz vira so natančnejše od imena).
 * Neveljavna koordinata → null.
 */
export function buildWebNavUrl(lat: number, lng: number): string | null {
  if (!isValidCoord(lat, lng)) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${fixed6(lat)},${fixed6(lng)}`;
}

// ---------------------------------------------------------------------------
// HANDOFF NADVZOR (en vir resnice za cel Go Mode)
// ---------------------------------------------------------------------------

/** Obe povezavi do zunanjega navigacijskega handoffa. */
export interface GoNavLinks {
  /** geo: URI — odpre izbirnik navigacijskih aplikacij (mobilni). */
  geo: string;
  /** Google Maps Directions URL — splošni (desktop) fallback. */
  web: string;
}

/**
 * Povezave navigacijskega handoffa za postanek. SAMO če ima postanek
 * REALNE koordinate vira — sicer null (iskrena odsotnost, isti kanon kot
 * DistanceChip: razdalja se prav tako ne izmišljuje).
 */
export function goNavLinks(
  entry: Pick<TripEntry, "lat" | "lng" | "title">
): GoNavLinks | null {
  if (entry.lat == null || entry.lng == null) return null;
  const geo = buildGeoNavUri(entry.lat, entry.lng, entry.title);
  const web = buildWebNavUrl(entry.lat, entry.lng);
  if (geo == null || web == null) return null; // fail-closed (paranoično, a dosledno)
  return { geo, web };
}

/**
 * Izbira povezave glede na vrsto kazalca (ČISTO — parameter, ne okolje):
 * coarse (prst/dotik) → geo: URI (izbirnik aplikacij); sicer → web URL.
 * Null v → null ven.
 */
export function pickGoNavHref(
  links: GoNavLinks | null,
  coarsePointer: boolean
): string | null {
  if (links == null) return null;
  return coarsePointer ? links.geo : links.web;
}

/**
 * Ali naprava kaže s prstom (telefon/tablet)? Stranski učinek okolja —
 * kliče se SAMO v interakciji (ob kliku), nikoli med renderom (hidracijsko
 * nevtralno). SSR / brez matchMedia → false (konzervativno: web fallback).
 */
export function isCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// UI OZNAKE (L vzorec — dvojezične, ISKRENE)
// ---------------------------------------------------------------------------

export const GO_NAV_LABELS = {
  navigate: { sl: "Navigiraj", en: "Navigate" },
  /** title/aria pojasnilo: IZRECNO zunanja aplikacija (ne lastna navigacija). */
  external: {
    sl: "Odpre zunanjo navigacijsko aplikacijo (izberi si svojo)",
    en: "Opens an external navigation app (choose your own)",
  },
  navigateAria: {
    sl: (title: string) => `Navigiraj do: ${title}`,
    en: (title: string) => `Navigate to: ${title}`,
  },
} as const;
