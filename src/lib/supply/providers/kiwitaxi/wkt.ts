// ============================================================================
// TRAVEL SUPPLY MAP — KIWITAXI: VARNI WKT PARSER (Task 43, 1.49.0)
// ============================================================================
// Vir: KiwiTaxi places.csv → place_polygon = WKT POLYGON z LNG-FIRST
// koordinatami (dokumentacija: „geozone (as a polygon)"; živo preverjeno:
// POLYGON((13.9988991961199 46.32848772213071, …)) — svetovno 21325
// poligonov, VSI tipa POLYGON).
//
// NAMEN (naročnikova zahteva §4): WKT → geometry → representative point
// (centroid) + bbox → ProviderProduct. Route centroid NI lokacija prevzema
// — pin je VEDNO centroid PREVZEMNEGA območja, geoPrecision „city".
//
// VARNOST (§16): raw CSV je zunanji vhod:
//  - stroga tokenizacija (številke, vejice, oklepaji, presledki — NI eval);
//  - NaN/Infinity/nenumerični znaki → NULL (kraj ostane brez geo);
//  |lat| ≤ 90, |lng| ≤ 180 (WKT je lng-first — preverimo OBE);
//  - kapika točk (MAX_POLYGON_POINTS) proti oversized zapisom;
//  - kapika skupne dolžine WKT niza;
//  - samo POLYGON (MULTI*/POINT/GeometryCollection zavrnemo — v viru jih
//    ni; odklon je iskren, ne napaka).
//
// Čista funkcija brez @/ uvozov (uporabljajo jo buni skripta IN Next pot).
// ============================================================================

/** Kapiki (obramba pred oversized/malignimi zapisi). */
export const MAX_WKT_LENGTH = 100_000;
export const MAX_POLYGON_POINTS = 2_000;

export interface WktPoint {
  lat: number;
  lng: number;
}

export interface WktGeometry {
  /** [s, w, n, e] */
  bbox: [number, number, number, number];
  /** Enostavni centroid (aritmetična sredina točk zunanjega obroba —
   *  dovolj natančen za „representative point" območja na ravni mesta). */
  centroid: WktPoint;
  pointCount: number;
}

/** Ali niz izgleda kot WKT POLYGON (hitra predpreverba pred parsiranjem). */
export function isWktPolygon(s: string): boolean {
  return /^POLYGON\s*\(\(/i.test(s.trim());
}

/**
 * Parsira WKT POLYGON v bbox + centroid. Vrača NULL pri:
 * ne-POLYGON geometriji, malformed sintaksi, neveljavnih/neskončnih
 * koordinatah, izven meja, prevelikem številu točk ali dolžini.
 *
 * Podpira zunanji obrob + notranje obrobe (luke); centroid računa iz
 * ZUNANJEGA obroba (notranje so izključitve znotraj območja).
 */
export function parseWktPolygon(wkt: string): WktGeometry | null {
  if (!wkt) return null;
  const input = wkt.trim();
  if (input.length === 0 || input.length > MAX_WKT_LENGTH) return null;

  // Samo POLYGON((…)) — zavrnemo druge tipe (v viru ne obstajajo).
  const m = input.match(/^POLYGON\s*\((.*)\)$/i);
  if (!m) return null;

  const body = m[1];
  if (!body.startsWith("(")) return null;

  // Split na obrobe: POLYGON((obrob1),(obrob2),…)
  const rings: string[][] = [];
  let depth = 0;
  let current = "";
  let inRing = false;
  for (const ch of body) {
    if (ch === "(") {
      depth++;
      if (depth === 1) {
        inRing = true;
        current = "";
        continue;
      }
    }
    if (ch === ")") {
      if (depth === 1 && inRing) {
        rings.push(current.split(",").map((p) => p.trim()).filter((p) => p.length > 0));
        inRing = false;
        depth--;
        continue;
      }
      depth--;
    }
    if (inRing) current += ch;
  }
  if (depth !== 0 || rings.length === 0) return null;

  // Zunanji obrob = prvi. Točke: „lng lat" (WKT je lng-first!).
  const outerAll = rings[0];
  if (outerAll.length < 3 || outerAll.length > MAX_POLYGON_POINTS) return null;

  // Zaklepna točka (ponovitev prve) ne sme biasirati centroida — WKT
  // obrobi so VEDNO zaprti, povprečje pa bi prvo točko štelo dvakrat.
  const first = outerAll[0];
  const last = outerAll[outerAll.length - 1];
  const closes =
    first === last ||
    (Number(first.split(/\s+/)[0]) === Number(last.split(/\s+/)[0]) &&
      Number(first.split(/\s+/)[1]) === Number(last.split(/\s+/)[1]));
  const outer = closes ? outerAll.slice(0, -1) : outerAll;
  if (outer.length < 3) return null;

  let latMin = 90;
  let latMax = -90;
  let lngMin = 180;
  let lngMax = -180;
  let latSum = 0;
  let lngSum = 0;
  let count = 0;

  for (const raw of outer) {
    // Striktna oblika: en presledek med dvema številkama (WKT dovoljuje
    // tudi več presledkov — sprejmemo /\s+/).
    const parts = raw.split(/\s+/);
    if (parts.length !== 2) return null;
    const lng = Number(parts[0]);
    const lat = Number(parts[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    // Ščit proti NaN literalom, ki jih Number() sprejme kot besedilo:
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(parts[0])) return null;
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(parts[1])) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

    latMin = Math.min(latMin, lat);
    latMax = Math.max(latMax, lat);
    lngMin = Math.min(lngMin, lng);
    lngMax = Math.max(lngMax, lng);
    latSum += lat;
    lngSum += lng;
    count++;
  }

  // Degenerirana geometrija (ena točka / črta ni območje) → NULL.
  if (latMax - latMin < 1e-9 && lngMax - lngMin < 1e-9) return null;

  return {
    bbox: [latMin, lngMin, latMax, lngMax],
    centroid: { lat: latSum / count, lng: lngSum / count },
    pointCount: count,
  };
}

/**
 * Preveri presek dveh bbox polj [s, w, n, e] (viewport ↔ območje kraja).
 * Če kraj nima bbox → false (brez geo NI pina — nikoli ne ugibamo).
 */
export function bboxIntersects(
  a: [number, number, number, number] | undefined,
  b: [number, number, number, number] | undefined,
  /** Robna toleranca (°) — rahlo razširi viewport, da mejni pini minejo. */
  margin = 0.02
): boolean {
  if (!a || !b) return false;
  const [aS, aW, aN, aE] = a;
  const [bS, bW, bN, bE] = b;
  return (
    aS - margin <= bN &&
    bS - margin <= aN &&
    aW - margin <= bE &&
    bW - margin <= aE
  );
}
