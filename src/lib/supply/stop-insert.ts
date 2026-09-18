// ============================================================================
// TRAVEL SUPPLY MAP — VSTAVITEV PRODUKTA V NAČRT (F1, 1.49.0)
// ============================================================================
// ČISTA funkcija (client + server uporabna): izdelek iz zemljevida →
// postanek dneva (najbližji dan po haversine, večernji slot po zadnjim
// postanku — ISTA deterministična mehanika kot chat-add-place 1.42).
//
// Iskrenost po tipih:
//  - nastanitev (accommodation) NI postanek obiska — dodajanje v itinerer
//    bi izreklo "obisk hotela 19:00-20:00". Ostane samo v izbiri
//    (selectedProviderProducts) za AI kontekst → vračamo selectionOnly.
//  - produkti brez geo → samo izbira (AI jih omeni v recommendations).
//  - ostali z geo → postanek category "supply" + poštena opomba vira.
// ============================================================================

import type { Itinerary, LocationVisit } from "@/lib/types";
import type { ProviderProduct } from "./types";

export type AddProductResult =
  | { ok: true; kind: "stop"; itinerary: Itinerary; day: number }
  | { ok: true; kind: "selection-only"; reason: "accommodation" | "no-geo" }
  | { ok: false; reason: "no-days" | "duplicate" };

/** Haversine km (ista formula kot chat-add-place — enkraten vir). */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Tipična trajanja po tipu produkta (hevristika, pošteno razkrita). */
const TYPE_DURATION_H: Partial<Record<string, number>> = {
  attraction: 2,
  museum: 1.5,
  viewpoint: 1,
  natural: 2,
  religious: 1,
  restaurant: 1.5,
  shop: 0.5,
  activity: 2.5,
  tour: 3,
  ticket: 2,
  transfer: 1,
  poi: 1.5,
};

/** Časovni okvir ZA ZADNJIM postankom dneva (ista logika kot
 *  chat-add-place appendSlotAfter — nikoli prekrivanja). */
function appendSlotAfter(locations: LocationVisit[], durationH: number): string {
  const fmt = (h: number) => {
    const hh = Math.min(23, Math.floor(h));
    const mm = Math.round((h - Math.floor(h)) * 60);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };
  const last = locations[locations.length - 1];
  const m = last?.time_slot.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
  const minStart = 19;
  let start = m
    ? Math.max(parseInt(m[3], 10) + parseInt(m[4], 10) / 60 + 0.5, 12)
    : minStart;
  const end = Math.min(23.5, start + durationH);
  start = Math.max(start, end - durationH);
  return `${fmt(start)}-${fmt(end)}`;
}

/** Koordinate postanka: T1 dataset ali loc.lat/lng (ista logika). */
function coordsOfVisit(loc: LocationVisit, destCoords: Map<string, { lat: number; lng: number }>): { lat: number; lng: number } | null {
  const c = destCoords.get(loc.destination_id);
  if (c) return c;
  if (
    typeof loc.lat === "number" &&
    typeof loc.lng === "number" &&
    Number.isFinite(loc.lat) &&
    Number.isFinite(loc.lng)
  ) {
    return { lat: loc.lat, lng: loc.lng };
  }
  return null;
}

/**
 * Vstavi produkt v načrt (ne mutira) ALI poroča selection-only.
 *
 * @param it               obstoječi itinerer
 * @param product          izdelek iz zemljevida ponudbe
 * @param opts.locale      jezik opomb
 * @param opts.destinationCoords  T1 koordinate (za iskanje najbližjega dne)
 */
