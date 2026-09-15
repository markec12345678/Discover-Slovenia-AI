import { DESTINATIONS } from "@/lib/slovenia-data";
import { DESTINATIONS_EN } from "@/lib/slovenia-data-en";
import { legKey, type LegRouteIndex } from "@/lib/road-routing";
import type { Itinerary, LocationVisit, PlannerInput } from "@/lib/types";

// ============================================================================
// STOP INSIGHTS (Faza 4-1) — "Zakaj je to priporočeno?"
// ============================================================================
//
// NAČELO: razlaga postanka se sme opirati SAMO na dejanske podatke:
//   interes (bestFor ∩ interesi potnika), tip skupine (bestFor vsebuje
//   značko skupine), razdalja (haversine med koordinatama sosednjih
//   postankov), vreme (tip destinacije + deževen dan), sezona
//   (bestSeason vključuje sezono potovanja), praktični podatki
//   (trajanje/cena iz dataseta).
//
// NI marketinških fraz — vsaka vrstica je preverljiva iz vhodnih podatkov.
// Deterministično, jezikovno zavestno (sl/en), isto na serverju in clientu.
// ============================================================================

/** Cestni faktor — enak kot itinerary-quality (dejanske ceste so daljše). */
export const ROAD_FACTOR = 1.3;

/** Tipi destinacij, ki so v glavnem notranji (t12 / WEATHER-CONTEXT). */
export const INDOOR_TYPES = new Set(["cave", "spa", "city"]);

/** Tipi destinacij, ki štejejo kot narava (enako kot itinerary-quality). */
export const NATURE_TYPES = new Set([
  "lake",
  "mountain",
  "gorge",
  "cave",
  "river",
  "coast",
]);

/**
 * Datum zadnje vsebinske spremembe dataseta destinacij (git: sled sprememb
 * src/lib/slovenia-data.ts). Prikazuje se kot "posodobljeno" v praktičnih
 * podatkih — pošteno, ker datoteka res ni bila nazadnje spreminjena prej.
 */
export const DESTINATIONS_DATA_AS_OF = "2026-09-13";

/** Haversine razdalja med dvema točkama v km (enaka formula kot quality). */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Povezava destinacije po id (neodvisna od jezika — identifikatorji so skupni). */
export function destinationById(id: string) {
  return DESTINATIONS.find((d) => d.id === id);
}

/** Dejanska cestna razdalja (km) med dvema lokacijama itinererja.
 *  F5.6: z indeksom nog (OSRM) je to realna cestna razdalja; brez njega
 *  hevristika (haversine × 1,3). */
export function roadKmBetween(
  a: LocationVisit,
  b: LocationVisit,
  legs?: LegRouteIndex
): number | null {
  const da = destinationById(a.destination_id);
  const db = destinationById(b.destination_id);
  if (!da || !db) return null;
  const leg = legs?.get(legKey(a.destination_id, b.destination_id));
  if (leg) return leg.km;
  return Math.round(
    haversineKm(da.coords.lat, da.coords.lng, db.coords.lat, db.coords.lng) *
      ROAD_FACTOR
  );
}

/** Skupne cestne km enega dneva (zaporedne razdalje med postanki dneva). */
export function dayDrivingKm(
  locations: LocationVisit[]
): number | null {
  const km: number[] = [];
  for (let i = 1; i < locations.length; i++) {
    const d = roadKmBetween(locations[i - 1], locations[i]);
    if (d !== null) km.push(d);
  }
  if (km.length === 0) return null;
  return km.reduce((s, v) => s + v, 0);
}

/**
 * Vremenska ustreznost tipa destinacije — izključno iz tipa (ne izmišljeno):
 *   cave/spa → "indoor", city → "mixed" (mesto pokriva tudi notranje),
 *   ostalo (lake/mountain/gorge/river/coast/castle) → "outdoor".
 */
export function weatherSuitabilityOf(type: string): "indoor" | "mixed" | "outdoor" {
  if (type === "cave" || type === "spa") return "indoor";
  if (type === "city") return "mixed";
  return "outdoor";
}

// ---------------------------------------------------------------------------
// Razlaga postanka — sestava izključno iz dejstev
// ---------------------------------------------------------------------------

/** Značke skupin, ki jim destinacija dejansko ustreza (iz bestFor). */
const PARTY_TAG: Partial<Record<NonNullable<PlannerInput["partyType"]>, string>> = {
  couple: "romantika",
  family: "družina",
};

