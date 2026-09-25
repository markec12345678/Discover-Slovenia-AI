// ============================================================================
// CROWD-ALTERNATIVES (t10) — poštene alternative ob gneči: "kam namesto tja"
// ============================================================================
//
// NAČELO (isto kot trip-dates.ts / itinerary-quality.ts): VSE čiste,
// deterministične funkcije — isto obnašanje na serverju (API) in clientu.
//
// POŠTENOST (uporabnikovo lastno pravilo: "ne izmišljaj statusov"):
// NO live pretok obiskovalcev ne obstaja — zato NE trdimo "danes je zaseden".
// Trdimo le uredniško, javno dokumentirano dejstvo: najobiskanejše točke
// Slovenije so julija in avgusta OB VIKENDIH običajno zelo obiskane
// (Bled, Vintgarska soteska z urejenimi termini vstopov, Postojnska jama
// kot najbolj obiskana jama Evrope, Piran s kamnitim starim mestom,
// ljubljansko staro mestno jedro). To je konservativna trditev o vzorcu
// obiskanosti — in točno to razbremenitveno sporočilo izrecno nosi
// slovenska turistična strategija (alternativne, manj obiskane destinacije).
//
// Alternative se izračunajo IZ obstoječih podatkov destinacij: bližina
// (haversine iz coords), sezonska ustreznost in ujemanje interesov potnika
// (bestFor) — brez izmišljenih metapodatkov.

import { DESTINATIONS } from "@/lib/slovenia-data";
import type { Itinerary, PlannerInput, CrowdNotice, CrowdAlternative } from "@/lib/types";
import { dayISOForDayNumber } from "@/lib/trip-dates";
import { haversineKm } from "@/lib/geo-distance";

/**
 * Destinacije z javno dokumentiranim vrhunskim obiskovalnim pritiskom.
 *
 * Vir utemeljitve (uredniško, konservativno):
 * - Bled: simbol slovenskega turizma; vrhunec julij/avgust, ob vikendih konce.
 * - Vintgar: urejeni terminski vstopi ravno zaradi konic obiskovalcev.
 * - Postojnska jama: najbolj obiskana turistična jama v Evropi.
 * - Piran: ozko kamnito staro mestno jedro, poleti ob vikendih natrpano.
 * - Ljubljana: staro mestno jedro julija/avgusta ob vikendih zelo obiskano.
 */
export const HIGH_DEMAND_IDS: ReadonlySet<string> = new Set([
  "bled",
  "vintgar",
  "postojna",
  "piran",
  "ljubljana",
]);

/**
 * Slovnični rod imena vrhunskih točk (za pravilno sklanjanje pridevnika
 * »obiskan/obiskana« — ženski rod: soteska, jama, Ljubljana).
 * Fiksni kurirani seznam → rod je znan; privzeto moški.
 */
const NAME_GENDER: Record<string, "m" | "f"> = {
  bled: "m",
  vintgar: "f",
  postojna: "f",
  piran: "m",
  ljubljana: "f",
};

/** Vrhunska sezonska meseca (julij = 7, avgust = 8). */
const PEAK_MONTHS = new Set([7, 8]);
/** Kongestivni dnevi tedna (sobota = 6, nedelja = 0). */
const PEAK_WEEKDAYS = new Set([0, 6]);

/** Ali datum (ISO) pade v kongestivno okno: julij/avgust + sobota/nedelja. */
export function isPeakWeekend(isoDate: string): boolean {
  // "2026-07-04" → mesec/dan tedna brez časovnega pasu (čisto datumsko)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return false;
  const [, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  return PEAK_MONTHS.has(dt.getMonth() + 1) && PEAK_WEEKDAYS.has(dt.getDay());
}

/** Ali potovanje (startDate + dni) prekriva kateri koli vrhunski vikend. */
export function tripOverlapsPeakWeekend(startDate: string, days: number): boolean {
  for (let i = 1; i <= days; i++) {
    const iso = dayISOForDayNumber(startDate, i);
    if (iso && isPeakWeekend(iso)) return true;
  }
  return false;
}

// T5-b1/H2: haversine formula živi v src/lib/geo-distance.ts (en vir
// resnice — ISTA formula in R = 6371 kot prejšnja lokalna kopija).

const MAX_ALTERNATIVE_KM = 60;

/**
 * Izračunaj crowd opombe za itinerer — SAMO ob znanem datumu odhoda.
 *
 * Za vsak dan, ki pade na vrhunski vikend (julij/avgust + sobota/nedelja),
 * in vsako lokacijo iz HIGH_DEMAND_IDS na tistem dnevu:
 *   - reason: lokalizirana uredniška trditev o vzorcu obiskanosti (ne status!)
 *   - alternatives: do 2 bližnji (≤ 60 km) ne-vrhunski destinaciji, sezonsko
 *     ustrezni, razvrščeni po ujemanju interesov potnika, nato po bližini
 *
 * Brez startDate → prazna tabela (neznani datumi = ni poštene trditve).
 * Enak rezultat za enake vhode — čista funkcija, uporabna tudi na clientu.
 */
export function buildCrowdNotices(
  itinerary: Itinerary,
  input: PlannerInput,
  lang: "sl" | "en" = "sl"
): CrowdNotice[] {
  if (!input.startDate) return [];

  const notices: CrowdNotice[] = [];

  for (const day of itinerary.days) {
    const dayISO = dayISOForDayNumber(input.startDate, day.day);
    if (!dayISO || !isPeakWeekend(dayISO)) continue;

    for (const loc of day.locations) {
      if (!HIGH_DEMAND_IDS.has(loc.destination_id)) continue;

      // Od izvirne destinacije (koordinate + ime iz enovitega vira)
      const origin = DESTINATIONS.find((d) => d.id === loc.destination_id);
      if (!origin) continue;

      const alternatives: CrowdAlternative[] = DESTINATIONS.filter(
        (d) =>
          d.id !== origin.id &&
          !HIGH_DEMAND_IDS.has(d.id) &&
          d.bestSeason.includes(input.season) &&
          haversineKm(origin.coords, d.coords) <= MAX_ALTERNATIVE_KM
      )
        .map((d) => ({
          destination_id: d.id,
          destination_name: d.name,
          slug: d.slug,
          distanceKm: Math.round(haversineKm(origin.coords, d.coords)),
          // Ujemanje interesov potnika — pošten razlog "boljše za vas"
          matchedInterests: d.bestFor.filter((b) =>
            input.interests.includes(b)
          ),
        }))
        .sort(
          (a, b) =>
            b.matchedInterests.length - a.matchedInterests.length ||
            a.distanceKm - b.distanceKm
        )
        .slice(0, 2);

      notices.push({
        day: day.day,
        destination_id: origin.id,
        destination_name: origin.name,
        reason:
          lang === "en"
            ? `${origin.name} is usually very busy on weekends in July and August — consider a morning visit or a quieter alternative nearby.`
            : `${origin.name} je julija in avgusta ob vikendih običajno zelo obiskan${
                NAME_GENDER[origin.id] === "f" ? "a" : ""
              } — razmislite o jutranjem prihodu ali mirnejši alternativi v bližini.`,
        alternatives,
      });
    }
  }

  return notices;
}
