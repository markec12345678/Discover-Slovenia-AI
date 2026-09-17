import { DESTINATIONS } from "@/lib/slovenia-data";
import { DESTINATIONS_EN } from "@/lib/slovenia-data-en";
import type { Itinerary, LocationVisit, PlannerInput } from "@/lib/types";
import type { ChatPlace, PlaceCategory } from "@/lib/geo-intent";

// ============================================================================
// DODAJ V NAČRT IZ KLEPETA (1.42.0)
// ============================================================================
// Mindtripov vzorec "+" na kartici kraja v AI klepetu — pri nas po našem
// modelu: dejanje je DETERMINISTIČNO (0 AI žetonov), kraj obdrži POREKLO
// (T1 destinacija ali OSM gostilna z značko vira) in se vstavi v DAN, ki je
// kraju najbližje (naravna izbira: gostilna v Ljubljani → dan z Ljubljano).
//
// Poti doda­vanja (isti rezultat, različna okolja):
//   A) /načrtuj (planner montiran): Chatbot odpošlje CustomEvent
//      CHAT_ADD_PLACE_EVENT → planner prevzame (preventDefault) in doda
//      v svoj lokalni state + store + localStorage.
//   B) katera koli druga stran: Chatbot prebere načrt iz Zustand store-a
//      (oz. localStorage) in doda neposredno.
//   C) ni še načrta: kraj se ODLOŽI v sessionStorage (vzorec heroQuery) —
//      ko uporabnik ustvari/obnovi načrt na /načrtuj, se odloženi kraji
//      samodejno dodajo (toast "Dodano iz AI klepeta").
// ============================================================================

/** Ime CustomEvent-a (chatbot → planner). Cancelable: planner, ki dogodek
 *  prevzame, pokliče preventDefault() → dispatchEvent vrne false. */
export const CHAT_ADD_PLACE_EVENT = "chat:add-place";

/** sessionStorage odložišče krajev, ko še ni načrta (vzorec heroQuery). */
export const CHAT_STASH_KEY = "discoverslovenia_chat_places";

/** localStorage ključ zadnjega načrta — ENAK kot v itinerary-planner.tsx
 *  (enkraten vir resnice, da planner in klepet bereta/pisala isto mesto). */
export const LAST_ITINERARY_KEY = "discoverslovenia_last_itinerary";

const MAX_PERSIST_CHARS = 250 * 1024; // 250 KB (ista meja kot planner)

/** Tipična trajanja/cene po kategoriji — HEVRISTIKA, pošteno razkrita v
 *  notesih postanka (ocena, ne obljb — prava cena je v ponudbi gostilne). */
const CATEGORY_DEFAULTS: Record<
  PlaceCategory,
  { duration: number; costPerPerson: number }
> = {
  food: { duration: 1.5, costPerPerson: 20 },
  drinks: { duration: 1, costPerPerson: 8 },
  market: { duration: 0.75, costPerPerson: 10 },
  stay: { duration: 1, costPerPerson: 0 }, // cene nastanitev ne ocenjujemo
  service: { duration: 0.25, costPerPerson: 0 },
};

export type AddChatPlaceResult =
  | { ok: true; itinerary: Itinerary; day: number }
  | { ok: false; reason: "no-days" | "duplicate" };

// ---------------------------------------------------------------------------
// Validacija (ista oblika kot chatbot.tsx persistenca — enkraten vir)
// ---------------------------------------------------------------------------

export function isValidChatPlace(p: unknown): p is ChatPlace {
  if (!p || typeof p !== "object") return false;
  const c = p as Partial<ChatPlace>;
  return (
    typeof c.id === "string" &&
    c.id.length > 0 &&
    typeof c.name === "string" &&
    c.name.length > 0 &&
    typeof c.lat === "number" &&
    Number.isFinite(c.lat) &&
    typeof c.lng === "number" &&
    Number.isFinite(c.lng) &&
    (c.category === "food" ||
      c.category === "drinks" ||
      c.category === "market" ||
      c.category === "stay" ||
      c.category === "service") &&
    (c.provenance === "t1" || c.provenance === "osm")
  );
}

// ---------------------------------------------------------------------------
// Pomožne funkcije
// ---------------------------------------------------------------------------

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

