import { DESTINATIONS } from "@/lib/slovenia-data";
import { getItDestination } from "@/lib/slovenia-data-it";
import { getDeDestination } from "@/lib/slovenia-data-de";
import { PL } from "@/lib/planner-lang";
import { DESTINATIONS_EN } from "@/lib/slovenia-data-en";
import { legKey, type LegRouteIndex } from "@/lib/road-routing";
import {
  ROAD_FACTOR as GEO_ROAD_FACTOR,
  haversineKm as geoHaversineKm,
} from "@/lib/geo-distance";
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

/** Cestni faktor — enak kot itinerary-quality (dejanske ceste so daljše).
 *  T5-b1/H2: vrednost živi v src/lib/geo-distance.ts (en vir resnice);
 *  re-izvoz ohranja obstoječe uvoze (refine-actions idr.). */
export const ROAD_FACTOR = GEO_ROAD_FACTOR;

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
 * ISSUE #4 §18 (VAL 7): konstanta je PRESELJENA v lib/destination-provenance.ts
 * (enotna točka resnice §18 + varovalka testov proti zastaranju — prejšnja
 * vrednost "2026-09-13" je bila 7 dni neresnična, TASK 62 jo je prehitel).
 * Re-izvoz ohranja obstoječe uvoze (stop-insights komponenta, /vir-podatkov).
 */
export { DESTINATIONS_DATA_AS_OF } from "@/lib/destination-provenance";

/** Haversine razdalja med dvema točkama v km (enaka formula kot quality).
 *  T5-b1/H2: telo je preseljeno v src/lib/geo-distance.ts; 4-skalarna
 *  izvožena podpis OSTAJA (nazaj kompatibilno za pins-ingest idr.). */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  return geoHaversineKm({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });
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
  /** Jezik razlage (W1-faza-2b: 4-jezično). */
  lang: "sl" | "en" | "it" | "de";
  /** F5.6: indeks nog (realne ceste, OSRM) — opcijsko; razdalje v razlagah
   *  so potem realne cestne razdalje. */
  legs?: LegRouteIndex;
}

// W1-faza-2b: 4-jezične sezonske oznake (PL vzorec)
const SEASON_LABELS: Record<string, { sl: string; en: string; it: string; de: string }> = {
  spring: { sl: "pomlad", en: "spring", it: "primavera", de: "Frühjahr" },
  summer: { sl: "poletje", en: "summer", it: "estate", de: "Sommer" },
  autumn: { sl: "jesen", en: "autumn", it: "autunno", de: "Herbst" },
  winter: { sl: "zima", en: "winter", it: "inverno", de: "Winter" },
};

/** Vrednosti interesov so SL (isti nabor kot INTERESTS) — za EN razlago
 *  se preslikajo v ustrezne angleške izraze (znani enum, ni prevajanja
 *  prostega besedila). F15: izvoženo — uporablja ga tudi quality card
 *  (meta vrstica na EN strani). */
/** W1-faza-2b: IT preslikave interesov (isti kanonični enum). */
export const INTEREST_LABELS_IT: Record<string, string> = {
  narava: "natura",
  kultura: "cultura",
  hrana: "gastronomia",
  avantura: "avventura",
  adrenalin: "adrenalina",
  romantika: "romanticismo",
  družina: "famiglia",
  wellness: "benessere",
};

