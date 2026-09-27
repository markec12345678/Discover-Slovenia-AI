import { DESTINATIONS } from "@/lib/slovenia-data";
import { DESTINATIONS_EN } from "@/lib/slovenia-data-en";
import { getItDestination } from "@/lib/slovenia-data-it";
import { getDeDestination } from "@/lib/slovenia-data-de";
import { recomputeTotalBudget } from "@/lib/itinerary-quality";
import { reslotLocations } from "@/lib/schedule-slots";
import { PL, type PlannerLang } from "@/lib/planner-lang";
import type {
  DayPlan,
  Itinerary,
  LocationVisit,
  PlannerInput,
  QuickActionId,
  RefineChange,
} from "@/lib/types";
import {
  INDOOR_TYPES,
  NATURE_TYPES,
  ROAD_FACTOR,
  destinationById,
  dayDrivingKm,
  haversineKm,
  roadKmBetween,
} from "@/lib/stop-insights";

// ============================================================================
// REFINE ACTIONS (Faza 4-2) — "Prilagodi ta dan" prek obstoječega mehanizma
// ============================================================================
//
// NAMEN: šest hitrih akcij (Manj vožnje / Primerno za dež / Počasnejši tempo /
// Več narave / Več hrane / Za družino) deluje TUDI v determinističnem fallback
// načinu (danes edini način na produkciji — AI žeton ni nastavljen), ne da bi
// gradili nov AI sistem. Vse transformacije so čiste funkcije nad istim
// datasetom destinacij (koordinate, bestFor, bestSeason, tip) — enak vzorec
// poštenosti kot generateFallbackItinerary: NIč izmišljenih trditev, vsaka
// sprememba se poroča v `changes`.
//
// ISSUE #9 (ZERO-AI): prostojezikovni ukazi se razčlenijo
// DETERMINISTIČNO (src/lib/refine-command-parser.ts) in preslikajo na
// ISTO akcijo — 0 LLM klicev. Tri nove akcije (ceneje/dražje/bolj
// aktivno) pokrivajo zahtevane namene iz Issue #9 §7.
// ============================================================================

