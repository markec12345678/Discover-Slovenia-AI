// ============================================================================
// MEAL-STOPS — backlog #6 "Postanki za hrano na dolgih etapah" (1.25.0)
// ============================================================================
//
// MEM road-trip ugotovitev: "realize 6 hours in that lunch should've happened
// two hours ago" — bolečina ni pomanjkanje atrakcij, ampak ČASOVNO načrtovanje
// obroka med vožnjo. Zato je to SVETOVALNA plast (ne mutira načrta):
//
//  - sprožilec: najdaljša etapa dneva ≥ 75 min ALI skupna vožnja dneva
//    ≥ 120 min (backlog pravi "> 2 h" — za Slovenijo, kjer je najdaljša
//    diagonalna vožnja ~3 h in je povprečna etapa 30–60 min, je 75 min
//    realističen domači "long haul"; prag 120 min/dan ujame dneve z več
//    srednjimi etapami — pošteno dokumentirano)
//  - trije deterministični primeri iz LASTNIH podatkov (time_slot postankov
//    + OSRM/hevristika noge): prispesš prej → jej na cilju; odhajaš v kosilo
//    okviru → jej na izhodišču; sicer → kraj NA koridorju etape (≤ 12 km od
//    odseka, ista geometrija kot backlog #5) ob ≈ 12:30
//  - BREZ koridornega kraja → iskrena kartica (pojdi pred odhodom /
//    prigrizek, topel obrok šele na cilju ob ≈HH:MM)
//
// ISKRENOST (diferenciator, vir: JCB/MEM študije — "izmišljena imena
// restavracij" so značilna GenAI napaka): specialitete so REGIONALNE in
// KURIRANE (samo kjer obstaja preverljiva ikona: kremšnita–Bled,
// frika–Kobarid, gibanica–Prekmurje …), REDKE — destinacije brez ikone
// ostanejo brez čipov (prazno ≠ izmišljeno). NI imen lokalov, NI cen,
// NI odpiralnih ur — samo to, kar lahko dokazemo.

import { DESTINATIONS } from "@/lib/slovenia-data";
import { DESTINATION_COORDS, heuristicLeg, legKey } from "@/lib/road-routing";
import { haversineKm } from "@/lib/geo-corridor";
import type { Itinerary, LocationVisit } from "@/lib/types";

// ---------------------------------------------------------------------------
// Pragi (v minutah)
// ---------------------------------------------------------------------------

/** Etapa, ki šteje za "dolgo" (slovenska adaptacija backlogovega "> 2 h"). */
export const LONG_LEG_MIN = 75;
/** Skupna vožnja dneva, ki sproži predlog tudi brez ene dolge etape. */
export const DAY_DRIVE_MIN = 120;
/** Kosilo-okvir (minute od polnoči) — povprečen slovenski kosilo-okvir. */
const LUNCH_FROM_MIN = 11 * 60 + 30;
const LUNCH_TO_MIN = 14 * 60;
/** Priporočeni čas kosila sredi okvira. */
const LUNCH_SUGGESTED_MIN = 12 * 60 + 30;
/** Max odmik kraja od točke, kjer boš ob kosilu (~15 km ≈ 15 min ovinka —
 * mehka meja, km se prikaže pošteno). NE od celotnega odseka: glej 4c. */
const MEAL_CORRIDOR_KM = 15;

// ---------------------------------------------------------------------------
// Kurirane regionalne specialitete (SL/EN) — REDKE, preverljive ikone.
// Destinacija BREZ vnosa = brez čipov (iskreno). Brez lokalov/cen/ur.
// ---------------------------------------------------------------------------

