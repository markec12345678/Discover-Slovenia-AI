// ============================================================================
// ISSUE #24 — Sklop 6 (1.168.0): »TRAVEL BOOK LITE« — PDF POVZETEK POTI
// ----------------------------------------------------------------------------
// Polarstepsov Travel Book je plačljivi spominski izdelek; naša poštena
// različica je ČIST IZPIS obstoječih podatkov ob tiskanju deljene poti
// (/pot/[shareId] → Natisni → Shrani kot PDF). Ta modul je ČISTI DELIVEC
// statistike za tiskano platnico (cover): vse vrednosti izhajajo IZKLJUČNO
// iz itinererja in zabeleženih stroškov — NIČ izmišljenih vsebin.
//
// Kanon varoval (issue §17 — brez novega motorja + iskrenost P11):
//   - vsa polja so defenzivna nad neznanim JSON (stari shranjeni načrti,
//     ročno dodani postanki, pokvarjeni vnosi) → null/nejavna polja
//     preprosto IZPUSTIMO iz platnice (fail-closed, nikoli €0 ali "0 min"
//     za manjkajoče podatke);
//   - delivec je čista funkcija brez omrežja/stranskih učinkov — enaki
//     vhodi → enaka platnica (testno preverljivo);
//   - zdrobek km/vožnje: drivingMinutes najprej iz itinerary.quality
//     (FW4.1, lahko OSRM), sicer iz KANONSKE hevristike aplikacije
//     (heuristicLeg — isti vir kot povezovalnik plannerja in strežniški
//     PDF izvoz; ~ označba ocene v UI); nepoznana noga → izpust;
//   - datumska obsega: veljaven ISO tripStartDate + število dni
//     (tripEndDateISO iz trip-dates.ts — DST-varno); delivec vrne JEZIK-
//     neodvisen ISO par, formatiranje po jeziku (SL genitiv / EN) živi v
//     komponenti;
// ============================================================================

import type { Itinerary } from "@/lib/types";
import { parseISODateLocal, tripEndDateISO } from "@/lib/trip-dates";
// heuristicLeg = ČISTI kanon etape (haversineKm × ROAD_FACTOR 1,3 za km,
// km ÷ AVG_SPEED_KMH 55 × 60 za minute, round5) — ISTI vir številk kot
// povezovalnik PlannerStopLeg in strežniški PDF izvoz (road-routing).
import { heuristicLeg } from "@/lib/road-routing";

/** Zbroj stroškov iz tabele TripExpense (strežniški agregat; null = napaka
 *  poizvedbe ali prazen nabor → platnica ploščico izpusti). */
export interface ExpenseSummary {
  /** Vsota vseh zabeleženih stroškov v EUR (knjiženi + plačani). */
  totalEur: number;
  /** Število vnosov (prikazano kot »N vnosov«). */
  count: number;
}