interface ReasonContext {
  /** Interesi potnika (input.interests). */
  interests: string[];
  /** Tip skupine (input.partyType) — opcijsko. */
  partyType?: PlannerInput["partyType"];
  /** Sezona potovanja (input.season). */
  season: PlannerInput["season"];
  /** Indeksi deževnih dni (iz sidrnih napovedi ali pogoja dneva). */
  rainyDays: Set<number>;
  /** Jezik razlage. */
  lang: "sl" | "en";
  /** F5.6: indeks nog (realne ceste, OSRM) — opcijsko; razdalje v razlagah
   *  so potem realne cestne razdalje. */
  legs?: LegRouteIndex;
}

const SEASON_LABELS: Record<string, { sl: string; en: string }> = {
  spring: { sl: "pomlad", en: "spring" },
  summer: { sl: "poletje", en: "summer" },
  autumn: { sl: "jesen", en: "autumn" },
  winter: { sl: "zima", en: "winter" },
};

/** Vrednosti interesov so SL (isti nabor kot INTERESTS) — za EN razlago
 *  se preslikajo v ustrezne angleške izraze (znani enum, ni prevajanja
 *  prostega besedila). F15: izvoženo — uporablja ga tudi quality card
 *  (meta vrstica na EN strani). */
export const INTEREST_LABELS_EN: Record<string, string> = {
  narava: "nature",
  kultura: "culture",
  hrana: "food & wine",
  avantura: "adventure",
  adrenalin: "adrenaline",
  romantika: "romance",
  "družina": "family",
  wellness: "wellness",
};

/**
 * Ali je dan "deževen" za namen razlage: bodisi sidrna napoved pove ≥ 60 %
 * padavin, bodisi (po enrichingu) pogoj dneva nosi dež (ključne besede).
 */
export function isRainyCondition(condition: string): boolean {
  const c = condition.toLowerCase();
  return (
    c.includes("dež") ||
    c.includes("rain") ||
    c.includes("drizzle") ||
    c.includes("shower") ||
    c.includes("neviht") ||
    c.includes("thunder") ||
    c.includes("sneg") ||
    c.includes("snow")
  );
}

/**
 * Sestavi razlago enega postanka (1 vrstica, ≤4 dejstva, brez marketinga).
 * Vrne null, če ni nobenega upravičenega dejstva (redko — skoraj vedno je
 * vsaj sezona ali razdalja).
 */