export function insertProductStop(
  it: Itinerary,
  product: ProviderProduct,
  opts: {
    locale: "sl" | "en";
    destinationCoords: Map<string, { lat: number; lng: number }>;
  }
): AddProductResult {
  if (!it.days || it.days.length === 0) return { ok: false, reason: "no-days" };

  // Nastanitev ni obisk — ostane v AI izbiri (zgornja iskrenostna pravila).
  if (product.type === "accommodation") {
    return { ok: true, kind: "selection-only", reason: "accommodation" };
  }
  // Brez geo ne moremo pošteno izbrati dneva/ukiniti pina.
  if (
    product.lat == null ||
    product.lng == null ||
    !Number.isFinite(product.lat) ||
    !Number.isFinite(product.lng)
  ) {
    return { ok: true, kind: "selection-only", reason: "no-geo" };
  }

  // Dedupe po id (isti produkt) — po imenu NE (drugačen produkt z istim
  // imenom pri drugem ponudniku je legitimen; dedupe po id zadostuje).
  for (const d of it.days) {
    for (const loc of d.locations) {
      if (loc.destination_id === product.id) {
        return { ok: false, reason: "duplicate" };
      }
    }
  }

  // Najbližji dan (naravna izbira — isti vzorec kot klepet).
  let best = { day: it.days[it.days.length - 1].day, dist: Number.POSITIVE_INFINITY };
  for (const d of it.days) {
    for (const loc of d.locations) {
      const c = coordsOfVisit(loc, opts.destinationCoords);
      if (!c) continue;
      const dist = haversineKm(product.lat!, product.lng!, c.lat, c.lng);
      if (dist < best.dist) best = { day: d.day, dist };
    }
  }
  const dayIdx = it.days.findIndex((d) => d.day === best.day);
  if (dayIdx === -1) return { ok: false, reason: "no-days" };

  const isEn = opts.locale === "en";
  const duration = TYPE_DURATION_H[product.type] ?? 2;

  const notesParts: string[] = [];
  if (product.description) notesParts.push(product.description.slice(0, 120));
  if (product.openingHours) notesParts.push(product.openingHours);
  if (product.address) notesParts.push(product.address);
  if (product.price) {
    notesParts.push(
      isEn
        ? `price: €${product.price.amount} (${product.price.unit.replace(/_/g, " ")})`
        : `cena: ${product.price.amount} € (${product.price.unit.replace(/_/g, " ")})`
    );
  }
  notesParts.push(
    isEn
      ? `Added from the supply map · source: ${product.license?.source ?? product.provider}`
      : `Dodano z zemljevida ponudbe · vir: ${product.license?.source ?? product.provider}`
  );

  const visit: LocationVisit = {
    destination_id: product.id, // "osm:node-123" / "viator:…"
    destination_name: product.title,
    time_slot: "",
    duration,
    // Lokalni OSM vir NIMA cene → ocena stroška 0 (nikoli ne izmišljujemo);
    // komercialni adapter bodo nosili pravo ceno.
    estimated_cost: product.price ? Math.round(product.price.amount) : 0,
    notes: notesParts.join(" · "),
    category: "supply",
    lat: product.lat,
    lng: product.lng,
  };

  const existing = it.days[dayIdx].locations;
  const slot = appendSlotAfter(existing, duration);
  const withSlot: LocationVisit = { ...visit, time_slot: slot };

  const nextDays = it.days.map((d, i) =>
    i === dayIdx
      ? { ...d, locations: [...existing, withSlot], routeGeometry: undefined }
      : d
  );
  return {
    ok: true,
    kind: "stop",
    itinerary: {
      ...it,
      days: nextDays,
      // Strežniške metrike so vezane na STARO sestavo → preračunane na mestu
      // uporabe (isti pošteni vzorec kot chat-add-place).
      quality: undefined,
      geoValidation: undefined,
      legs: undefined,
    },
    day: best.day,
  };
}

/**
 * Odstrani postanek, dodan z zemljevida (category === "supply") — en klik,
 * simetrija s chat postanki (1.43 vzorec, isto pošteno ponižanje metrik).
 */
export function removeProductStop(
  it: Itinerary,
  productId: string
): { ok: true; itinerary: Itinerary; day: number; name: string } | { ok: false } {
  for (const d of it.days) {
    const idx = d.locations.findIndex(
      (l) => l.category === "supply" && l.destination_id === productId
    );
    if (idx === -1) continue;
    const name = d.locations[idx].destination_name;
    const nextDays = it.days.map((x) =>
      x.day === d.day
        ? {
            ...x,
            locations: x.locations.filter((_, i) => i !== idx),
            routeGeometry: undefined,
          }
        : x
    );
    return {
      ok: true,
      itinerary: { ...it, days: nextDays, quality: undefined, geoValidation: undefined, legs: undefined },
      day: d.day,
      name,
    };
  }
  return { ok: false };
}