export const MEAL_SPECIALTIES: Record<string, { sl: string[]; en: string[] }> =
  {
    bled: {
      sl: ["blejska kremšnita"],
      en: ["Bled cream cake (kremšnita)"],
    },
    bohinj: {
      sl: ["bohinjski sir"],
      en: ["Bohinj cheese"],
    },
    ljubljana: {
      sl: ["štruklji", "potica"],
      en: ["štruklji (rolled dumplings)", "potica (walnut roll)"],
    },
    postojna: {
      sl: ["kraški pršut", "jota"],
      en: ["Karst prosciutto", "jota (bean-sauerkraut stew)"],
    },
    piran: {
      sl: ["ribje specialitete", "sol iz Piranskih solin"],
      en: ["fresh fish", "Piran salt-pans salt"],
    },
    portoroz: {
      sl: ["ribje specialitete"],
      en: ["fresh fish"],
    },
    soca: {
      sl: ["soška postrv"],
      en: ["Soča trout"],
    },
    kobarid: {
      sl: ["frika", "soška postrv"],
      en: ["frika (potato-cheese dish)", "Soča trout"],
    },
    maribor: {
      sl: ["štajersko bučno olje", "vino od Stare trte"],
      en: ["Styrian pumpkin-seed oil", "wine (Old Vine region)"],
    },
    ptuj: {
      sl: ["štajersko bučno olje", "vinorodna štajerska vina"],
      en: ["Styrian pumpkin-seed oil", "local Styrian wines"],
    },
    "nova-gorica": {
      sl: ["vipavska vina"],
      en: ["Vipava Valley wines"],
    },
    "murska-sobota": {
      sl: ["prekmurska gibanica", "bujta repa"],
      en: ["Prekmurje layer cake (gibanica)", "bujta repa (stew)"],
    },
    lendava: {
      sl: ["prekmurska gibanica"],
      en: ["Prekmurje layer cake (gibanica)"],
    },
    "novo-mesto": {
      sl: ["cviček"],
      en: ["cviček (local wine)"],
    },
    otocec: {
      sl: ["cviček"],
      en: ["cviček (local wine)"],
    },
    crnomelj: {
      sl: ["belokranjska pogača"],
      en: ["Bela krajina flatbread (pogača)"],
    },
    rogaska: {
      sl: ["mineralna voda Rogaška"],
      en: ["Rogaška mineral water"],
    },
  };

/** Specialitete za destinacijo (prazna tabela = iskreno brez čipov). */
export function specialtiesFor(
  destId: string,
  lang: "sl" | "en"
): string[] {
  return MEAL_SPECIALTIES[destId]?.[lang] ?? [];
}

// ---------------------------------------------------------------------------
// Časovni pripomočki
// ---------------------------------------------------------------------------

/**
 * Pretvori "HH:MM-HH:MM" v minute od polnoči ({start, end}).
 * Ne-HP:MM oblike (starejši AI načrti, npr. "Jutro") → null — klicatelj
 * mora znati živeti brez časov (prikaže se brez ≈HH:MM).
 */
export function parseSlotHm(
  slot: string
): { start: number; end: number } | null {
  const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(slot.trim());
  if (!m) return null;
  const s = Number(m[1]) * 60 + Number(m[2]);
  const e = Number(m[3]) * 60 + Number(m[4]);
  if (e <= s) return null;
  return { start: s, end: e };
}

/** Minute od polnoči → "HH:MM". */
export function fmtHm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Predlog kosila za dan
// ---------------------------------------------------------------------------

export interface MealSuggestion {
  /** Dan načrta (1-based). */
  day: number;
  /** Etapa, na katero se predlog veže (zaporedna postanka dneva). */
  fromId: string;
  toId: string;
  /**
   * "arrive" — jej po prihodu na cilj · "depart" — jej pred odhodom ·
   * "enroute" — kraj na koridorju etape · "honest" — nič na poti,
   * iskrena navodila (prigrizek / počakaj na cilj).
   */
  kind: "arrive" | "depart" | "enroute" | "honest";
  /** Destinacija, kjer jej (arrive/depart/enroute; honest → cilj). */
  destId: string;
  destName: string;
  /** Odmik od odseka v km (samo enroute; drugače 0). */
  offRouteKm: number;
  /** Odhod s prejšnjega postanka (min od polnoči) — null, če slot neberljiv. */
  departMin: number | null;
  /** Prihod na naslednji postanek (min od polnoči) — null, če neberljiv. */
  arriveMin: number | null;
  /** Trajanje etape v min (OSRM ali hevristika — isti vir kot povezovalniki). */
  legMin: number;
  /** Skupna vožnja dneva v min (za kontekst "zakaj ta predlog"). */
  dayDriveMin: number;
}

/** Noga med zaporednima postankoma (isti vir kot PlannerStopLeg). */
function legOf(from: LocationVisit, to: LocationVisit, legs?: Itinerary["legs"]) {
  const leg = legs?.[legKey(from.destination_id, to.destination_id)];
  if (leg) return leg;
  const a = DESTINATION_COORDS.get(from.destination_id);
  const b = DESTINATION_COORDS.get(to.destination_id);
  if (!a || !b) return null;
  return heuristicLeg(a, b);
}

/**
 * Izračunaj predlog kosila za DAN načrta (največ enega).
 *
 * Deterministično, čisto, 0 omrežja — vse iz time_slot postankov in
 * serializiranih OSRM nog (stari načrti → hevristika, razkrit vir).
 */