/** Kanonične akcije z večjezičnimi navodili (za AI ukaz + za toast; W1-2b-2: 4-jezično). */
export const QUICK_ACTIONS: {
  id: QuickActionId;
  label: { sl: string; en: string; it?: string; de?: string };
  instruction: {
    sl: (day: number) => string;
    en: (day: number) => string;
    it?: (day: number) => string;
    de?: (day: number) => string;
  };
}[] = [
  {
    id: "less_driving",
    label: { sl: "Manj vožnje", en: "Less driving", it: "Meno guida", de: "Weniger Fahrt" },
    instruction: {
      sl: (d) => `Dan ${d}: manj vožnje — združi geografsko bližje postanke in odstrani najbolj oddaljenega, če je dan preveč razpotegnjen.`,
      en: (d) => `Day ${d}: less driving — group geographically close stops together and drop the most distant one if the day is too stretched.`,
      it: (d) => `Giorno ${d}: meno guida — raggruppa le tappe geograficamente vicine ed elimina la più lontana se la giornata è troppo tirata.`,
      de: (d) => `Tag ${d}: weniger Fahrt — geografisch nahe Stopps bündeln und den entferntesten streichen, wenn der Tag zu gestreckt ist.`,
    },
  },
  {
    id: "rain_suitable",
    label: { sl: "Primerno za dež", en: "Rain-suitable", it: "Adatto alla pioggia", de: "Regentauglich" },
    instruction: {
      sl: (d) => `Dan ${d}: naredi dan primeren za dež — zamenjaj zunanje aktivnosti z notranjimi (jame, muzeji, terme, mestna jedra).`,
      en: (d) => `Day ${d}: make the day rain-suitable — swap outdoor activities for indoor ones (caves, museums, thermal spas, old towns).`,
      it: (d) => `Giorno ${d}: rendi la giornata adatta alla pioggia — sostituisci le attività all'aperto con interne (grotte, musei, terme, centri storici).`,
      de: (d) => `Tag ${d}: regentauglich machen — Outdoor-Aktivitäten durch Indoor tauschen (Höhlen, Museen, Thermen, Altstädte).`,
    },
  },
  {
    id: "slower_pace",
    label: { sl: "Počasnejši tempo", en: "Slower pace", it: "Ritmo più calmo", de: "Langsameres Tempo" },
    instruction: {
      sl: (d) => `Dan ${d}: počasnejši tempo — manj postankov, več časa na vsakem.`,
      en: (d) => `Day ${d}: slower pace — fewer stops, more time at each.`,
      it: (d) => `Giorno ${d}: ritmo più calmo — meno tappe, più tempo in ognuna.`,
      de: (d) => `Tag ${d}: langsameres Tempo — weniger Stopps, mehr Zeit an jedem.`,
    },
  },
  {
    id: "more_nature",
    label: { sl: "Več narave", en: "More nature", it: "Più natura", de: "Mehr Natur" },
    instruction: {
      sl: (d) => `Dan ${d}: več narave — zamenjaj vsaj en postanek z naravno destinacijo (jezero, gora, soteska, reka).`,
      en: (d) => `Day ${d}: more nature — swap at least one stop for a natural destination (lake, mountain, gorge, river).`,
      it: (d) => `Giorno ${d}: più natura — sostituisci almeno una tappa con una destinazione naturale (lago, montagna, gorge, fiume).`,
      de: (d) => `Tag ${d}: mehr Natur — tausche mindestens einen Stopp gegen ein Naturziel (See, Berg, Schlucht, Fluss).`,
    },
  },
  {
    id: "more_food",
    label: { sl: "Več hrane", en: "More food", it: "Più cibo", de: "Mehr Essen" },
    instruction: {
      sl: (d) => `Dan ${d}: več hrane in lokalne kulinarike — vključi postanek z gastronomskim poudarkom.`,
      en: (d) => `Day ${d}: more food and local cuisine — include a stop with a gastronomic focus.`,
      it: (d) => `Giorno ${d}: più cibo e cucina locale — includi una tappa con focus gastronomico.`,
      de: (d) => `Tag ${d}: mehr Essen und regionale Küche — nimm einen Stopp mit gastronomischem Fokus auf.`,
    },
  },
  {
    id: "family_friendly",
    label: { sl: "Za družino", en: "For families", it: "Adatto alle famiglie", de: "Familienfreundlich" },
    instruction: {
      sl: (d) => `Dan ${d}: naredi dan prijazen za družino z otroki — otrokom prijazni postanki, krajše vožnje.`,
      en: (d) => `Day ${d}: make the day family-friendly with kids — kid-friendly stops, shorter drives.`,
      it: (d) => `Giorno ${d}: rendi la giornata adatta alle famiglie con bambini — tappe kid-friendly, guidate più brevi.`,
      de: (d) => `Tag ${d}: familienfreundlich machen — kinderfreundliche Stopps, kürzere Fahrten.`,
    },
  },
  // ISSUE #9 §7 — tri nove DETERMINISTIČNE akcije (prosti jezik iz parserja):
  {
    id: "cheaper",
    label: { sl: "Ceneje", en: "Cheaper", it: "Più economico", de: "Günstiger" },
    instruction: {
      sl: (d) => `Dan ${d}: naredi dan cenejši — zamenjaj najdražji postanek z ustreznim cenejšim v istem območju.`,
      en: (d) => `Day ${d}: make the day cheaper — swap the most expensive stop for a suitable cheaper one in the same area.`,
      it: (d) => `Giorno ${d}: rendi la giornata più economica — sostituisci la tappa più costosa con una più economica adatta nella stessa zona.`,
      de: (d) => `Tag ${d}: günstiger machen — tausche den teuersten Stopp gegen einen passenden günstigeren im selben Gebiet.`,
    },
  },
  {
    id: "pricier",
    label: { sl: "Dražje", en: "Pricier", it: "Più premium", de: "Premium" },
    instruction: {
      sl: (d) => `Dan ${d}: naredi dan bolj premium — zamenjaj najcenejši postanek z bogatejšo izkušnjo v istem območju.`,
      en: (d) => `Day ${d}: make the day more premium — swap the cheapest stop for a richer experience in the same area.`,
      it: (d) => `Giorno ${d}: rendi la giornata più premium — sostituisci la tappa più economica con un'esperienza più ricca nella stessa zona.`,
      de: (d) => `Tag ${d}: hochwertiger machen — tausche den günstigsten Stopp gegen ein reicheres Erlebnis im selben Gebiet.`,
    },
  },
  {
    id: "more_active",
    label: { sl: "Bolj aktivno", en: "More active", it: "Più attivo", de: "Aktiver" },
    instruction: {
      sl: (d) => `Dan ${d}: bolj aktivno — zamenjaj vsaj en postanek z aktivnostjo (pohod, kolesarjenje, adrenalinski park, vodni športi).`,
      en: (d) => `Day ${d}: more active — swap at least one stop for an activity (hiking, cycling, adventure park, water sports).`,
      it: (d) => `Giorno ${d}: più attivo — sostituisci almeno una tappa con un'attività (trekking, cicloturismo, parco avventura, sport acquatici).`,
      de: (d) => `Tag ${d}: aktiver — tausche mindestens einen Stopp gegen eine Aktivität (Wandern, Radfahren, Abenteuerpark, Wassersport).`,
    },
  },
];

/** Prag (cestnih km na dan), nad katerim "manj vožnje" odstrani oddaljen postanek. */
const LONG_DAY_KM = 100;

/**
 * P0.3 (recenzija): največja cestna razdalja (km) od najbližjega ostalega
 * postanka dneva, da kandidat za zamenjavo šteje za "isto območje".
 * Poravnan z geo-validacijskim pragom legKm.warn (80 km): zamenjava NE SME
 * uvesti noge, ki bi jo validator sam označil kot opozorilo — popravek, ki
 * doda novo geografsko breme, ni popravek. Dnevu z enim samim postankom ni
 * s čim primerjati — geo-pogoj se preskoči (trivialna geografija).
 */
const CANDIDATE_MAX_KM = 80;

interface QuickActionResult {
  itinerary: Itinerary;
  changes: RefineChange[];
  /** Človeško berljiv povzetek sprememb (SL/EN) — za toast. */
  note: string;
}

/** Interesna ocena destinacije glede na interese potnika (ista logika kot fallback). */
function interestScore(dest: (typeof DESTINATIONS)[number], interests: string[]): number {
  return dest.bestFor.filter((b) => interests.includes(b)).length + dest.rating / 10;
}

/** Ali destinacija ustreza sezoni potovanja. */
function seasonFits(dest: (typeof DESTINATIONS)[number], season: PlannerInput["season"]): boolean {
  return dest.bestSeason.includes(season);
}

/**
 * Kandidati za zamenjavo: neuporabljeni, sezonsko ustrezni, najboljši interesni
 * ujem. P0.3 (recenzija): GEO-ZAVEDNO — kandidat mora biti v istem območju
 * (≤ CANDIDATE_MAX_KM do najbližjega ostalega postanka dneva), sicer zamenjava
 * ni popravek, ampak novo geografsko breme. Dnevu z enim samim postankom ni
 * s čim primerjati — geo-pogoj se preskoči (en postanek = trivialna geografija).
 */