/** Defenzivno preverjen znesek (EUR) — null, če ni končno število ≥ 0. */
function finiteEur(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Veljavna koordinata postanka (končni števili; 0,0 = null-island je
 *  neveljavna — boss referenčna točka je pomemben lažnji podatek). */
function validCoord(value: { lat?: unknown; lng?: unknown }): boolean {
  const { lat, lng } = value;
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

/**
 * Skupni čas vožnje (minute) — POŠTEN dvostopenjski vir:
 *  1. `itinerary.quality.drivingMinutes` (strukturirana metrika FW4.1 —
 *     lahko OSRM realne ceste), kadar obstaja in je veljavna;
 *  2. sicer KANONSKA HEVRISTIKA aplikacije (heuristicLeg po zaporednih
 *     postankih znotraj dneva — isti vir kot povezovalnik plannerja in
 *     strežniški PDF izvoz); ploščica tedaj nosi oznako ocene (~).
 *
 * FAIL-CLOSED: če KATERAKOLI noga nima znanih koordinat obeh postankov,
 * skupnega časa NE izmišljujemo → null (ploščica se izpusti).
 * (Dan z enim postankom nima nog — prispeva 0, kar je pošteno.)
 */
function computeDrivingMinutes(itinerary: Itinerary): number | null {
  const raw = (itinerary?.quality as { drivingMinutes?: unknown } | undefined)
    ?.drivingMinutes;
  if (
    typeof raw === "number" &&
    Number.isFinite(raw) &&
    raw > 0
  ) {
    return Math.round(raw);
  }

  const days = Array.isArray(itinerary?.days) ? itinerary.days : [];
  let total = 0;
  let known = false;
  for (const d of days) {
    const locations = Array.isArray(d?.locations) ? d.locations : [];
    for (let i = 1; i < locations.length; i++) {
      const a = locations[i - 1] as { lat?: unknown; lng?: unknown } | null;
      const b = locations[i] as { lat?: unknown; lng?: unknown } | null;
      if (!a || !b || !validCoord(a) || !validCoord(b)) {
        // nepoznana noga → skupek ne bi bil pošten (bi zanižal) → izpust
        return null;
      }
      total += heuristicLeg(
        { lat: a.lat as number, lng: a.lng as number },
        { lat: b.lat as number, lng: b.lng as number }
      ).min;
      known = true;
    }
  }
  return known ? Math.round(total) : null;
}
/**
 * Statistika tiskane platnice poti — ČISTO IZ PODATKOV.
 *
 * Vsa polja so namenoma `number | null`: null pomeni »podatka ni« in se
 * pripadajoča ploščica NE izriše (iskrena opustitev namesto izmišljene
 * vrednosti).
 */
export interface PrintCoverStats {
  /** Število dni načrta (vedno ≥ 1 — ekran je že preveril). */
  days: number;
  /** Skupno število postankov (vsota lokacij vseh dni). */
  stops: number;
  /** Skupni čas vožnje v minutah (quality > kanonska hevristika ~). */
  drivingMinutes: number | null;
  /** Seštevek estimated_cost vseh postankov (EUR) — sicer null. */
  estimatedCostEur: number | null;
  /** Zabeleženi stroški iz proračunske kartice (EUR) — sicer null. */
  expensesEur: number | null;
  /** Število zabeleženih stroškov (prikaz ob expensesEur). */
  expensesCount: number;
  /** Vir načrta (iskrena oznaka provenience — isti kanon kot hero
   *  glava in strežniški PDF izvoz); neznana vrednost → null (izpust). */
  source: "ai" | "fallback" | "deterministic" | null;
  /** Datumska obsega poti — validiran ISO par (start = dan 1, end = zadnji
   *  dan); JEZIK-neodvisen (formatiranje po jeziku živi v komponenti,
   *  ker ima SL genitivni kanon trip-dates, EN pa lastno obliko) — sicer
   *  null (neznan/neveljaven start). */
  tripDates: { start: string; end: string | null } | null;
}

/**
 * Izračun statistike platnice nad (že sanitiziranim) itinererjem.
 *
 * @param itinerary  shranjen načrt (days so na ekranu že prefiltrirani na
 *                   veljavne dneve z seznamom lokacij)
 * @param expenses   strežniški agregat TripExpense (null = poizvedba
 *                   spodletela → ploščica stroškov se izpusti)
 */
export function computePrintCoverStats(
  itinerary: Itinerary,
  expenses: ExpenseSummary | null
): PrintCoverStats {
  const days = Array.isArray(itinerary?.days) ? itinerary.days : [];

  // Postanki: samo objekti z veljavnim imenom se štejejo (defenzivno —
  // pokvarjen JSON ročno dodanih postankov ne napihne števca). Ocena
  // vstopnine se šteje SAMO za take veljavne postanke — števec in znesek
  // opisujeta ISTI nabor postankov, ki jih knjiga izpiše.
  let stops = 0;
  let costSum = 0;
  let costKnown = false;
  for (const d of days) {
    const locations = Array.isArray(d?.locations) ? d.locations : [];
    for (const loc of locations) {
      if (
        loc &&
        typeof loc === "object" &&
        typeof (loc as { destination_name?: unknown }).destination_name ===
          "string" &&
        (loc as { destination_name: string }).destination_name.length > 0
      ) {
        stops += 1;
        const cost = finiteEur(
          (loc as { estimated_cost?: unknown }).estimated_cost
        );
        if (cost !== null) {
          costSum += cost;
          costKnown = true;
        }
      }
    }
  }

  // Vožnja: POŠTEN dvostopenjski vir (quality > kanonska hevristika nad
  // koordinatami zaporednih postankov; nepoznana noga → null, glej
  // computeDrivingMinutes). Save sanitizacija quality ODSTRANI — zato v
  // praksi na /pot živi hevristična pot (~ označba v UI).
  const drivingMinutes = computeDrivingMinutes(itinerary);

  // Vir načrta — ISKRENA oznaka provenience (P11; hero glavo v printu
  // nadomesti platnica, zato vir živi TU). Defenzivno: samo znane
  // vrednosti, vse ostalo → null (brez izpisa).
  const rawSource = (itinerary as { source?: unknown })?.source;
  const source:
    | "ai"
    | "fallback"
    | "deterministic"
    | null =
    rawSource === "ai" ||
    rawSource === "fallback" ||
    rawSource === "deterministic"
      ? rawSource
      : null;

  // Datumska obsega: veljaven ISO start + dnevi (trip-dates kanon, DST-varno).
  // POZOR: ne uporabimo isValidStartDate (načrtovalnikova vrata — zavrača
  // pretekle datume): spomine tiskamo tudi PO končani poti, zato preverimo
  // SAMO razumljivost formata (parseISODateLocal). Vračamo JEZIK-NEODVISEN
  // ISO par — formatiranje po jeziku (SL genitiv / EN dolga oblika) živi v
  // komponenti platnice.
  let tripDates: { start: string; end: string | null } | null = null;
  const start = itinerary?.tripStartDate;
  if (
    typeof start === "string" &&
    start.length > 0 &&
    days.length > 0 &&
    parseISODateLocal(start) !== null
  ) {
    tripDates = { start, end: tripEndDateISO(start, days.length) };
  }

  return {
    days: days.length,
    stops,
    drivingMinutes,
    estimatedCostEur: costKnown ? Math.round(costSum * 100) / 100 : null,
    expensesEur:
      expenses && expenses.count > 0 && Number.isFinite(expenses.totalEur)
        ? Math.round(expenses.totalEur * 100) / 100
        : null,
    expensesCount: expenses?.count ?? 0,
    source,
    tripDates,
  };
}

/** Minute → berljiva duracija za platnico: „3 h 45 min" / „45 min". */
export function formatDrivingMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (!Number.isFinite(m) || m <= 0) return "";
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h <= 0) return `${rest} min`;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}