export function pickMealStop(
  day: { day: number; locations: LocationVisit[] },
  legs?: Itinerary["legs"]
): MealSuggestion | null {
  const locs = day.locations;
  if (locs.length < 2) return null;

  // 1) vse etape dneva + skupna vožnja
  const stages: {
    from: LocationVisit;
    to: LocationVisit;
    min: number;
    km: number;
  }[] = [];
  let dayDriveMin = 0;
  for (let i = 1; i < locs.length; i++) {
    const leg = legOf(locs[i - 1], locs[i], legs);
    if (!leg) continue;
    stages.push({ from: locs[i - 1], to: locs[i], min: leg.min, km: leg.km });
    dayDriveMin += leg.min;
  }
  if (stages.length === 0) return null;

  // 2) sprožilec: najdaljša etapa ≥ LONG_LEG_MIN ali dan ≥ DAY_DRIVE_MIN
  const longest = stages.reduce((a, b) => (b.min > a.min ? b : a));
  if (longest.min < LONG_LEG_MIN && dayDriveMin < DAY_DRIVE_MIN) return null;

  // 3) izbira etape: tista, ki PREČKA kosilo-okvir; sicer najdaljša
  const crosses = stages.find((s) => {
    const dep = parseSlotHm(s.from.time_slot)?.end;
    if (dep === undefined) return false;
    const arr = dep + s.min;
    return dep < LUNCH_TO_MIN - 30 && arr > LUNCH_FROM_MIN;
  });
  const stage = crosses ?? longest;

  const fromSlot = parseSlotHm(stage.from.time_slot);
  const departMin = fromSlot ? fromSlot.end : null;
  const arriveMin = departMin !== null ? departMin + stage.min : null;

  const base = {
    day: day.day,
    fromId: stage.from.destination_id,
    toId: stage.to.destination_id,
    departMin,
    arriveMin,
    legMin: stage.min,
    dayDriveMin,
  };

  // 4a) prispesš v okviru kosila → jej na cilju
  if (arriveMin !== null && arriveMin <= LUNCH_TO_MIN) {
    return {
      ...base,
      kind: "arrive",
      destId: stage.to.destination_id,
      destName: stage.to.destination_name,
      offRouteKm: 0,
    };
  }

  // 4b) odhajaš v okviru kosila → jej pred odhodom
  if (departMin !== null && departMin >= LUNCH_FROM_MIN - 30) {
    return {
      ...base,
      kind: "depart",
      destId: stage.from.destination_id,
      destName: stage.from.destination_name,
      offRouteKm: 0,
    };
  }

  // 4c) vožnja prečka kosilo-okvir → kraj ob TOČKI, kjer boš ob ≈ 12:30
  //     (časovno-zavedni koridor: ulomek etape po času, ne celoten odsek —
  //     sicer bi za Maribor→Piran predlagali Portorož ob koncu poti.
  //     Ocena po premici (LegSummary nima geometrije), km se prikaže pošteno;
  //     neberljivi časi → sredina etape)
  const a = DESTINATION_COORDS.get(stage.from.destination_id);
  const b = DESTINATION_COORDS.get(stage.to.destination_id);
  if (a && b) {
    const f =
      departMin !== null
        ? Math.min(
            0.85,
            Math.max(0.15, (LUNCH_SUGGESTED_MIN - departMin) / stage.min)
          )
        : 0.5;
    const p = {
      lat: a.lat + f * (b.lat - a.lat),
      lng: a.lng + f * (b.lng - a.lng),
    };
    const distToP = (c: { lat: number; lng: number }) =>
      haversineKm(c.lat, c.lng, p.lat, p.lng);
    const corridor = DESTINATIONS.filter(
      (d) =>
        d.id !== stage.from.destination_id &&
        d.id !== stage.to.destination_id &&
        distToP(d.coords) <= MEAL_CORRIDOR_KM
    ).sort((x, y) => distToP(x.coords) - distToP(y.coords));
    const pick = corridor[0];
    if (pick) {
      return {
        ...base,
        kind: "enroute",
        destId: pick.id,
        destName: pick.name,
        offRouteKm: Math.round(distToP(pick.coords)),
      };
    }
  }

  // 4d) iskrena kartica: nič ni na poti — pojdi pred odhodom / prigrizek,
  //     topel obrok na cilju ob ≈ prihodu
  return {
    ...base,
    kind: "honest",
    destId: stage.to.destination_id,
    destName: stage.to.destination_name,
    offRouteKm: 0,
  };
}