function replacementCandidates(
  usedIds: Set<string>,
  input: Pick<PlannerInput, "interests" | "season">,
  filter: (d: (typeof DESTINATIONS)[number]) => boolean,
  nearTo: LocationVisit[],
  exclude?: LocationVisit
): (typeof DESTINATIONS)[number][] {
  return DESTINATIONS.filter(
    (d) =>
      !usedIds.has(d.id) &&
      seasonFits(d, input.season) &&
      filter(d) &&
      (nearTo.length === 0 ||
        (() => {
          const km = nearestOtherKm(d.id, nearTo, exclude ?? null);
          return km !== null && km <= CANDIDATE_MAX_KM;
        })())
  ).sort((a, b) => interestScore(b, input.interests) - interestScore(a, input.interests));
}

/** Zgradi LocationVisit iz destinacije (isti časovni okvir kot izvirnik;
 *  W1-2b-2: tagline v jeziku pogona — IT/DE overlayja iz faze 2a). */
function visitFrom(
  dest: (typeof DESTINATIONS)[number],
  original: LocationVisit,
  groupSize: number,
  lang: PlannerLang
): LocationVisit {
  const tagline =
    lang === "en"
      ? DESTINATIONS_EN[dest.id]?.tagline ?? dest.tagline
      : lang === "it"
        ? getItDestination(dest.id)?.tagline ?? dest.tagline
        : lang === "de"
          ? getDeDestination(dest.id)?.tagline ?? dest.tagline
          : dest.tagline;
  return {
    ...original,
    destination_id: dest.id,
    destination_name: dest.name,
    estimated_cost: dest.costPerPerson * groupSize,
    notes: tagline,
    reason: undefined,
  };
}

/** Prestavi časovne okvirje dneva v fiksni ritem 09:00/14:00 (kot fallback)
 *  — TASK 50 (§14, P1): z drive-aware vrzelmi. Prej je bil ritem fiksno
 *  9 + i*5 z vrzeljo TOČNO 1 h → schedule_gap ERROR, kadar je vožnja med
 *  zaporednima postankoma > 1 h. Zdaj reslotLocations (schedule-slots.ts)
 *  premakne začetek termina za (konzervativna vožnja + 30 min), če je to
 *  kasneje od predloge ritma. Koordinate: T1 dataset prednost (slotCoordsOf). */
function reslots(day: DayPlan): DayPlan {
  return {
    ...day,
    locations: reslotLocations(day.locations, {
      spacingH: 5,
      durationH: 4,
    }).map((loc) => ({ ...loc, duration: 4 })),
  };
}

/** Preračuna total_budget iz vseh dni (po odstranitvi/zamenjavi postankov) —
 * P0.2: skupni vir resnice je recomputeTotalBudget (itinerary-quality.ts). */
function recomputeBudget(it: Itinerary): Itinerary {
  return recomputeTotalBudget(it);
}

/**
 * P0.3 (recenzija): cestna razdalja med dvema ID-jema destinacij (null, če
 * kateri od ID-jev ni v datasetu — nikoli ne ugibamo).
 */
function roadKmBetweenIds(a: string, b: string): number | null {
  const da = destinationById(a);
  const db = destinationById(b);
  if (!da || !db) return null;
  return Math.round(
    haversineKm(da.coords.lat, da.coords.lng, db.coords.lat, db.coords.lng) *
      ROAD_FACTOR
  );
}

/**
 * P0.3 (recenzija): razdalja kandidata do NAJBLIŽJEGA ostalega postanka dneva
 * (null, če dneva ni s čim primerjati ali koordinate manjkajo).
 */
function nearestOtherKm(
  candidateId: string,
  dayLocations: LocationVisit[],
  exclude?: LocationVisit | null
): number | null {
  let best: number | null = null;
  for (const other of dayLocations) {
    if (exclude && other === exclude) continue;
    const km = roadKmBetweenIds(candidateId, other.destination_id);
    if (km !== null && (best === null || km < best)) best = km;
  }
  return best;
}

/**
 * P0.3 (recenzija): prvi postanek dneva, katerega destination_id NI v datasetu
 * (AI halucinacija) — nad takim dnevom akcija, ki računa iz koordinat/tipov,
 * ne sme "popravljati" brez podatkov (cannot_safely_transform).
 */
function unknownStopIn(day: DayPlan): LocationVisit | null {
  return day.locations.find((l) => !destinationById(l.destination_id)) ?? null;
}

/** Poštena opomba o nezmožnosti varne transformacije (4-jezično). */
function cannotTransformNote(
  reason: "missing_destination_data" | "no_nearby_alternative",
  day: number,
  lang: PlannerLang
): string {
  if (reason === "missing_destination_data") {
    return PL(lang, {
      sl: `Dan ${day}: za varno izvedbo te spremembe nimam dovolj preverjenih podatkov o postankih tega dne (neznan kraj) — ničesar nisem spremenil.`,
      en: `Day ${day}: I don't have enough verified data about this day's stops (an unknown destination) to safely make this change — nothing was modified.`,
      it: `Giorno ${day}: non ho abbastanza dati verificati sulle tappe di questo giorno (una destinazione sconosciuta) per fare questa modifica in sicurezza — non ho cambiato nulla.`,
      de: `Tag ${day}: Ich habe nicht genug geprüfte Daten zu den Stopps dieses Tages (unbekanntes Ziel), um diese Änderung sicher durchzuführen — nichts wurde geändert.`,
    });
  }
  return PL(lang, {
    sl: `Dan ${day}: nobena neuporabljena ustrezna destinacija ni dovolj blizu ostalim postankom tega dne (okvir ~${CANDIDATE_MAX_KM} km) — zamenjava oddaljene lokacije bi vožnjo le povečala, zato ničesar nisem spremenil.`,
    en: `Day ${day}: no suitable unused destination is close enough to this day's other stops (within ~${CANDIDATE_MAX_KM} km) — a far-away swap would only add driving, so nothing was changed.`,
    it: `Giorno ${day}: nessuna destinazione adatta non usata è abbastanza vicina alle altre tappe del giorno (entro ~${CANDIDATE_MAX_KM} km) — uno scambio lontano aggiungerebbe solo guida, quindi non ho cambiato nulla.`,
    de: `Tag ${day}: Kein passendes ungenutztes Ziel liegt nahe genug an den anderen Stopps des Tages (innerhalb ~${CANDIDATE_MAX_KM} km) — ein ferner Tausch würde nur Fahrt hinzufügen, deshalb wurde nichts geändert.`,
  });
}

