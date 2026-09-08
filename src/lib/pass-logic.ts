// Slovenia Pass — logika gamifikacije (točke, regije, značke).
//
// Persistenca: localStorage "discoverslovenia_pass".
// Dogodki (CustomEvent na window):
//   - POSLUŠA: "itineraryGenerated" { destinationIds, locations? }
//              "destinationViewed" { destinationId }
//              "listingViewed"     { listingId }
//   - ODPOŠILJE: "passUpdated" (komponenta SloveniaPass znova prebere stanje)
//                "passToast"    { message } (lahki toast spodaj desno, 3s)
//
// Uporaba: src/components/slovenia-pass.tsx (listenerji + prikaz).

import { DESTINATIONS } from "./slovenia-data";
import type { Destination, LocationVisit } from "./types";

// ============================================================================
// TIPI
// ============================================================================

export interface SloveniaPassData {
  /** Obiskane regije (id-ji iz REGIONS) */
  visitedRegions: string[];
  points: number;
  badges: string[];
  /** Števci za kategorjske značke */
  natureVisits: number;
  foodVisits: number;
  activityVisits: number;
  /** Distinct ogledi lokalov (za "local" značko) */
  viewedListingIds: string[];
  /** Destinacije, za katere smo že dodali točke ogleda */
  awardedDestinationIds: string[];
  /** Zadnji obdelan itinerer (hash) — preprečuje dvojno nagrajevanje */
  lastItineraryKey: string | null;
}

export interface BadgeInfo {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

/** Detail dogodka "itineraryGenerated" */
export interface ItineraryGeneratedDetail {
  destinationIds: string[];
  locations?: LocationVisit[];
}

export interface PassMutationResult {
  pass: SloveniaPassData;
  changed: boolean;
  newBadges: string[];
}

// ============================================================================
// KONSTANTE
// ============================================================================

export const PASS_STORAGE_KEY = "discoverslovenia_pass";

export const PASS_BADGES: BadgeInfo[] = [
  { id: "explorer", name: "Explorer", emoji: "🗺️", description: "Obiskal 3+ regije" },
  { id: "nature", name: "Nature Lover", emoji: "🌿", description: "Obiskal 5+ naravnih destinacij" },
  { id: "foodie", name: "Food Lover", emoji: "🍷", description: "Doživel 3+ gastro trenutke" },
  { id: "adventure", name: "Adventurer", emoji: "🧗", description: "Opravil 3+ aktivnosti" },
  { id: "local", name: "Local Hero", emoji: "⭐", description: "Ogledal 5+ lokalnih ponudnikov" },
  { id: "master", name: "Slovenia Master", emoji: "👑", description: "Obiskal vseh 9 regij" },
];

const DEFAULT_PASS: SloveniaPassData = {
  visitedRegions: [],
  points: 0,
  badges: [],
  natureVisits: 0,
  foodVisits: 0,
  activityVisits: 0,
  viewedListingIds: [],
  awardedDestinationIds: [],
  lastItineraryKey: null,
};

// Pogoji za odklep posamezne značke
const BADGE_CONDITIONS: Record<string, (p: SloveniaPassData) => boolean> = {
  explorer: (p) => p.visitedRegions.length >= 3,
  nature: (p) => p.natureVisits >= 5,
  foodie: (p) => p.foodVisits >= 3,
  adventure: (p) => p.activityVisits >= 3,
  local: (p) => p.viewedListingIds.length >= 5,
  master: (p) => p.visitedRegions.length >= 9,
};

// Naravni tipi destinacij (za števec natureVisits)
const NATURE_TYPES = new Set(["mountain", "lake", "river", "gorge", "cave", "coast"]);
// bestFor vrednosti, ki štejejo kot hrana/vino
const FOOD_BEST_FOR = new Set(["hrana", "vino"]);
// bestFor vrednosti, ki štejejo kot aktivnost/avantura
const ACTIVITY_BEST_FOR = new Set(["avantura", "adrenalin", "aktivnosti", "pohodništvo"]);

// ============================================================================
// OSNOVNE FUNKCIJE (bralno/pisalna plast)
// ============================================================================

export function loadPass(): SloveniaPassData {
  if (typeof window === "undefined") return { ...DEFAULT_PASS };
  try {
    const stored = localStorage.getItem(PASS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<SloveniaPassData>;
      return sanitizePass(parsed);
    }
  } catch {
    // Pokvarjen JSON — začni na novo
  }
  return { ...DEFAULT_PASS };
}

/** Združi shranjene podatke s privzetimi vrednostmi (migracije/varnost). */
function sanitizePass(raw: Partial<SloveniaPassData>): SloveniaPassData {
  const strArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    visitedRegions: strArray(raw.visitedRegions),
    points: typeof raw.points === "number" && Number.isFinite(raw.points) ? raw.points : 0,
    badges: strArray(raw.badges),
    natureVisits: typeof raw.natureVisits === "number" && Number.isFinite(raw.natureVisits) ? raw.natureVisits : 0,
    foodVisits: typeof raw.foodVisits === "number" && Number.isFinite(raw.foodVisits) ? raw.foodVisits : 0,
    activityVisits: typeof raw.activityVisits === "number" && Number.isFinite(raw.activityVisits) ? raw.activityVisits : 0,
    viewedListingIds: strArray(raw.viewedListingIds),
    awardedDestinationIds: strArray(raw.awardedDestinationIds),
    lastItineraryKey: typeof raw.lastItineraryKey === "string" ? raw.lastItineraryKey : null,
  };
}

