import { DESTINATIONS } from "@/lib/slovenia-data";
import { DESTINATIONS_EN } from "@/lib/slovenia-data-en";
import { recomputeTotalBudget } from "@/lib/itinerary-quality";
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
// AI pot (ko je vklopljen) dobi ISTO akcijo kot naravnojezični ukaz —
// refine route pošlje instruction, AI pa ima polen kontekst.
// ============================================================================

/** Kanonične akcije z dvojezičnimi navodili (za AI ukaz + za toast). */
export const QUICK_ACTIONS: {
  id: QuickActionId;
  label: { sl: string; en: string };
  instruction: { sl: (day: number) => string; en: (day: number) => string };
}[] = [
  {
    id: "less_driving",
    label: { sl: "Manj vožnje", en: "Less driving" },
    instruction: {
      sl: (d) => `Dan ${d}: manj vožnje — združi geografsko bližje postanke in odstrani najbolj oddaljenega, če je dan preveč razpotegnjen.`,
      en: (d) => `Day ${d}: less driving — group geographically close stops together and drop the most distant one if the day is too stretched.`,
    },
  },
  {
    id: "rain_suitable",
    label: { sl: "Primerno za dež", en: "Rain-suitable" },
    instruction: {
      sl: (d) => `Dan ${d}: naredi dan primeren za dež — zamenjaj zunanje aktivnosti z notranjimi (jame, muzeji, terme, mestna jedra).`,
      en: (d) => `Day ${d}: make the day rain-suitable — swap outdoor activities for indoor ones (caves, museums, thermal spas, old towns).`,
    },
  },
  {
    id: "slower_pace",
    label: { sl: "Počasnejši tempo", en: "Slower pace" },
    instruction: {
      sl: (d) => `Dan ${d}: počasnejši tempo — manj postankov, več časa na vsakem.`,
      en: (d) => `Day ${d}: slower pace — fewer stops, more time at each.`,
    },
  },
  {
    id: "more_nature",
    label: { sl: "Več narave", en: "More nature" },
    instruction: {
      sl: (d) => `Dan ${d}: več narave — zamenjaj vsaj en postanek z naravno destinacijo (jezero, gora, soteska, reka).`,
      en: (d) => `Day ${d}: more nature — swap at least one stop for a natural destination (lake, mountain, gorge, river).`,
    },
  },
  {
    id: "more_food",
    label: { sl: "Več hrane", en: "More food" },
    instruction: {
      sl: (d) => `Dan ${d}: več hrane in lokalne kulinarike — vključi postanek z gastronomskim poudarkom.`,
      en: (d) => `Day ${d}: more food and local cuisine — include a stop with a gastronomic focus.`,
    },
  },
  {
    id: "family_friendly",
    label: { sl: "Za družino", en: "For families" },
    instruction: {
      sl: (d) => `Dan ${d}: naredi dan prijazen za družino z otroki — otrokom prijazni postanki, krajše vožnje.`,
      en: (d) => `Day ${d}: make the day family-friendly with kids — kid-friendly stops, shorter drives.`,
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

/** Zgradi LocationVisit iz destinacije (isti časovni okvir kot izvirnik). */
function visitFrom(
  dest: (typeof DESTINATIONS)[number],
  original: LocationVisit,
  groupSize: number,
  isEn: boolean
): LocationVisit {
  const tagline = isEn
    ? DESTINATIONS_EN[dest.id]?.tagline ?? dest.tagline
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

/** Prestavi časovne okvirje dneva nazaj v fiksni ritem 09:00/14:00 (kot fallback). */
function reslots(day: DayPlan): DayPlan {
  return {
    ...day,
    locations: day.locations.map((loc, i) => {
      const start = 9 + i * 5;
      return {
        ...loc,
        time_slot: `${String(start).padStart(2, "0")}:00-${String(start + 4).padStart(2, "0")}:00`,
        duration: 4,
      };
    }),
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

/** Poštena opomba o nezmožnosti varne transformacije (SL/EN). */
function cannotTransformNote(
  reason: "missing_destination_data" | "no_nearby_alternative",
  day: number,
  isEn: boolean
): string {
  if (reason === "missing_destination_data") {
    return isEn
      ? `Day ${day}: I don't have enough verified data about this day's stops (an unknown destination) to safely make this change — nothing was modified.`
      : `Dan ${day}: za varno izvedbo te spremembe nimam dovolj preverjenih podatkov o postankih tega dne (neznan kraj) — ničesar nisem spremenil.`;
  }
  return isEn
    ? `Day ${day}: no suitable unused destination is close enough to this day's other stops (within ~${CANDIDATE_MAX_KM} km) — a far-away swap would only add driving, so nothing was changed.`
    : `Dan ${day}: nobena neuporabljena ustrezna destinacija ni dovolj blizu ostalim postankom tega dne (okvir ~${CANDIDATE_MAX_KM} km) — zamenjava oddaljene lokacije bi vožnjo le povečala, zato ničesar nisem spremenil.`;
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
  lang: "sl" | "en" = "sl"
): QuickActionResult {
  const isEn = lang === "en";
  const changes: RefineChange[] = [];

  const dayIdx = itinerary.days.findIndex((d) => d.day === day);
  if (dayIdx === -1) {
    return {
      itinerary,
      changes,
      note: isEn ? "This day does not exist." : "Ta dan ne obstaja.",
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
          note: cannotTransformNote("missing_destination_data", day, isEn),
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
        note = isEn
          ? `Removed ${removed.destination_name} (the most distant stop) — Day ${day} now has ~${kmAfter} km of driving instead of ~${kmBefore} km.`
          : `Odstranjen najbolj oddaljen postanek ${removed.destination_name} — dan ${day} ima zdaj ~${kmAfter} km vožnje namesto ~${kmBefore} km.`;
      } else if (changes.some((c) => c.kind === "day_reordered")) {
        note = isEn
          ? `Reordered Day ${day} stops into the shortest route (~${kmAfter} km).`
          : `Postanki dneva ${day} preurejeni v najkrajšo pot (~${kmAfter} km).`;
      } else {
        note = isEn
          ? `Day ${day} already has little driving (~${kmBefore} km) — nothing to remove.`
          : `Dan ${day} ima že malo vožnje (~${kmBefore} km) — ničesar ni bilo treba odstraniti.`;
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
          note: cannotTransformNote("missing_destination_data", day, isEn),
        };
      }

      // Zunanji postanki dneva (tip je znan — dataset)
      const outdoorCount = target.locations.filter((loc) => {
        const dest = destinationById(loc.destination_id);
        return dest ? !INDOOR_TYPES.has(dest.type) : false;
      }).length;

      if (outdoorCount === 0) {
        note = isEn
          ? `Day ${day} already has indoor-suitable stops.`
          : `Postanki dneva ${day} so že primerni za slabše vreme.`;
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
          note: cannotTransformNote("no_nearby_alternative", day, isEn),
        };
      }

      const newLocs: LocationVisit[] = [];
      let swapCount = 0;

      for (const loc of target.locations) {
        const dest = destinationById(loc.destination_id);
        const isOutdoor = dest ? !INDOOR_TYPES.has(dest.type) : false;
        const candidate = isOutdoor ? replacements.shift() : undefined;
        if (isOutdoor && candidate) {
          newLocs.push(visitFrom(candidate, loc, input.groupSize, isEn));
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

      note = isEn
        ? `Swapped ${swapCount} outdoor stop${swapCount > 1 ? "s" : ""} on Day ${day} for indoor picks near the day's route (caves, towns, thermal spas).`
        : swapCount === 1
        ? `Zamenjan 1 zunanji postanek dneva ${day} z notranjo izbiro v bližini poti (jame, mestna jedra, terme).`
        : `Zamenjanih ${swapCount} zunanjih postankov dneva ${day} z notranjimi izbirami v bližini poti (jame, mestna jedra, terme).`;
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
        note = isEn
          ? `Day ${day} now has a single stop (${best.destination_name}) with a full day at a calmer pace.`
          : `Dan ${day} ima zdaj en sam postanek (${best.destination_name}) — ves dan na mirnejšem tempu.`;
      } else {
        const loc = target.locations[0];
        target = {
          ...target,
          locations: loc
            ? [{ ...loc, time_slot: "09:00-17:00", duration: 8 }]
            : target.locations,
        };
        note = isEn
          ? `Day ${day} already has a single stop — the time slot was widened to the whole day.`
          : `Dan ${day} ima že en sam postanek — časovni okvir je razširjen na ves dan.`;
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
          note: cannotTransformNote("missing_destination_data", day, isEn),
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
        note = isEn
          ? `Day ${day} already matches this focus.`
          : `Dan ${day} že ustreza temu poudarku.`;
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
            ? cannotTransformNote("no_nearby_alternative", day, isEn)
            : isEn
              ? `No unused suitable destination is left for this swap.`
              : `Za to zamenjavo ni več neuporabljene ustrezne destinacije.`;
        break;
      }

      const cand = candidates[0];
      target = {
        ...target,
        locations: target.locations.map((l) =>
          l === swapTarget ? visitFrom(cand, l, input.groupSize, isEn) : l
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
          ? isEn
            ? `Swapped ${swapTarget.destination_name} for ${cand.name} (a natural destination) on Day ${day}.`
            : `Zamenjan postanek ${swapTarget.destination_name} za ${cand.name} (naravna destinacija) v dnevu ${day}.`
          : action === "more_food"
          ? isEn
            ? `Swapped ${swapTarget.destination_name} for ${cand.name} (a food-focused stop) on Day ${day}.`
            : `Zamenjan postanek ${swapTarget.destination_name} za ${cand.name} (kulinarični postanek) v dnevu ${day}.`
          : isEn
          ? `Swapped ${swapTarget.destination_name} for ${cand.name} (family-friendly) on Day ${day}.`
          : `Zamenjan postanek ${swapTarget.destination_name} za ${cand.name} (prijazen za družine) v dnevu ${day}.`;
      break;
    }
  }

  const days = itinerary.days.map((d, i) => (i === dayIdx ? target : d));
  const result = recomputeBudget({ ...itinerary, days });

  return { itinerary: result, changes, note };
}