/**
 * Najbolj oddaljen postanek dneva (max vsota razdalj do ostalih v dnevu).
 * Pri izenačenju razdalj (npr. dva postanka) pade tisti s ŠIBKEJŠIM
 * ujemanjem interesov — uporabnikov najljubši postanek ostane.
 */
function outlierIndex(
  day: DayPlan,
  interests: string[]
): number {
  if (day.locations.length < 2) return -1;
  let worst = -1;
  let worstKm = -1;
  let worstScore = Infinity;
  day.locations.forEach((loc, i) => {
    const others = day.locations.filter((_, j) => j !== i);
    const km = others.reduce(
      (s, o) => s + (roadKmBetween(o, loc) ?? 0),
      0
    );
    const dest = destinationById(loc.destination_id);
    const score = dest ? interestScore(dest, interests) : 0;
    if (km > worstKm || (km === worstKm && score < worstScore)) {
      worstKm = km;
      worstScore = score;
      worst = i;
    }
  });
  return worst;
}

/**
 * Uredi postanke dneva z najbližjim-sosedom (od prvega postanka) — čista
 * deterministična optimizacija zaporedja, brez spreminjanja vsebine.
 */
function reorderNearestNeighbour(day: DayPlan): DayPlan {
  if (day.locations.length < 3) return day;
  const remaining = [...day.locations];
  const ordered: LocationVisit[] = [remaining.shift()!];
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestKm = Infinity;
    remaining.forEach((cand, i) => {
      const km =
        roadKmBetween(last, cand) ??
        haversineKm(0, 0, 1, 1); // nedosegljive koordinate → konstantna
      if (km < bestKm) {
        bestKm = km;
        bestIdx = i;
      }
    });
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  return { ...day, locations: ordered };
}

/**
 * Izvede hitro akcijo nad določenim dnevom (deterministično, fallback pot).
 * Vrača kopijo itinererja + spremembe + opombo. Če ničesar ni mogoče spremeniti,
 * je `changes` prazen in opomba pove zakaj (pošteno).
 */