export function savePass(pass: SloveniaPassData) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PASS_STORAGE_KEY, JSON.stringify(pass));
  } catch {
    // Zasebni način / poln localStorage — ignoriraj
  }
  window.dispatchEvent(new CustomEvent("passUpdated"));
}

/** Lahki toast za gamifikacijo (prisluškuje mu SloveniaPass komponenta). */
function notifyPass(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("passToast", { detail: { message } }));
}

/** Odklepne vse značke, ki jim zdaj ustrezajo pogoji. Vrne novo dodane. */
function unlockBadges(pass: SloveniaPassData): string[] {
  const newBadges: string[] = [];
  for (const badge of PASS_BADGES) {
    if (pass.badges.includes(badge.id)) continue;
    if (BADGE_CONDITIONS[badge.id]?.(pass)) {
      pass.badges.push(badge.id);
      newBadges.push(badge.id);
    }
  }
  return newBadges;
}

function announceBadges(newBadges: string[]) {
  for (const id of newBadges) {
    const badge = PASS_BADGES.find((b) => b.id === id);
    if (badge) {
      notifyPass(`${badge.emoji} Nova značka: ${badge.name}!`);
    }
  }
}

// ============================================================================
// JAVNE MUTACIJE
// ============================================================================

/** Doda točke in shrani pass. */
export function awardPoints(n: number, reason?: string): PassMutationResult {
  const pass = loadPass();
  pass.points += n;
  const newBadges = unlockBadges(pass);
  savePass(pass);
  notifyPass(`🇸🇮 Slovenia Pass: +${n} točk${reason ? ` (${reason})` : ""}`);
  announceBadges(newBadges);
  return { pass, changed: true, newBadges };
}

/** Označi regijo kot obiskano (idempotentno). */
export function markRegionVisited(regionId: string): PassMutationResult {
  const pass = loadPass();
  if (pass.visitedRegions.includes(regionId)) {
    return { pass, changed: false, newBadges: [] };
  }
  pass.visitedRegions.push(regionId);
  const newBadges = unlockBadges(pass);
  savePass(pass);
  announceBadges(newBadges);
  return { pass, changed: true, newBadges };
}

/**
 * Obdelaj novo generiran AI itinerer:
 * +50 točk, obiskane regije, števci kategorij (narava/hrana/aktivnosti).
 * Idempotentno — isti nabor destinacij se nagradi le enkrat.
 */