export function buildStopReason(
  visit: LocationVisit,
  dayIndex: number,
  previous: LocationVisit | null,
  nearestOther: LocationVisit | null,
  dayCondition: string,
  ctx: ReasonContext
): string | null {
  const dest = destinationById(visit.destination_id);
  if (!dest) return null;
  const isEn = ctx.lang === "en";
  const parts: string[] = [];

  // 1) Ujemani interesi (bestFor ∩ interesi potnika) — najmočnejše dejstvo
  const matched = dest.bestFor.filter((b) => ctx.interests.includes(b));
  if (matched.length > 0) {
    const shown = isEn
      ? matched.slice(0, 2).map((m) => INTEREST_LABELS_EN[m] ?? m)
      : matched.slice(0, 2);
    parts.push(
      isEn
        ? `matches your interests (${shown.join(", ")})`
        : `ugotavljen interes: ${shown.join(", ")}`
    );
  }

  // 2) Ustreznost tipu skupine — SAMO kadar bestFor dejansko vsebuje značko
  //    (P1-1: vir je vedno povedan — oznaka lokacije v podatkovnem naboru,
  //    ne ocena "to je odlično za družino")
  const partyTag = ctx.partyType ? PARTY_TAG[ctx.partyType] : undefined;
  if (partyTag && dest.bestFor.includes(partyTag)) {
    parts.push(
      ctx.partyType === "family"
        ? isEn
          ? "family-friendly (location tag)"
          : "primerno za družine (oznaka lokacije)"
        : isEn
        ? "suitable for couples (location tag)"
        : "primerno za pare (oznaka lokacije)"
    );
  }

  // 3) Razdalja — do prejšnjega postanka (ali najbližjega v dnevu).
  //    P1-1 (recenzija): to je IZRAČUN iz koordinat — haversine × 1,3 hevristika
  //    ali (F5.6) realna cestna razdalja iz indeksa nog (OSRM) — nikoli
  //    navigacijski podatek v realnem času; formulacija je eksplicitno približek.
  if (previous) {
    const km = roadKmBetween(previous, visit, ctx.legs);
    if (km !== null) {
      if (km <= 30) {
        parts.push(
          isEn ? `only ~${km} km from the previous stop` : `samo približno ${km} km od prejšnjega postanka`
        );
      } else if (km <= 70) {
        parts.push(
          isEn ? `~${km} km from the previous stop` : `približno ${km} km od prejšnjega postanka`
        );
      } else {
        // Pošteno opozorilo — to je točno vrzel, ki jo je odkril geo validator
        parts.push(
          isEn
            ? `~${km} km from the previous stop (long drive — consider adjusting this day)`
            : `približno ${km} km od prejšnjega postanka (daljša vožnja — razmisli o prilagoditvi dneva)`
        );
      }
    }
  } else if (nearestOther) {
    const km = roadKmBetween(nearestOther, visit, ctx.legs);
    if (km !== null && km <= 25) {
      parts.push(
        isEn ? "close to the other stops of this day" : "blizu ostalih postankov tega dneva"
      );
    }
  }

  // 4) Vreme — notranja izbira na deževen dan (pozitivno), zunanja na deževen dan (opozorilo)
  const rainy = ctx.rainyDays.has(dayIndex) || isRainyCondition(dayCondition);
  const suitability = weatherSuitabilityOf(dest.type);
  if (rainy && suitability === "indoor") {
    parts.push(
      isEn ? "indoor — fine even in bad weather" : "notranja izbira — uporabna tudi ob dežju"
    );
  } else if (rainy && suitability === "outdoor") {
    parts.push(
      isEn
        ? "outdoor — check the forecast for this day"
        : "zunanja aktivnost — za ta dan preveri vreme"
    );
  }

  // 5) Sezona (samo če je v sezoni in ni že pokrito z drugim dejstvom)
  if (parts.length < 4 && dest.bestSeason.includes(ctx.season)) {
    const lbl = SEASON_LABELS[ctx.season]?.[ctx.lang] ?? ctx.season;
    parts.push(isEn ? `in season (${lbl})` : `v sezoni (${lbl})`);
  }

  if (parts.length === 0) return null;
  return parts.slice(0, 4).join(" · ");
}

/**
 * Obogoti VSE postanke itinererja s poljem `reason` (in-place na kopiji).
 * Uporablja se na serverju (AI + fallback pot) in spročno na clientu po
 * refine-u. Dejevni dnevi se določijo iz rainyDays + pogoja dneva.
 */
export function buildStopReasons(
  itinerary: Itinerary,
  input: Pick<
    PlannerInput,
    "interests" | "season" | "partyType" | "language"
  >,
  lang: "sl" | "en" = "sl",
  /** F5.6: indeks nog (realne ceste, OSRM) — opcijsko; brez njega hevristika. */
  legs?: LegRouteIndex
): Itinerary {
  const rainyDays = new Set<number>();
  const ctx: ReasonContext = {
    interests: input.interests,
    partyType: input.partyType,
    season: input.season,
    rainyDays,
    lang,
    legs,
  };

  // Deževni dnevi iz pogoja (po enrichingu z realno napovedjo)
  itinerary.days.forEach((d, i) => {
    if (isRainyCondition(d.weather?.condition ?? "")) rainyDays.add(i);
  });

  const days = itinerary.days.map((day, dayIdx) => {
    const dayCondition = day.weather?.condition ?? "";
    const locations = day.locations.map((loc, locIdx) => {
      const previous = locIdx > 0 ? day.locations[locIdx - 1] : null;
      const nearestOther =
        day.locations.length > 1
          ? day.locations
              .map((other) => ({ other, km: roadKmBetween(other, loc, legs) }))
              .filter((x) => x.km !== null)
              .sort((a, b) => (a.km ?? 0) - (b.km ?? 0))[0]?.other ?? null
          : null;
      const reason = buildStopReason(
        loc,
        dayIdx,
        previous,
        nearestOther,
        dayCondition,
        ctx
      );
      return reason ? { ...loc, reason } : loc;
    });
    return { ...day, locations };
  });

  return { ...itinerary, days };
}

/** Trajanje destinacije v jeziku prikaza (SL dataset / EN prekrivna plast). */
export function durationLabelFor(id: string, lang: "sl" | "en"): string | null {
  const d = destinationById(id);
  if (!d) return null;
  if (lang === "en") return DESTINATIONS_EN[id]?.duration ?? d.duration;
  return d.duration;
}