/** Normalizirano ime za dedupe (čšž → csz, brez ločil, lowercase). */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Koordinate postanka: dataset ID → DESTINATIONS, sicer loc.lat/lng (OSM). */
function coordsOfVisit(loc: LocationVisit): { lat: number; lng: number } | null {
  const dest = DESTINATIONS.find((d) => d.id === loc.destination_id);
  if (dest) return dest.coords;
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
 * Dan, katerega postanki so kraju NAJBLIŽJE — naravna izbira za dodajanje
 * (večerja v Ljubljani pade v dan, ko uporabnik že je tam). Brez koordinat
 * v načrtu (redko) pade v zadnji dan.
 */
function bestDayForPlace(it: Itinerary, place: ChatPlace): number {
  const lastDay = it.days[it.days.length - 1]?.day ?? 1;
  let best = { day: lastDay, dist: Number.POSITIVE_INFINITY };
  for (const d of it.days) {
    for (const loc of d.locations) {
      const c = coordsOfVisit(loc);
      if (!c) continue;
      const dist = haversineKm(place.lat, place.lng, c.lat, c.lng);
      if (dist < best.dist) best = { day: d.day, dist };
    }
  }
  return best.day;
}

/**
 * Časovni okvir ZA ZADNJIM postankom dneva (ne prerazporeja obstoječih —
 * uporabnikovi časi ostanejo nespremenjeni; novega postanka ne stlačimo
 * v 9:00–19:00 matriko). Zadnji konec + 30 min premora, najkasneje 23:30
 * konec — če se kraj obreže, se START zamakne (nikoli prekrivanje slotov).
 */
function appendSlotAfter(
  locations: LocationVisit[],
  durationH: number
): string {
  const fmt = (h: number) => {
    const hh = Math.min(23, Math.floor(h));
    const mm = Math.round((h - Math.floor(h)) * 60);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };
  const last = locations[locations.length - 1];
  const m = last?.time_slot.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
  const minStart = 19; // brez zadnjega (prazen dan) → večer
  let start = m
    ? Math.max(parseInt(m[3], 10) + parseInt(m[4], 10) / 60 + 0.5, 12)
    : minStart;
  const end = Math.min(23.5, start + durationH);
  // Če je bil konec obrezan (pozna večerja), zamakni start — sloti se
  // NIKOLI ne prekrivajo; če niti to ne gre, se slot pošteno SKRAJŠA
  start = Math.max(start, end - durationH);
  return `${fmt(start)}-${fmt(end)}`;
}

// ---------------------------------------------------------------------------
// Jedro: čista funkcija dodajanja (uporabita jo planner in klepet)
// ---------------------------------------------------------------------------

/**
 * Doda kraj iz AI klepeta v itinerer.
 *
 *  - T1 kraj: destination_id iz dataseta → polna integracija (ocena, tagline,
 *    povezava na stran destinacije, booking ponižbe če obstajajo, pin na
 *    zemljevidu iz dataseta).
 *  - OSM kraj: sintetični destination_id (osm-node-…), lastne koordinate
 *    (lat/lng), notes s POREKLOM ("vir: OpenStreetMap"), značka "iz klepeta".
 *
 * Poštenost (vzorec F16/applySuggestedStop): strežniško izračunane metrike
 * (quality/geoValidation/legs/routeGeometry) so vezane na STARO sestavo →
 * jih odstranimo in pustimo preračunati na mestu uporabe.
 *
 * @param it         obstoječi itinerer (ne mutira)
 * @param place      kraj iz klepeta
 * @param opts.locale "sl" | "en" (jezik notesov)
 * @param opts.groupSize velikost skupine (ocena stroška × skupina)
 */
export function addChatPlaceToItinerary(
  it: Itinerary,
  place: ChatPlace,
  opts: { locale: string; groupSize?: number }
): AddChatPlaceResult {
  if (!it.days || it.days.length === 0) return { ok: false, reason: "no-days" };

  const isEn = opts.locale === "en";
  const groupSize = opts.groupSize && opts.groupSize >= 1 ? opts.groupSize : 2;
  const normPlaceName = normalizeName(place.name);

  // Dedupe po ID-ju ALI normaliziranem imenu (isti kraj v drugem sklonu)
  for (const d of it.days) {
    for (const loc of d.locations) {
      if (
        loc.destination_id === place.id ||
        normalizeName(loc.destination_name) === normPlaceName
      ) {
        return { ok: false, reason: "duplicate" };
      }
    }
  }

  const day = bestDayForPlace(it, place);
  const dayIdx = it.days.findIndex((d) => d.day === day);
  if (dayIdx === -1) return { ok: false, reason: "no-days" };

  let visit: LocationVisit;
  if (place.provenance === "t1" && place.id.startsWith("t1-")) {
    // T1 destinacija → popolna integracija z datasetom (kot leg suggestion)
    const dest = DESTINATIONS.find((d) => d.id === place.id.slice(3));
    if (!dest) return { ok: false, reason: "duplicate" }; // neznan → ne ugibamo
    const tagline = isEn
      ? DESTINATIONS_EN[dest.id]?.tagline ?? dest.tagline
      : dest.tagline;
    visit = {
      destination_id: dest.id,
      destination_name: dest.name,
      time_slot: "",
      duration: 2, // tipičen obisk destinacije (friziran v slot spodaj)
      estimated_cost: dest.costPerPerson * groupSize,
      notes: tagline,
      category: "chat",
    };
  } else {
    // OSM kraj → sintetični ID + lastne koordinate + poštena porekla v notesih
    const cat = CATEGORY_DEFAULTS[place.category] ?? CATEGORY_DEFAULTS.food;
    const notesParts: string[] = [];
    if (place.detail) notesParts.push(place.detail);
    if (place.openingHours) notesParts.push(place.openingHours);
    if (place.address) notesParts.push(place.address);
    notesParts.push(
      isEn
        ? "Added from AI chat · source: OpenStreetMap (community data)"
        : "Dodano iz AI klepeta · vir: OpenStreetMap (skupnostni podatki)"
    );
    if (cat.costPerPerson > 0) {
      notesParts.push(
        isEn
          ? `cost estimate: ~€${cat.costPerPerson}/person (typical average)`
          : `ocena stroška: ~${cat.costPerPerson} €/osebo (tipično povprečje)`
      );
    }
    visit = {
      destination_id: place.id, // osm-node-… / osm-way-…
      destination_name: place.name,
      time_slot: "",
      duration: cat.duration,
      estimated_cost: Math.round(cat.costPerPerson * groupSize),
      notes: notesParts.join(" · "),
      category: "chat",
      lat: place.lat,
      lng: place.lng,
    };
  }

  const existingLocations = it.days[dayIdx].locations;
  const slot = appendSlotAfter(existingLocations, visit.duration);
  const withSlot: LocationVisit = { ...visit, time_slot: slot };

  const nextDays = it.days.map((d, i) =>
    i === dayIdx
      ? {
          ...d,
          locations: [...existingLocations, withSlot],
          // OSRM geometrija je vezana na staro sestavo → pošteno umaknjena
          routeGeometry: undefined,
        }
      : d
  );
  const next: Itinerary = {
    ...it,
    days: nextDays,
    quality: undefined,
    geoValidation: undefined,
    legs: undefined,
  };
  return { ok: true, itinerary: next, day };
}

// ---------------------------------------------------------------------------
// localStorage / sessionStorage vmesniki (isti vzorec kot planner)
// ---------------------------------------------------------------------------

interface PersistedItinerary {
  itinerary: Itinerary;
  formData?: PlannerInput;
  savedAt?: string;
}

/** Prebere zadnji načrt iz localStorage (validiran, brez sesutja ob smeti). */
export function readLastItinerary(): PersistedItinerary | null {
  try {
    const raw = localStorage.getItem(LAST_ITINERARY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedItinerary | null;
    if (
      !parsed ||
      !parsed.itinerary ||
      !Array.isArray(parsed.itinerary.days) ||
      parsed.itinerary.days.length === 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Zapiše zadnji načrt (ista oblika kot planner — savedAt ostane svež). */
export function persistLastItinerary(
  it: Itinerary,
  formData?: PlannerInput
): void {
  try {
    const payload: PersistedItinerary = {
      itinerary: it,
      formData,
      savedAt: new Date().toISOString(),
    };
    const serialized = JSON.stringify(payload);
    if (serialized.length < MAX_PERSIST_CHARS) {
      localStorage.setItem(LAST_ITINERARY_KEY, serialized);
    }
  } catch {
    // Poln/zasebni localStorage — mirno preskoči
  }
}

/** Odloži kraj, ko še ni načrta (sessionStorage — izgubi ob zaprtju zavihka). */
export function stashChatPlace(place: ChatPlace): void {
  try {
    const existing = readStashedChatPlaces();
    // dedupe tudi v odložišču
    if (existing.some((p) => p.id === place.id)) return;
    sessionStorage.setItem(
      CHAT_STASH_KEY,
      JSON.stringify([...existing, place])
    );
  } catch {
    // sessionStorage nedosen — kraj žal izgubimo, ne sesujemo klepeta
  }
}

/** Prebere (in POČISTI) odložene kraje — samo-enkraten consume. */
export function readStashedChatPlaces(): ChatPlace[] {
  try {
    const raw = sessionStorage.getItem(CHAT_STASH_KEY);
    if (!raw) return [];
    sessionStorage.removeItem(CHAT_STASH_KEY);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidChatPlace);
  } catch {
    return [];
  }
}
