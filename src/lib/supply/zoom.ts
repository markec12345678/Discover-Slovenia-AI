// ============================================================================
// TRAVEL SUPPLY MAP — ZOOM GATING (F1, 1.49.0)
// ============================================================================
// Gostota markerjev pod nadzorom: pri nizkem zoomu NE nalagamo tisočev
// pinov (ne "celotna Slovenija na vsak klik"). Strežnik po zoom-u omeji
// število produktov; kategorije imajo svoje pragove (taksonomija).
//
// Čista funkcija → enostavno testiranje (supply-zoom.test.ts).
// ============================================================================

import { taxonomyOf } from "./taxonomy";
import type { ProductType } from "./types";

/** Nadzorovan nabor markerjev po zoom nivojih (strežniška meja). */
const ZOOM_CAPS: Array<{ minZoom: number; max: number }> = [
  { minZoom: 0, max: 0 }, // z0–7: samo destinacije (brez produktov)
  { minZoom: 8, max: 60 }, // z8–9: top-N po kategoriji (destinacijska raven)
  { minZoom: 10, max: 120 }, // z10–11: regionalna raven
  { minZoom: 12, max: 220 }, // z12–13: mestna raven
  { minZoom: 14, max: 400 }, // z14+: ulična raven (strešnik)
];

/** Minimum zoom, pri katerem sploh vračamo produkte. z≤9 = državni
 *  pogled (22 destinacij iz dataseta zadostuje; državni nwr poizvedbi na
 *  Overpassu traja 15–30 s — požrešnost pod nadzorom). z10+ = regionalna
 *  raven, kjer so lokalni pini smiselni. */
export const SUPPLY_MIN_ZOOM = 10;

export function clampZoom(z: unknown): number {
  const n = typeof z === "number" && Number.isFinite(z) ? Math.floor(z) : 8;
  return Math.min(19, Math.max(3, n));
}

/** Največje št. produktov, ki jih strežnik vrne za dani zoom. */
export function maxProductsForZoom(zoom: number): number {
  const z = clampZoom(zoom);
  for (let i = ZOOM_CAPS.length - 1; i >= 0; i--) {
    if (z >= ZOOM_CAPS[i].minZoom) return ZOOM_CAPS[i].max;
  }
  return 0;
}

/**
 * Kategorije, ki so vidne pri danem zoom-u (minZoom iz taksonomije).
 * Goste kategorije (restavracije, trgovine) se prikažejo šele poglobljeno.
 */
export function typesVisibleAtZoom(
  zoom: number,
  types: ProductType[]
): ProductType[] {
  const z = clampZoom(zoom);
  if (z < SUPPLY_MIN_ZOOM) return [];
  return types.filter((t) => z >= taxonomyOf(t).minZoom);
}

/** Ali je tip viden pri zoom-u (posamezni pin). */
export function typeVisibleAtZoom(zoom: number, type: ProductType): boolean {
  return clampZoom(zoom) >= taxonomyOf(type).minZoom;
}