/** W1-faza-2b: DE preslikave interesov (isti kanonični enum). */
export const INTEREST_LABELS_DE: Record<string, string> = {
  narava: "Natur",
  kultura: "Kultur",
  hrana: "Essen & Wein",
  avantura: "Abenteuer",
  adrenalin: "Adrenalin",
  romantika: "Romantik",
  družina: "Familie",
  wellness: "Wellness",
};

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
  const lang = ctx.lang;
  const parts: string[] = [];

  // 1) Ujemani interesi (bestFor ∩ interesi potnika) — najmočnejše dejstvo
  // W1-faza-2b: 4-jezično (interest oznake prek lastnih IT/DE preslikav)
  const matched = dest.bestFor.filter((b) => ctx.interests.includes(b));
  if (matched.length > 0) {
    const shown = matched.slice(0, 2).map((m) => {
      if (lang === "en") return INTEREST_LABELS_EN[m] ?? m;
      if (lang === "it") return INTEREST_LABELS_IT[m] ?? m;
      if (lang === "de") return INTEREST_LABELS_DE[m] ?? m;
      return m;
    });
    parts.push(
      PL(lang, {
        sl: `ugotavljen interes: ${shown.join(", ")}`,
        en: `matches your interests (${shown.join(", ")})`,
        it: `corrisponde ai tuoi interessi (${shown.join(", ")})`,
        de: `passt zu deinen Interessen (${shown.join(", ")})`,
      })
    );
  }

  // 2) Ustreznost tipu skupine — SAMO kadar bestFor dejansko vsebuje značko
  //    (P1-1: vir je vedno povedan — oznaka lokacije v podatkovnem naboru,
  //    ne ocena "to je odlično za družino")
  const partyTag = ctx.partyType ? PARTY_TAG[ctx.partyType] : undefined;
  if (partyTag && dest.bestFor.includes(partyTag)) {
    parts.push(
      ctx.partyType === "family"
        ? PL(lang, {
            sl: "primerno za družine (oznaka lokacije)",
            en: "family-friendly (location tag)",
            it: "adatto alle famiglie (etichetta della località)",
            de: "familienfreundlich (Ortskennzeichnung)",
          })
        : PL(lang, {
            sl: "primerno za pare (oznaka lokacije)",
            en: "suitable for couples (location tag)",
            it: "adatto alle coppie (etichetta della località)",
            de: "geeignet für Paare (Ortskennzeichnung)",
          })
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
          PL(lang, {
            sl: `samo približno ${km} km od prejšnjega postanka`,
            en: `only ~${km} km from the previous stop`,
            it: `solo ~${km} km dalla tappa precedente`,
            de: `nur ~${km} km vom vorherigen Stopp`,
          })
        );
      } else if (km <= 70) {
        parts.push(
          PL(lang, {
            sl: `približno ${km} km od prejšnjega postanka`,
            en: `~${km} km from the previous stop`,
            it: `~${km} km dalla tappa precedente`,
            de: `~${km} km vom vorherigen Stopp`,
          })
        );
      } else {
        // Pošteno opozorilo — to je točno vrzel, ki jo je odkril geo validator
        parts.push(
          PL(lang, {
            sl: `približno ${km} km od prejšnjega postanka (daljša vožnja — razmisli o prilagoditvi dneva)`,
            en: `~${km} km from the previous stop (long drive — consider adjusting this day)`,
            it: `~${km} km dalla tappa precedente (lunga tratta — valuta di adeguare questa giornata)`,
            de: `~${km} km vom vorherigen Stopp (lange Fahrt — erwäge, diesen Tag anzupassen)`,
          })
        );
      }
    }
  } else if (nearestOther) {
    const km = roadKmBetween(nearestOther, visit, ctx.legs);
    if (km !== null && km <= 25) {
      parts.push(
        PL(lang, {
          sl: "blizu ostalih postankov tega dneva",
          en: "close to the other stops of this day",
          it: "vicino alle altre tappe di questa giornata",
          de: "nah an den anderen Stopps dieses Tages",
        })
      );
    }
  }

  // 4) Vreme — notranja izbira na deževen dan (pozitivno), zunanja na deževen dan (opozorilo)
  const rainy = ctx.rainyDays.has(dayIndex) || isRainyCondition(dayCondition);
  const suitability = weatherSuitabilityOf(dest.type);
  if (rainy && suitability === "indoor") {
    parts.push(
      PL(lang, {
        sl: "notranja izbira — uporabna tudi ob dežju",
        en: "indoor — fine even in bad weather",
        it: "al chiuso — adatto anche con il brutto tempo",
        de: "innen — auch bei schlechtem Wetter geeignet",
      })
    );
  } else if (rainy && suitability === "outdoor") {
    parts.push(
      PL(lang, {
        sl: "zunanja aktivnost — za ta dan preveri vreme",
        en: "outdoor — check the forecast for this day",
        it: "all'aperto — controlla le previsioni per questa giornata",
        de: "im Freien — prüfe die Vorhersage für diesen Tag",
      })
    );
  }

  // 5) Sezona (samo če je v sezoni in ni že pokrito z drugim dejstvom)
  if (parts.length < 4 && dest.bestSeason.includes(ctx.season)) {
    const lbl = PL(ctx.lang, {
      sl: SEASON_LABELS[ctx.season]?.sl ?? ctx.season,
      en: SEASON_LABELS[ctx.season]?.en ?? ctx.season,
      it: SEASON_LABELS[ctx.season]?.it ?? ctx.season,
      de: SEASON_LABELS[ctx.season]?.de ?? ctx.season,
    });
    parts.push(
      PL(ctx.lang, {
        sl: `v sezoni (${lbl})`,
        en: `in season (${lbl})`,
        it: `di stagione (${lbl})`,
        de: `in der Saison (${lbl})`,
      })
    );
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
  lang: "sl" | "en" | "it" | "de" = "sl",
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

/**
 * Trajanje destinacije v jeziku prikaza (SL dataset / EN prekrivna plast).
 * W1-faza-2b: IT/DE prekrivni plasti (faza 2a) z EN dedovanjem.
 */
export function durationLabelFor(
  id: string,
  lang: "sl" | "en" | "it" | "de"
): string | null {
  const d = destinationById(id);
  if (!d) return null;
  if (lang === "en") return DESTINATIONS_EN[id]?.duration ?? d.duration;
  if (lang === "it") return getItDestination(id)?.duration ?? DESTINATIONS_EN[id]?.duration ?? d.duration;
  if (lang === "de") return getDeDestination(id)?.duration ?? DESTINATIONS_EN[id]?.duration ?? d.duration;
  return d.duration;
}
