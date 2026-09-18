// ============================================================================
// TRAVEL SUPPLY MAP — KIWITAXI: STRUKTURNA VALIDACIJA DATASETA (Task 43)
// ============================================================================
// Baseline je git-kontroliran (zaupanja vreden), a overlay in bodoče
// generacije prihajajo iz RUNTIME prenosa — obe poti gresta skozi ISTO
// strukturno validacijo (meja zaupanja na bralni strani, ne le ingest).
//
// Namen: preprečiti, da bi pokvarjen/delen zapis utihnil adapter z izjemo
// (fail-safe: invalid dataset = prazen sloj + note, nikoli sesutev).
// ============================================================================

import type { KiwiRoute, KiwiTaxiDataset } from "./types";

const MAX_ROUTES = 5_000;
const MAX_PLACES = 2_000;
const MAX_CLASSES = 12;
const MAX_PRICE_EUR = 10_000;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function validBbox(v: unknown): v is [number, number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 4 &&
    v.every(isFiniteNumber) &&
    v[0] <= v[2] && // s ≤ n
    v[1] <= v[3] && // w ≤ e
    Math.abs(v[0]) <= 90 &&
    Math.abs(v[2]) <= 90 &&
    Math.abs(v[1]) <= 180 &&
    Math.abs(v[3]) <= 180
  );
}

function validRoute(r: unknown): r is KiwiRoute {
  if (!r || typeof r !== "object") return false;
  const x = r as Partial<KiwiRoute>;
  if (!isFiniteNumber(x.id) || x.id <= 0) return false;
  if (typeof x.fromName !== "string" || x.fromName.length === 0) return false;
  if (typeof x.toName !== "string" || x.toName.length === 0) return false;
  if (!isFiniteNumber(x.distanceKm) || x.distanceKm < 0) return false;
  if (!isFiniteNumber(x.durationMin) || x.durationMin < 0) return false;
  if (!isFiniteNumber(x.weight) || x.weight < 0 || x.weight > 100) return false;
  if (!isFiniteNumber(x.minPriceEur) || x.minPriceEur <= 0 || x.minPriceEur > MAX_PRICE_EUR) {
    return false;
  }
  if (!isFiniteNumber(x.cheapestTransferId) || x.cheapestTransferId <= 0) return false;
  if (typeof x.urlPath !== "string" || !x.urlPath.startsWith("/")) return false;
  if (!Array.isArray(x.classes) || x.classes.length === 0 || x.classes.length > MAX_CLASSES) {
    return false;
  }
  if (
    !x.classes.every(
      (c) =>
        c &&
        isFiniteNumber(c.transferId) &&
        c.transferId > 0 &&
        typeof c.name === "string" &&
        c.name.length > 0 &&
        isFiniteNumber(c.pax) &&
        c.pax > 0 &&
        isFiniteNumber(c.eur) &&
        c.eur > 0 &&
        c.eur <= MAX_PRICE_EUR
    )
  ) {
    return false;
  }
  // Geo je opcijsko — kadar je, mora biti konsistentna (pin + bbox skupaj).
  const hasLat = isFiniteNumber(x.fromLat);
  const hasLng = isFiniteNumber(x.fromLng);
  const hasBbox = validBbox(x.fromBbox);
  if (hasLat !== hasLng || hasLat !== hasBbox) return false;
  if (hasLat && (Math.abs(x.fromLat!) > 90 || Math.abs(x.fromLng!) > 180)) return false;
  return true;
}

/** Strukturna validacija celotnega dataseta (groba — hitra na hladni poti). */
export function isKiwiTaxiDataset(v: unknown): v is KiwiTaxiDataset {
  if (!v || typeof v !== "object") return false;
  const ds = v as Partial<KiwiTaxiDataset>;
  if (ds.version !== 1) return false;
  if (typeof ds.fetchedAt !== "string" || ds.fetchedAt.length === 0) return false;
  if (!Array.isArray(ds.places) || ds.places.length === 0 || ds.places.length > MAX_PLACES) {
    return false;
  }
  if (!Array.isArray(ds.routes) || ds.routes.length === 0 || ds.routes.length > MAX_ROUTES) {
    return false;
  }
  // Vzorcna preverba (prva + zadnja ruta) — popolna validacija je bila
  // opravljena pri ingestu; tu samo bralna meja proti pokvarjenim zapisi.
  if (!validRoute(ds.routes[0]) || !validRoute(ds.routes[ds.routes.length - 1])) {
    return false;
  }
  return true;
}

/** Izlušči SAMO veljavne rute (adapter uporablja po nodigah). */
export function filterValidRoutes(routes: unknown[]): KiwiRoute[] {
  return routes.filter(validRoute);
}
