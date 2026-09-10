// "Moja potovanja" — localStorage sledenje anonimno shranjenih načrtov (P2-3)
//
// Problem (iz P1 raziskave): popotnik uporablja načrtovalnik anonimno → shrani
// načrt (SavedItinerary z userId: null) → dobi deljivo povezavo. Ko se kasneje
// registrira/prijavi, tisti načrti NISO povezani z računom.
//
// Rešitev (Booking.com-style "claim"): ob vsakem uspešnem shranjevanju zapišemo
// shareId v localStorage (ključ "dai:my-trips"). Ob naslednji prijavi ali
// registraciji B2C (/prijava) se seznam pošlje na POST /api/user/trips/claim,
// ki ANONIMNE zapise (userId: null) poveže z računom.
//
// Zasebnost: shranjujemo SAMO javni shareId + ime načrta (destinacije), ki je
// tako ali takoj javno dostopen prek deljive povezave. Brez PII.

import type { Itinerary } from "./types";

const STORAGE_KEY = "dai:my-trips";
const MAX_TRACKED = 50; // zadnjih 50 shranjevanj (FIFO)
const NAME_MAX_LENGTH = 120;

export interface TrackedTrip {
  shareId: string;
  name: string | null;
  savedAt: string; // ISO
}

interface StoredEntry {
  shareId: unknown;
  name: unknown;
  savedAt: unknown;
}

/** Notranje: preberi seznam iz localStorage (varno — poln/ponarejen ne sesuje app). */
function readTrips(): TrackedTrip[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const trips: TrackedTrip[] = [];
    for (const entry of parsed as StoredEntry[]) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        typeof entry.shareId === "string" &&
        entry.shareId.length >= 5 &&
        entry.shareId.length <= 20
      ) {
        trips.push({
          shareId: entry.shareId,
          name:
            typeof entry.name === "string" && entry.name.trim()
              ? entry.name.slice(0, NAME_MAX_LENGTH)
              : null,
          savedAt:
            typeof entry.savedAt === "string" ? entry.savedAt : new Date().toISOString(),
        });
      }
    }
    return trips;
  } catch {
    // Poln ali pokvarjen localStorage — začnemo s praznim seznamom
    return [];
  }
}

/** Notranje: zapiši seznam v localStorage (varno — poln prostor ne sesuje app). */
function writeTrips(trips: TrackedTrip[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trips.slice(-MAX_TRACKED)));
  } catch {
    // Poln/zasebni localStorage — mirno preskoči
  }
}

/**
 * Zapiši uspešno shranjen načrt v seznam za morebitni prevzem v račun.
 * Deduplicira ponovno shranjevanje istega shareId (osveži le čas/ime).
 */
export function addSavedTrip(shareId: string, name?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const trips = readTrips().filter((t) => t.shareId !== shareId);
    trips.push({
      shareId,
      name: name?.trim()
        ? name.trim().slice(0, NAME_MAX_LENGTH)
        : null,
      savedAt: new Date().toISOString(),
    });
    writeTrips(trips);
  } catch {
    // neblokirajoče
  }
}

/** Vsi shareId-ji anonimno shranjenih načrtov (za claim ob prijavi). */
export function getSavedTripIds(): string[] {
  return readTrips().map((t) => t.shareId);
}

/** Število sledenih načrtov (npr. za prazen/neprazen prikaz). */
export function getSavedTripsCount(): number {
  return readTrips().length;
}

/**
 * Odstrani poslane ID-je iz seznama (po poskusu prevzema — so ali prevzeti
 * ali niso več prevzemljivi). Pri omrežni napaki klicatelj NE sme klicati
 * tega (ID-ji ostanejo za retry pri naslednji prijavi).
 */
export function removeSavedTripIds(ids: string[]): void {
  if (typeof window === "undefined" || ids.length === 0) return;
  try {
    const remove = new Set(ids);
    writeTrips(readTrips().filter((t) => !remove.has(t.shareId)));
  } catch {
    // neblokirajoče
  }
}

/**
 * Prijazno ime načrta iz destinacij itinererja, npr. "Bled · Soteska Vintgar".
 * Uporabi se le za prikaz v localStorage seznamu (javni podatek).
 */
export function deriveSavedTripName(itinerary: Itinerary): string | null {
  try {
    const names: string[] = [];
    for (const day of itinerary.days) {
      for (const loc of day.locations) {
        const n = loc.destination_name?.trim();
        if (n && !names.includes(n)) names.push(n);
        if (names.length >= 3) break;
      }
    }
    if (names.length === 0) return null;
    return names.slice(0, 3).join(" · ");
  } catch {
    return null;
  }
}
