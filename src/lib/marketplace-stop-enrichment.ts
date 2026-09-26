// ============================================================================
// ISSUE #11 (D1, 1.117.0) — TRŽNICA NA POSTANKU NAČRTA
// ----------------------------------------------------------------------------
// Mandat docs/COMPETITIVE-ANALYSIS.md §2/D1 + §4 priporočilo #6: »Realne cene
// v AI — poveži planer z dejanskimi cenami izkušenj (12 % provizija postane
// utemeljena)«. Po Issue #9 (ZERO-AI) je planer 100 % determinističen — ta
// modul ga poveže z REALNIMI cenami lastne tržnice (0 AI žetonov, čisti DB
// dotiki, isti destinationId-pri prostor kot kanonske destinacije).
//
// ARHITEKTURA (isti vzorec kot enrichWithRealWeather — fail-open obogatitev):
//   · ena findMany poizvedba na NAČRT (vsi edinstveni destination_id postankov);
//   · in-memory TTL predpomnilnik na destinacijo (tudi NULL je vrednost —
//     destinacija brez izkušenj se 5 min NE poizveduje znova);
//   · DB napaka → načrt NESPREMENJEN (fail-open: obogatitev je luksus, ne
//     pogoj — uporabnik nikoli ne vidi napake zaradi tržnice);
//   · ISKRENOST: fromPrice = min(pricePerPerson) je »od« cena (spodnja meja);
//     estimated_cost ostaja OCENA načrta (nikoli se ne prepiše); tržniška
//     cena se ne sešteva v NOBENO vedro (trip-budget nedotaknjen).
//
// ENOTA TESTIRANJA: čista domena (summarize/apply) + injektiran pridobivalec
// (kanon „NO mock.module" — glej issue11-marketplace-stop-enrichment.test.ts).
// ============================================================================

import { db } from "@/lib/db";
import type { Itinerary, StopMarketplaceInfo } from "@/lib/types";

/** Vrstica izkušnje, kot jo bere pridobivalec (podmnožica stolpcev). */
export interface MarketplaceExperienceRow {
  slug: string;
  name: string;
  destinationId: string | null;
  pricePerPerson: number;
  rating: number;
  reviewCount: number;
  verified: boolean;
  durationHours: number;
}

/** Pridobivalec izkušenj za dane destinacije (injektivno za teste). */
export type ExperienceResolver = (
  destinationIds: string[]
) => Promise<MarketplaceExperienceRow[]>;

/** Privzeti pridobivalec: published izkušnje teh destinacij (ena poizvedba). */
const defaultResolver: ExperienceResolver = async (destinationIds) => {
  if (destinationIds.length === 0) return [];
  return db.experience.findMany({
    where: {
      status: "published",
      destinationId: { in: destinationIds },
    },
    select: {
      slug: true,
      name: true,
      destinationId: true,
      pricePerPerson: true,
      rating: true,
      reviewCount: true,
      verified: true,
      durationHours: true,
    },
  });
};

// ── PREDPOMNILNIK (lokalni pomnilnik — projekt brez zunanjih storitev) ────
// TTL 5 min: tržnica živi pri upravitelju (CRUD), a vroče načrte ne smemo
// zadrževati na stale ceni predolgo. NULL je tudi vrednost (0 izkušenj —
// izklopi ponovne poizvedbe za prazne destinacije).

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  at: number;
  value: StopMarketplaceInfo | null;
}

const destinationCache = new Map<string, CacheEntry>();

/** Testna kuka: počisti predpomnilnik (determinizem med testi). */
export function clearMarketplaceCache(): void {
  destinationCache.clear();
}

function cachedSummary(destinationId: string): CacheEntry | null {
  const hit = destinationCache.get(destinationId);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    destinationCache.delete(destinationId);
    return null;
  }
  return hit;
}

// ── ČISTA DOMENA ───────────────────────────────────────────────────────────