export function recordItineraryGenerated(detail: ItineraryGeneratedDetail): PassMutationResult {
  const pass = loadPass();
  const ids = Array.isArray(detail.destinationIds)
    ? detail.destinationIds.filter((id): id is string => typeof id === "string")
    : [];
  if (ids.length === 0) return { pass, changed: false, newBadges: [] };

  const key = [...ids].sort().join("|");
  if (pass.lastItineraryKey === key) {
    return { pass, changed: false, newBadges: [] };
  }

  pass.points += 50;
  pass.lastItineraryKey = key;

  const locationsByDest = new Map<string, LocationVisit[]>();
  for (const loc of detail.locations ?? []) {
    if (typeof loc?.destination_id !== "string") continue;
    const list = locationsByDest.get(loc.destination_id) ?? [];
    list.push(loc);
    locationsByDest.set(loc.destination_id, list);
  }

  // Vsaka unikatna destinacija pripeté enkrat na števec
  for (const destId of ids) {
    const dest = DESTINATIONS.find((d) => d.id === destId);
    if (!dest) continue;

    if (!pass.visitedRegions.includes(dest.region)) {
      pass.visitedRegions.push(dest.region);
    }

    const visits = locationsByDest.get(destId) ?? [];
    const visitCategory = visits.find((v) => typeof v.category === "string")?.category;

    if (isNatureVisit(dest, visitCategory)) pass.natureVisits += 1;
    if (isFoodVisit(dest, visitCategory)) pass.foodVisits += 1;
    if (isActivityVisit(dest, visitCategory)) pass.activityVisits += 1;
  }

  const newBadges = unlockBadges(pass);
  savePass(pass);
  notifyPass("🇸🇮 Slovenia Pass: +50 točk (AI načrt)");
  announceBadges(newBadges);
  return { pass, changed: true, newBadges };
}

/**
 * Obdelaj ogled destinacije (DestinationModal): obisk regije + bonus +10
 * za prvi ogled te destinacije (idempotentno).
 */
export function recordDestinationViewed(destinationId: string): PassMutationResult {
  const pass = loadPass();
  if (typeof destinationId !== "string" || pass.awardedDestinationIds.includes(destinationId)) {
    return { pass, changed: false, newBadges: [] };
  }

  const dest = DESTINATIONS.find((d) => d.id === destinationId);
  pass.awardedDestinationIds.push(destinationId);
  if (dest && !pass.visitedRegions.includes(dest.region)) {
    pass.visitedRegions.push(dest.region);
  }
  pass.points += 10;

  const newBadges = unlockBadges(pass);
  savePass(pass);
  notifyPass("🇸🇮 Slovenia Pass: +10 točk (nova destinacija)");
  announceBadges(newBadges);
  return { pass, changed: true, newBadges };
}

/**
 * Obdelaj ogled lokala (ListingModal): +5 točk + števec za "local" značko
 * (idempotentno per listing).
 */
export function recordListingViewed(listingId: string): PassMutationResult {
  const pass = loadPass();
  if (typeof listingId !== "string" || pass.viewedListingIds.includes(listingId)) {
    return { pass, changed: false, newBadges: [] };
  }

  pass.viewedListingIds.push(listingId);
  pass.points += 5;

  const newBadges = unlockBadges(pass);
  savePass(pass);
  notifyPass("🇸🇮 Slovenia Pass: +5 točk (lokalni ponudnik)");
  announceBadges(newBadges);
  return { pass, changed: true, newBadges };
}

// ============================================================================
// KATEGORIZACIJA OBISKOV (za števce značk)
// ============================================================================

function isNatureVisit(dest: Destination, visitCategory?: string): boolean {
  if (NATURE_TYPES.has(dest.type)) return true;
  if (dest.bestFor?.some((b) => b === "narava" || b === "mir")) return true;
  return typeof visitCategory === "string" && visitCategory === "activity-nature";
}

function isFoodVisit(dest: Destination, visitCategory?: string): boolean {
  if (dest.bestFor?.some((b) => FOOD_BEST_FOR.has(b))) return true;
  if (dest.activities?.some((a) => /degust|večerj|kosil|gastro|vinska/i.test(a))) return true;
  return visitCategory === "restaurant" || visitCategory === "bar";
}

function isActivityVisit(dest: Destination, visitCategory?: string): boolean {
  if (dest.bestFor?.some((b) => ACTIVITY_BEST_FOR.has(b))) return true;
  return visitCategory === "activity";
}
