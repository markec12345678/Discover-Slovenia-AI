// TASK 85 — geo koordinate na listing formah (owner + admin portal).
//
// Vzor: TASK 82 (planner-field-validation) — ČISTE funkcije brez Reacta,
// da jih forma (inline + submit validacija) in testi delita. Fail-closed
// filozofija lastne tržnice (TASK 84): neveljavna koordinata NIKOLI ne
// pride v DB — adapter sicer lastno zavrača |lat| > 90 / |lng| > 180
// (pin se ne bi prikazal), forma pa partnerja ustavi že ob vnosu.
//
// Trda vrata (blokirajo submit):
//  - obe koordinati ALI nobena (polovičen vnos = napaka)
//  - lat ∈ [-90, 90], lng ∈ [-180, 180] (enake meje kot own adapter)
// Mehka vrata (rumeni hint, NE blokira):
//  - točka zunaj kanonskega SI bbox-a (45.4–46.9 N, 13.3–16.6 E) —
//    zajema tudi robne dele IT/AT/HU; ulovi tipično ZAMENO lat↔lng
//    (npr. 14.09, 46.36 → Romunija) ali pomišljaj v decimalkah.

import { SI_BBOX } from "@/lib/slovenia-bbox";

export type GeoFieldError =
  | "both_required" // samo ena izmed obeh koordinat izpolnjena
  | "lat_invalid" // ni število ali |lat| > 90
  | "lng_invalid" // ni število ali |lng| > 180
  | null;

export interface ParsedGeoInput {
  /** Veljavna zemljepisna širina ali null (prazno/izbrisano). */
  lat: number | null;
  /** Veljavna zemljepisna dolžina ali null (prazno/izbrisano). */
  lng: number | null;
  /** Trda napaka, ki BLOKIRA submit (mehki SI-bbox hint je ločen). */
  error: GeoFieldError;
}

/**
 * Surovo besedilno polje forme prečisti v število (null = prazno).
 * Dovoli vejico kot decimalno ločilo (46,3625 → 46.3625) — pogosta
 * slovenska tipkovnica; ločilo preskoči izključno kadar je edino.
 */
export function parseCoordinate(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "" || trimmed === "." || trimmed === "-") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Trda validacija lat (enaka meja kot own adapter fail-closed filter). */
export function isLatValid(lat: number): boolean {
  return Number.isFinite(lat) && Math.abs(lat) <= 90;
}

/** Trda validacija lng (enaka meja kot own adapter fail-closed filter). */
export function isLngValid(lng: number): boolean {
  return Number.isFinite(lng) && Math.abs(lng) <= 180;
}

/**
 * Ali točka leži v kanonskem SI bbox-u (isti pravokotnik kot FSQ ingest,
 * 45.4–46.9 N / 13.3–16.6 E). Uporaba: mehki hint na formi — opozori na
 * morebitno zamenjavo koordinat, NE blokira shranjevanja (veljavni
 * robni kraji IT/AT/HU ostanejo možni).
 */
export function isWithinSloveniaBbox(lat: number, lng: number): boolean {
  return (
    lat >= SI_BBOX.latMin &&
    lat <= SI_BBOX.latMax &&
    lng >= SI_BBOX.lngMin &&
    lng <= SI_BBOX.lngMax
  );
}

/**
 * Centralni parser para koordinatnih polj (owner + admin forma).
 * VEDNO pokliči pred sestavo payloada; ob error != null forma
 * submit zavrne in pokaže inline sporočilo.
 *
 * Semantika (ločeno prazno ↔ neveljavno, da sporočila ne zavajajo):
 *  - obe PRAZNI  → null/null, error null (brez geo)
 *  - ena prazna  → "both_required" (pin zahteva obe)
 *  - neštevilo / meja presežena → "lat_invalid" / "lng_invalid"
 */
export function parseGeoInput(latRaw: string, lngRaw: string): ParsedGeoInput {
  const latText = latRaw.trim();
  const lngText = lngRaw.trim();

  if (latText === "" && lngText === "") {
    return { lat: null, lng: null, error: null };
  }
  if (latText === "" || lngText === "") {
    return { lat: null, lng: null, error: "both_required" };
  }

  const lat = parseCoordinate(latText);
  const lng = parseCoordinate(lngText);
  if (lat === null || !isLatValid(lat)) {
    return { lat: null, lng: null, error: "lat_invalid" };
  }
  if (lng === null || !isLngValid(lng)) {
    return { lat: null, lng: null, error: "lng_invalid" };
  }

  return { lat, lng, error: null };
}

/**
 * Slovenska človeško berljiva sporočila trdih napak — ena sama resnica
 * za owner in admin formo (source-contract test ju preverja).
 */
export const GEO_ERROR_MESSAGES: Record<Exclude<GeoFieldError, null>, string> = {
  both_required:
    "Vnesite obe koordinati (geo širino in geo dolžino) ali obe izpraznite.",
  lat_invalid:
    "Geo širina mora biti število med -90 in 90 (stopinje N/S).",
  lng_invalid:
    "Geo dolžina mora biti število med -180 in 180 (stopinje E/W).",
};

/**
 * Rumeno (mehko) opozorilo, kadar sta koordinati veljavni, a točka leži
 * zunaj kanonskega SI bbox-a — najpogostejši vzrok je zamenjava lat↔lng.
 */
export const GEO_SI_HINT =
  "Točka leži zunaj območja Slovenije (približno 45.4–46.9 N, 13.3–16.6 E). " +
  "Preverite, ali nista koordinati zamenjani.";