/**
 * Povzetek izkušenj ENE destinacije (čista funkcija — deterministična).
 * Vrstni red izbire »top«: verified → rating → reviewCount → ime (AZ).
 * Vrača null pri 0 vrsticah (polje marketplace se NE pripne).
 */
export function summarizeDestinationExperiences(
  rows: MarketplaceExperienceRow[]
): StopMarketplaceInfo | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort(
    (a, b) =>
      Number(b.verified) - Number(a.verified) ||
      b.rating - a.rating ||
      b.reviewCount - a.reviewCount ||
      a.name.localeCompare(b.name, "sl")
  );
  const top = sorted[0];
  let fromPrice = rows[0].pricePerPerson;
  for (const r of rows) {
    if (r.pricePerPerson < fromPrice) fromPrice = r.pricePerPerson;
  }
  return {
    count: rows.length,
    fromPrice,
    currency: "EUR",
    top: {
      slug: top.slug,
      name: top.name,
      pricePerPerson: top.pricePerPerson,
      rating: top.rating,
      reviewCount: top.reviewCount,
      verified: top.verified,
      durationHours: top.durationHours,
    },
  };
}

/**
 * Pripni povzetke na postanke načrta (čista funkcija, NOVA struktura —
/// vhodni načrt se NE mutira). ISKRENOSTNI invariant: estimated_cost in
// vsa ostala polja postankov ostanejo BITNO-identična (testi pinirajo).
 */
export function applyMarketplaceToStops(
  itinerary: Itinerary,
  byDestination: ReadonlyMap<string, StopMarketplaceInfo | null>
): Itinerary {
  const days = itinerary.days.map((day) => ({
    ...day,
    locations: day.locations.map((visit) => {
      const summary = byDestination.get(visit.destination_id);
      if (!summary) return visit;
      return { ...visit, marketplace: summary };
    }),
  }));
  return { ...itinerary, days };
}

// ── GLAVNA FUNKCIJA (route klic) ───────────────────────────────────────────

/**
 * ISSUE #11: obogoti načrt s tržniškimi povzetki postankov (fail-open).
 * Ena poizvedba za manjkajoče destinacije; predpomnilnik za vroče;
 * DB napaka → načrt nespremenjen (ISTI kanon kot enrichWithRealWeather).
 */
export async function enrichWithMarketplaceExperiences(
  itinerary: Itinerary,
  opts: { resolve?: ExperienceResolver } = {}
): Promise<Itinerary> {
  const resolve = opts.resolve ?? defaultResolver;
  try {
    // Edinstveni destination_id-ji postankov (OSM kraji osm-node-* nimajo
    // izkušenj — poizvedba jih preprosto ne najde, iskreno brez polja).
    const ids = new Set<string>();
    for (const day of itinerary.days) {
      for (const visit of day.locations) {
        if (visit.destination_id) ids.add(visit.destination_id);
      }
    }

    const byDestination = new Map<string, StopMarketplaceInfo | null>();
    const toFetch: string[] = [];
    for (const id of ids) {
      const hit = cachedSummary(id);
      if (hit) {
        byDestination.set(id, hit.value);
      } else {
        toFetch.push(id);
      }
    }

    if (toFetch.length > 0) {
      const rows = await resolve(toFetch);
      const grouped = new Map<string, MarketplaceExperienceRow[]>();
      for (const row of rows) {
        const key = row.destinationId ?? "";
        const list = grouped.get(key);
        if (list) list.push(row);
        else grouped.set(key, [row]);
      }
      for (const id of toFetch) {
        const summary = summarizeDestinationExperiences(grouped.get(id) ?? []);
        byDestination.set(id, summary);
        destinationCache.set(id, { at: Date.now(), value: summary });
      }
    }

    return applyMarketplaceToStops(itinerary, byDestination);
  } catch (error) {
    // Fail-open: obogatitev je dodana vrednost, ne pogoj. Uporabnik DOBI
    // načrt brez tržniške plasti (isti kanon kot vreme — Issue #11 DoD).
    console.error("[marketplace-stop-enrichment] napaka (fail-open):", error);
    return itinerary;
  }
}