export function applyQuickAction(
  itinerary: Itinerary,
  input: PlannerInput,
  action: QuickActionId,
  day: number,
  lang: PlannerLang = "sl"
): QuickActionResult {
  const changes: RefineChange[] = [];

  const dayIdx = itinerary.days.findIndex((d) => d.day === day);
  if (dayIdx === -1) {
    return {
      itinerary,
      changes,
      note: PL(lang, {
        sl: "Ta dan ne obstaja.",
        en: "This day does not exist.",
        it: "Questo giorno non esiste.",
        de: "Dieser Tag existiert nicht.",
      }),
    };
  }

  const usedIds = new Set(
    itinerary.days.flatMap((d) => d.locations.map((l) => l.destination_id))
  );

  let target = itinerary.days[dayIdx];
  let note = "";

  switch (action) {
    // ------------------------------------------------------------------
    case "less_driving": {
      // P0.3 (recenzija): neznan postanek (AI halucinacija) → razdalj NI
      // mogoče preveriti → "manj vožnje" ne sme trditi izboljšave brez dokaza
      const unknown = unknownStopIn(target);
      if (unknown) {
        changes.push({
          kind: "cannot_transform",
          day,
          destination_id: unknown.destination_id,
          destination_name: unknown.destination_name,
          reason: "missing_destination_data",
        });
        return {
          itinerary,
          changes,
          note: cannotTransformNote("missing_destination_data", day, lang),
        };
      }

      const kmBefore = dayDrivingKm(target.locations) ?? 0;
      let removed: LocationVisit | null = null;

      if (target.locations.length >= 2 && kmBefore > LONG_DAY_KM) {
        const outlierI = outlierIndex(target, input.interests);
        if (outlierI >= 0) {
          removed = target.locations[outlierI];
          target = { ...target, locations: target.locations.filter((_, i) => i !== outlierI) };
          changes.push({
            kind: "stop_removed",
            day,
            destination_id: removed.destination_id,
            destination_name: removed.destination_name,
          });
        }
      }

      // Uredi ostanek po bližini (tudi ko ni bilo odstranitve)
      const reordered = reorderNearestNeighbour(target);
      if (
        reordered.locations.length === target.locations.length &&
        reordered.locations.some((l, i) => l.destination_id !== target.locations[i]?.destination_id)
      ) {
        target = reordered;
        changes.push({ kind: "day_reordered", day });
      }
      target = reslots(target);

      const kmAfter = dayDrivingKm(target.locations) ?? 0;
      if (removed) {
        note = PL(lang, {
          sl: `Odstranjen najbolj oddaljen postanek ${removed.destination_name} — dan ${day} ima zdaj ~${kmAfter} km vožnje namesto ~${kmBefore} km.`,
          en: `Removed ${removed.destination_name} (the most distant stop) — Day ${day} now has ~${kmAfter} km of driving instead of ~${kmBefore} km.`,
          it: `Rimossa la tappa più lontana ${removed.destination_name} — il giorno ${day} ora ha ~${kmAfter} km di guida invece di ~${kmBefore} km.`,
          de: `Entfernter entferntester Stopp ${removed.destination_name} — Tag ${day} hat jetzt ~${kmAfter} km Fahrt statt ~${kmBefore} km.`,
        });
      } else if (changes.some((c) => c.kind === "day_reordered")) {
        note = PL(lang, {
          sl: `Postanki dneva ${day} preurejeni v najkrajšo pot (~${kmAfter} km).`,
          en: `Reordered Day ${day} stops into the shortest route (~${kmAfter} km).`,
          it: `Tappe del giorno ${day} riordinate nel percorso più breve (~${kmAfter} km).`,
          de: `Stopps von Tag ${day} in die kürzeste Route umsortiert (~${kmAfter} km).`,
        });
      } else {
        note = PL(lang, {
          sl: `Dan ${day} ima že malo vožnje (~${kmBefore} km) — ničesar ni bilo treba odstraniti.`,
          en: `Day ${day} already has little driving (~${kmBefore} km) — nothing to remove.`,
          it: `Il giorno ${day} ha già poca guida (~${kmBefore} km) — nulla da eliminare.`,
          de: `Tag ${day} hat bereits wenig Fahrt (~${kmBefore} km) — nichts zu entfernen.`,
        });
      }
      break;
    }

    // ------------------------------------------------------------------
    case "rain_suitable": {
      // P0.3 (recenzija): neznan postanek → tipa (notranje/zunanje) ni mogoče
      // preveriti → dež-varnost dneva ni mogoče izvesti s preverljivimi podatki
      const unknown = unknownStopIn(target);
      if (unknown) {
        changes.push({
          kind: "cannot_transform",
          day,
          destination_id: unknown.destination_id,
          destination_name: unknown.destination_name,
          reason: "missing_destination_data",
        });
        return {
          itinerary,
          changes,
          note: cannotTransformNote("missing_destination_data", day, lang),
        };
      }

      // Zunanji postanki dneva (tip je znan — dataset)
      const outdoorCount = target.locations.filter((loc) => {
        const dest = destinationById(loc.destination_id);
        return dest ? !INDOOR_TYPES.has(dest.type) : false;
      }).length;

      if (outdoorCount === 0) {
        note = PL(lang, {
          sl: `Postanki dneva ${day} so že primerni za slabše vreme.`,
          en: `Day ${day} already has indoor-suitable stops.`,
          it: `Le tappe del giorno ${day} sono già adatte al maltempo.`,
          de: `Die Stopps von Tag ${day} sind bereits für Schlechtwetter geeignet.`,
        });
        break;
      }

      // P0.3 (recenzija): GEO-ZAVEDNI kandidati — zamenjava mora biti v istem
      // območju (≤ 80 km do najbližjega ostalega postanka dneva; prag
      // poravnan z legKm.warn — zamenjava ne sme uvesti novega opozorila)
      const replacements = replacementCandidates(
        usedIds,
        input,
        (d) => INDOOR_TYPES.has(d.type),
        target.locations
      );
      if (replacements.length === 0) {
        changes.push({
          kind: "cannot_transform",
          day,
          reason: "no_nearby_alternative",
        });
        return {
          itinerary,
          changes,
          note: cannotTransformNote("no_nearby_alternative", day, lang),
        };
      }

      const newLocs: LocationVisit[] = [];
      let swapCount = 0;

      for (const loc of target.locations) {
        const dest = destinationById(loc.destination_id);
        const isOutdoor = dest ? !INDOOR_TYPES.has(dest.type) : false;
        const candidate = isOutdoor ? replacements.shift() : undefined;
        if (isOutdoor && candidate) {
          newLocs.push(visitFrom(candidate, loc, input.groupSize, lang));
          changes.push({
            kind: "stop_replaced",
            day,
            destination_id: loc.destination_id,
            destination_name: loc.destination_name,
            replacement_id: candidate.id,
            replacement_name: candidate.name,
          });
          swapCount++;
        } else {
          newLocs.push(loc);
        }
      }
      target = { ...target, locations: newLocs };

      note = PL(lang, {
        sl: swapCount === 1
          ? `Zamenjan 1 zunanji postanek dneva ${day} z notranjo izbiro v bližini poti (jame, mestna jedra, terme).`
          : `Zamenjanih ${swapCount} zunanjih postankov dneva ${day} z notranjimi izbirami v bližini poti (jame, mestna jedra, terme).`,
        en: `Swapped ${swapCount} outdoor stop${swapCount > 1 ? "s" : ""} on Day ${day} for indoor picks near the day's route (caves, towns, thermal spas).`,
        it: swapCount === 1
          ? `Sostituita 1 tappa esterna del giorno ${day} con una scelta interna vicino al percorso (grotte, centri storici, terme).`
          : `Sostituite ${swapCount} tappe esterne del giorno ${day} con scelte interne vicino al percorso (grotte, centri storici, terme).`,
        de: swapCount === 1
          ? `1 Outdoor-Stopp von Tag ${day} gegen eine Indoor-Wahl nahe der Route getauscht (Höhlen, Altstädte, Thermen).`
          : `${swapCount} Outdoor-Stopps von Tag ${day} gegen Indoor-Wahlen nahe der Route getauscht (Höhlen, Altstädte, Thermen).`,
      });
      break;
    }

    // ------------------------------------------------------------------
    case "slower_pace": {
      if (target.locations.length >= 2) {
        // Obdrži najboljše interesno ujemano mesto, ostale odstrani
        const best = [...target.locations].sort((a, b) => {
          const da = destinationById(a.destination_id);
          const dbb = destinationById(b.destination_id);
          return (
            (dbb ? interestScore(dbb, input.interests) : 0) -
            (da ? interestScore(da, input.interests) : 0)
          );
        })[0];
        const removedLocs = target.locations.filter((l) => l !== best);
        target = {
          ...target,
          locations: [
            {
              ...best,
              time_slot: "09:00-17:00",
              duration: 8,
            },
          ],
        };
        removedLocs.forEach((l) =>
          changes.push({
            kind: "stop_removed",
            day,
            destination_id: l.destination_id,
            destination_name: l.destination_name,
          })
        );
        changes.push({ kind: "day_simplified", day });
        note = PL(lang, {
          sl: `Dan ${day} ima zdaj en sam postanek (${best.destination_name}) — ves dan na mirnejšem tempu.`,
          en: `Day ${day} now has a single stop (${best.destination_name}) with a full day at a calmer pace.`,
          it: `Il giorno ${day} ora ha una sola tappa (${best.destination_name}) — l'intera giornata a un ritmo più calmo.`,
          de: `Tag ${day} hat jetzt nur einen Stopp (${best.destination_name}) — der ganze Tag in ruhigerem Tempo.`,
        });
      } else {
        const loc = target.locations[0];
        target = {
          ...target,
          locations: loc
            ? [{ ...loc, time_slot: "09:00-17:00", duration: 8 }]
            : target.locations,
        };
        note = PL(lang, {
          sl: `Dan ${day} ima že en sam postanek — časovni okvir je razširjen na ves dan.`,
          en: `Day ${day} already has a single stop — the time slot was widened to the whole day.`,
          it: `Il giorno ${day} ha già una sola tappa — la fascia oraria è stata estesa all'intera giornata.`,
          de: `Tag ${day} hat bereits einen einzelnen Stopp — das Zeitfenster wurde auf den ganzen Tag erweitert.`,
        });
      }
      break;
    }

    // ------------------------------------------------------------------
    case "more_nature":
    case "more_food":
    case "family_friendly": {
      // P0.3 (recenzija): neznan postanek → oznak (narava/hrana/družina) ni
      // mogoče preveriti → zamenjava ne sme trditi ustreznosti brez podatkov
      const unknown = unknownStopIn(target);
      if (unknown) {
        changes.push({
          kind: "cannot_transform",
          day,
          destination_id: unknown.destination_id,
          destination_name: unknown.destination_name,
          reason: "missing_destination_data",
        });
        return {
          itinerary,
          changes,
          note: cannotTransformNote("missing_destination_data", day, lang),
        };
      }

      const tag =
        action === "more_food" ? "hrana" : action === "family_friendly" ? "družina" : null;

      // Filter kandidatov glede na akcijo (P0.3: geo-zavedno — v istem območju)
      const actionFilter =
        action === "more_nature"
          ? (d: (typeof DESTINATIONS)[number]) => NATURE_TYPES.has(d.type)
          : (d: (typeof DESTINATIONS)[number]) => d.bestFor.includes(tag!);

      // Postanki, ki NAJMANJ ustrezajo poudarku akcije (zunanji za naravo /
      // brez "hrana" / brez "družina") — najšibkejši interes je prvi kandidat
      // za zamenjavo
      const weaknessOf = (loc: LocationVisit): number => {
        const dest = destinationById(loc.destination_id);
        if (!dest) return Infinity;
        switch (action) {
          case "more_nature":
            return NATURE_TYPES.has(dest.type) ? interestScore(dest, input.interests) + 100 : 0;
          case "more_food":
            return dest.bestFor.includes("hrana") ? interestScore(dest, input.interests) + 100 : 0;
          default:
            return dest.bestFor.includes("družina") ? interestScore(dest, input.interests) + 100 : 0;
        }
      };

      const ordered = [...target.locations].sort((a, b) => weaknessOf(a) - weaknessOf(b));
      const swapTarget = ordered.find(
        (l) => weaknessOf(l) < 100 // ne menjaj postankov, ki že ustrezajo
      );

      if (!swapTarget) {
        note = PL(lang, {
          sl: `Dan ${day} že ustreza temu poudarku.`,
          en: `Day ${day} already matches this focus.`,
          it: `Il giorno ${day} risponde già a questo focus.`,
          de: `Tag ${day} entspricht diesem Schwerpunkt bereits.`,
        });
        break;
      }

      const candidates = replacementCandidates(
        usedIds,
        input,
        actionFilter,
        target.locations,
        swapTarget
      );

      if (candidates.length === 0) {
        // P0.3 (recenzija): loči "ni nobene alternative" od "alternative so,
        // a preveč oddaljene" — oboje je pošteno poročano, ničesar se ne ugiba
        const anyCandidate = DESTINATIONS.filter(
          (d) =>
            !usedIds.has(d.id) &&
            seasonFits(d, input.season) &&
            actionFilter(d)
        );
        const reason: "no_nearby_alternative" | "no_candidate" =
          anyCandidate.length > 0 ? "no_nearby_alternative" : "no_candidate";
        changes.push({ kind: "cannot_transform", day, reason });
        note =
          reason === "no_nearby_alternative"
            ? cannotTransformNote("no_nearby_alternative", day, lang)
            : PL(lang, {
                sl: `Za to zamenjavo ni več neuporabljene ustrezne destinacije.`,
                en: `No unused suitable destination is left for this swap.`,
                it: `Non resta nessuna destinazione adatta non usata per questo scambio.`,
                de: `Es ist kein passendes ungenutztes Ziel für diesen Tausch übrig.`,
              });
        break;
      }

      const cand = candidates[0];
      target = {
        ...target,
        locations: target.locations.map((l) =>
          l === swapTarget ? visitFrom(cand, l, input.groupSize, lang) : l
        ),
      };
      changes.push({
        kind: "stop_replaced",
        day,
        destination_id: swapTarget.destination_id,
        destination_name: swapTarget.destination_name,
        replacement_id: cand.id,
        replacement_name: cand.name,
      });
      note =
        action === "more_nature"
          ? PL(lang, {
              sl: `Zamenjan postanek ${swapTarget.destination_name} za ${cand.name} (naravna destinacija) v dnevu ${day}.`,
              en: `Swapped ${swapTarget.destination_name} for ${cand.name} (a natural destination) on Day ${day}.`,
              it: `Sostituita la tappa ${swapTarget.destination_name} con ${cand.name} (una destinazione naturale) nel giorno ${day}.`,
              de: `Stopp ${swapTarget.destination_name} gegen ${cand.name} (ein Naturziel) an Tag ${day} getauscht.`,
            })
          : action === "more_food"
          ? PL(lang, {
              sl: `Zamenjan postanek ${swapTarget.destination_name} za ${cand.name} (kulinarični postanek) v dnevu ${day}.`,
              en: `Swapped ${swapTarget.destination_name} for ${cand.name} (a food-focused stop) on Day ${day}.`,
              it: `Sostituita la tappa ${swapTarget.destination_name} con ${cand.name} (una tappa gastronomica) nel giorno ${day}.`,
              de: `Stopp ${swapTarget.destination_name} gegen ${cand.name} (ein Gastronomie-Stopp) an Tag ${day} getauscht.`,
            })
          : PL(lang, {
              sl: `Zamenjan postanek ${swapTarget.destination_name} za ${cand.name} (prijazen za družine) v dnevu ${day}.`,
              en: `Swapped ${swapTarget.destination_name} for ${cand.name} (family-friendly) on Day ${day}.`,
              it: `Sostituita la tappa ${swapTarget.destination_name} con ${cand.name} (adatta alle famiglie) nel giorno ${day}.`,
              de: `Stopp ${swapTarget.destination_name} gegen ${cand.name} (familienfreundlich) an Tag ${day} getauscht.`,
            });
      break;
    }

    // ------------------------------------------------------------------
    // ISSUE #9 §7 — CENEJE / DRAŽJE: zamenjava najdražjega (oziroma
    // najcenejšega) postanka dneva z ustreznim kandidatom V ISTEM območju
    // (CANDIDATE_MAX_KM) in ZAĐOSTNJENO ceno (strogo manjšo / večjo).
    // Deterministično, iz kanoničnih cen datasetta (costPerPerson).
    // ------------------------------------------------------------------
    case "cheaper":
    case "pricier": {
      const unknown = unknownStopIn(target);
      if (unknown) {
        changes.push({
          kind: "cannot_transform",
          day,
          destination_id: unknown.destination_id,
          destination_name: unknown.destination_name,
          reason: "missing_destination_data",
        });
        return {
          itinerary,
          changes,
          note: cannotTransformNote("missing_destination_data", day, lang),
        };
      }

      const wantCheaper = action === "cheaper";

      // Slabost: najdražji postanek (za ceneje) / najcenejši (za dražje).
      // Brez podatka o ceni destinacije (ni v datasetu) → ceni 0.
      const costOf = (loc: LocationVisit): number => {
        const dest = destinationById(loc.destination_id);
        return dest ? dest.costPerPerson : 0;
      };
      const ordered = [...target.locations].sort((a, b) =>
        wantCheaper ? costOf(b) - costOf(a) : costOf(a) - costOf(b)
      );
      // Preskoči postanke z ničelno ceno (ni kaj prihraniti /
      // nadgrajevati s kanoničnimi podatki) — iskrena meja.
      const swapTarget = ordered.find((l) => {
        const cost = costOf(l);
        return wantCheaper ? cost > 0 : cost >= 0 && destinationById(l.destination_id) !== undefined;
      });

      if (!swapTarget) {
        note = PL(lang, {
          sl: `Dan ${day} nima postanka z znano ceno za to prilagoditev.`,
          en: `Day ${day} has no stop with a known price for this adjustment.`,
          it: `Il giorno ${day} non ha una tappa con prezzo noto per questa modifica.`,
          de: `Tag ${day} hat keinen Stopp mit bekanntem Preis für diese Anpassung.`,
        });
        break;
      }
      const swapCost = costOf(swapTarget);

      const actionFilter = (d: (typeof DESTINATIONS)[number]) =>
        wantCheaper ? d.costPerPerson < swapCost : d.costPerPerson > swapCost;

      const candidates = replacementCandidates(
        usedIds,
        input,
        actionFilter,
        target.locations,
        swapTarget
      );

      if (candidates.length === 0) {
        const anyCandidate = DESTINATIONS.filter(
          (d) => !usedIds.has(d.id) && seasonFits(d, input.season) && actionFilter(d)
        );
        const reason: "no_nearby_alternative" | "no_candidate" =
          anyCandidate.length > 0 ? "no_nearby_alternative" : "no_candidate";
        changes.push({ kind: "cannot_transform", day, reason });
        note =
          reason === "no_nearby_alternative"
            ? cannotTransformNote("no_nearby_alternative", day, lang)
            : PL(lang, {
                sl: `Za to zamenjavo ni več neuporabljene ustrezne destinacije.`,
                en: `No unused suitable destination is left for this swap.`,
                it: `Non resta nessuna destinazione adatta non usata per questo scambio.`,
                de: `Es ist kein passendes ungenutztes Ziel für diesen Tausch übrig.`,
              });
        break;
      }

      const cand = candidates[0];
      target = {
        ...target,
        locations: target.locations.map((l) =>
          l === swapTarget ? visitFrom(cand, l, input.groupSize, lang) : l
        ),
      };
      changes.push({
        kind: "stop_replaced",
        day,
        destination_id: swapTarget.destination_id,
        destination_name: swapTarget.destination_name,
        replacement_id: cand.id,
        replacement_name: cand.name,
      });
      const diff = Math.abs(swapCost - cand.costPerPerson);
      note = wantCheaper
        ? PL(lang, {
            sl: `Zamenjan postanek ${swapTarget.destination_name} (€${swapCost}) za ${cand.name} (€${cand.costPerPerson}) v dnevu ${day} — prihranek €${diff} na osebo.`,
            en: `Swapped ${swapTarget.destination_name} (€${swapCost}) for ${cand.name} (€${cand.costPerPerson}) on Day ${day} — saves €${diff} per person.`,
            it: `Sostituita la tappa ${swapTarget.destination_name} (€${swapCost}) con ${cand.name} (€${cand.costPerPerson}) nel giorno ${day} — risparmio di €${diff} a persona.`,
            de: `Stopp ${swapTarget.destination_name} (€${swapCost}) gegen ${cand.name} (€${cand.costPerPerson}) an Tag ${day} getauscht — spart €${diff} pro Person.`,
          })
        : PL(lang, {
            sl: `Zamenjan postanek ${swapTarget.destination_name} (€${swapCost}) za ${cand.name} (€${cand.costPerPerson}) v dnevu ${day} — bogatejša izkušnja.`,
            en: `Swapped ${swapTarget.destination_name} (€${swapCost}) for ${cand.name} (€${cand.costPerPerson}) on Day ${day} — a richer experience.`,
            it: `Sostituita la tappa ${swapTarget.destination_name} (€${swapCost}) con ${cand.name} (€${cand.costPerPerson}) nel giorno ${day} — un'esperienza più ricca.`,
            de: `Stopp ${swapTarget.destination_name} (€${swapCost}) gegen ${cand.name} (€${cand.costPerPerson}) an Tag ${day} getauscht — ein reicheres Erlebnis.`,
          });
      break;
    }

    // ------------------------------------------------------------------
    // ISSUE #9 §7 — BOLJ AKTIVNO: ista družina kot več narave/hrane,
    // filter = destinacije z "aktivnosti" v bestFor.
    // ------------------------------------------------------------------
    case "more_active": {
      const unknown = unknownStopIn(target);
      if (unknown) {
        changes.push({
          kind: "cannot_transform",
          day,
          destination_id: unknown.destination_id,
          destination_name: unknown.destination_name,
          reason: "missing_destination_data",
        });
        return {
          itinerary,
          changes,
          note: cannotTransformNote("missing_destination_data", day, lang),
        };
      }

      const actionFilter = (d: (typeof DESTINATIONS)[number]) =>
        d.bestFor.includes("aktivnosti") || d.bestFor.includes("activities");

      const weaknessOf = (loc: LocationVisit): number => {
        const dest = destinationById(loc.destination_id);
        if (!dest) return Infinity;
        return actionFilter(dest)
          ? interestScore(dest, input.interests) + 100
          : 0;
      };

      const ordered = [...target.locations].sort((a, b) => weaknessOf(a) - weaknessOf(b));
      const swapTarget = ordered.find((l) => weaknessOf(l) < 100);

      if (!swapTarget) {
        note = PL(lang, {
          sl: `Dan ${day} že vsebuje postanek z aktivnostmi.`,
          en: `Day ${day} already has an activity-focused stop.`,
          it: `Il giorno ${day} contiene già una tappa con attività.`,
          de: `Tag ${day} enthält bereits einen Stopp mit Aktivitäten.`,
        });
        break;
      }

      const candidates = replacementCandidates(
        usedIds,
        input,
        actionFilter,
        target.locations,
        swapTarget
      );

      if (candidates.length === 0) {
        const anyCandidate = DESTINATIONS.filter(
          (d) =>
            !usedIds.has(d.id) &&
            seasonFits(d, input.season) &&
            actionFilter(d)
        );
        const reason: "no_nearby_alternative" | "no_candidate" =
          anyCandidate.length > 0 ? "no_nearby_alternative" : "no_candidate";
        changes.push({ kind: "cannot_transform", day, reason });
        note =
          reason === "no_nearby_alternative"
            ? cannotTransformNote("no_nearby_alternative", day, lang)
            : PL(lang, {
                sl: `Za to zamenjavo ni več neuporabljene ustrezne destinacije.`,
                en: `No unused suitable destination is left for this swap.`,
                it: `Non resta nessuna destinazione adatta non usata per questo scambio.`,
                de: `Es ist kein passendes ungenutztes Ziel für diesen Tausch übrig.`,
              });
        break;
      }

      const cand = candidates[0];
      target = {
        ...target,
        locations: target.locations.map((l) =>
          l === swapTarget ? visitFrom(cand, l, input.groupSize, lang) : l
        ),
      };
      changes.push({
        kind: "stop_replaced",
        day,
        destination_id: swapTarget.destination_id,
        destination_name: swapTarget.destination_name,
        replacement_id: cand.id,
        replacement_name: cand.name,
      });
      note = PL(lang, {
        sl: `Zamenjan postanek ${swapTarget.destination_name} za ${cand.name} (aktivna destinacija) v dnevu ${day}.`,
        en: `Swapped ${swapTarget.destination_name} for ${cand.name} (an active destination) on Day ${day}.`,
        it: `Sostituita la tappa ${swapTarget.destination_name} con ${cand.name} (una destinazione attiva) nel giorno ${day}.`,
        de: `Stopp ${swapTarget.destination_name} gegen ${cand.name} (ein aktives Ziel) an Tag ${day} getauscht.`,
      });
      break;
    }
  }

  const days = itinerary.days.map((d, i) => (i === dayIdx ? target : d));
  const result = recomputeBudget({ ...itinerary, days });

  return { itinerary: result, changes, note };
}
