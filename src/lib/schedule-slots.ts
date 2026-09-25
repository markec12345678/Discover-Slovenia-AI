// ============================================================================
// DRIVE-AWARE FALLBACK SLOTS (TASK 50, 1.55.0)
// ============================================================================
//
// Problem (dokazano z 20-scenarijskim harnessom, 19. 9. 2026): deterministična
// fallback pot je gradila fiksne termine 09:00–13:00 + 14:00–18:00 (vrzel
// TOČNO 1 h) neodvisno od dejanske vožnje med zaporednima postankoma. Ko je
// vožnja > 1 h (Triglav→Soča ~1,5 h, Bohinj→Postojna ~1,8 h), je geo validacija
// upravičeno sprožila schedule_gap ERROR — načrt KOT JE ZAPISAN ni izvedljiv
// (14 od 19 uspešnih scenarijev je imelo worst:"error"). Hitra akcija "swap"
// je isto fiksni ritem ponovno vnesla prek reslots().
//
// Rešitev: čista funkcija — začetek vsakega termina je
//   max(predloga ritem, prejšnji konec + ocenjena vožnja + 30 min rezerva),
// zaokroženo navzgor na celo uro. Ocena vožnje je KONZERVATIVNA
// (haversine × 1,5 / 50 km/h ≈ 33 km/h učinkovito), da pokriva OSRM realne
// čase z rezervo — geo validacija nato še vedno preverja z dejanskimi nogami.
//
// Deterministično (0 žetonov, 0 omrežja); isti vir koordinat kot
// geo-validation.coordsOfStop: T1 dataset najprej, lastne koordinate sicer
// (null island (0,0) NIKOLI ni veljavna koordinata).
// ============================================================================

import { DESTINATIONS } from "@/lib/slovenia-data";
import { haversineKm } from "@/lib/geo-distance";
import type { DayPlan, LocationVisit } from "@/lib/types";

// T5-b1/H2: haversine formula živi v src/lib/geo-distance.ts (en vir
// resnice). Konstanti spodaj sta NAMERNO lokalni in konzervativnejši od
// geo-distance (1,5/50 ≠ 1,3/55) — terminski repair potrebuje rezervo nad
// OSRM realnimi časi (dokumentirano v T5-a3 F.3 D2; NE poenotevati).

const T1_COORDS = new Map(DESTINATIONS.map((d) => [d.id, d.coords]));

/** Konzervativni cestni faktor (geo-validation uporablja 1,3 za oceno "~";
 *  tukaj 1,5 — terminski ritem mora pokriti OSRM realne čase z rezervo). */
const CONSERVATIVE_ROAD_FACTOR = 1.5;
/** Povprečna hitrost na slovenskih cestah (km/h) za oceno vožnje. */
const AVG_SPEED_KMH = 50;
/** Rezerva (h) po vožnji pred začetkom naslednjega termina (parkiranje/prehod). */
const SLOT_BUFFER_H = 0.5;

/** Koordinate postanka: T1 dataset najprej (AI/fallback znani ID-ji), sicer
 *  lastne — če so končne in NISO null island (0,0). Sicer null = neznano. */
export function slotCoordsOf(s: {
  destination_id?: string;
  lat?: number;
  lng?: number;
}): { lat: number; lng: number } | null {
  const t1 = s.destination_id ? T1_COORDS.get(s.destination_id) : undefined;
  if (t1) return t1;
  if (
    typeof s.lat === "number" &&
    typeof s.lng === "number" &&
    Number.isFinite(s.lat) &&
    Number.isFinite(s.lng) &&
    !(s.lat === 0 && s.lng === 0)
  ) {
    return { lat: s.lat, lng: s.lng };
  }
  return null;
}

/** Konzervativna ocena vožnje v urah (konzervativno — glej konstante zgoraj).
 *  Vrne null, če katera od koordinat ni znana (nikoli ne ugibamo). */
export function driveHoursBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  return (haversineKm(a, b) * CONSERVATIVE_ROAD_FACTOR) / AVG_SPEED_KMH;
}

/**
 * Začetna ura termina (cela ura, "HH:00" format ostane).
 *
 * - i === 0 ali koordinate neznane → predloga (fiksni ritem, nazaj
 *   kompatibilno za kratke vožnje in postanke brez koordinat).
 * - sicer → max(predloga, ceil(prejšnjiKonec + vožnja + 30 min)).
 */
export function slotStartFor(opts: {
  templateStartH: number;
  prevEndH: number | null;
  driveH: number | null;
}): number {
  if (opts.prevEndH == null || opts.driveH == null) {
    return opts.templateStartH;
  }
  const earliest = Math.ceil(
    opts.prevEndH + opts.driveH + SLOT_BUFFER_H
  );
  return Math.max(opts.templateStartH, earliest);
}

/** Terminska oznaka "HH:00-HH:00" (format AI/fallback izhoda; >24h se
 *  zapiše kot "25:00" — geo validacija tak termin pošteno zavrne kot
 *  time_slot_invalid, kar je iskreneje kot pretirano gnanje urnika). */
export function slotLabel(startH: number, durationH: number): string {
  const pad = (h: number) => String(Math.floor(h)).padStart(2, "0");
  return `${pad(startH)}:00-${pad(startH + durationH)}:00`;
}

/** Zaporedni iterator termina znotraj dneva: pokliči za vsak postanek,
 *  dobiš {startH, label} in posodobljeni stanji za naslednji klic. */
export interface SlotCursor {
  prevEndH: number | null;
  prevCoords: { lat: number; lng: number } | null;
}

export function nextSlot(
  cursor: SlotCursor,
  nextCoords: { lat: number; lng: number } | null,
  templateStartH: number,
  durationH: number
): { startH: number; label: string; cursor: SlotCursor } {
  const driveH =
    cursor.prevCoords != null && nextCoords != null
      ? driveHoursBetween(cursor.prevCoords, nextCoords)
      : null;
  const startH = slotStartFor({
    templateStartH,
    prevEndH: cursor.prevEndH,
    driveH,
  });
  return {
    startH,
    label: slotLabel(startH, durationH),
    cursor: {
      prevEndH: startH + durationH,
      prevCoords: nextCoords,
    },
  };
}

/** Priročnik nad LocationVisit seznamom (reslots/quick-action): ista logika,
 *  koordinate prek slotCoordsOf (T1 prednost). Vrne NOVE LocationVisit-e
 *  (čista preslikava, duration ostane kot je — le termini se premaknejo). */
export function reslotLocations(
  locations: LocationVisit[],
  opts: {
    templateStartH?: (index: number) => number;
    spacingH?: number;
    durationH?: number;
  }
): LocationVisit[] {
  const spacing = opts.spacingH ?? 5;
  const templateStart =
    opts.templateStartH ?? ((i: number) => 9 + i * spacing);
  let cursor: SlotCursor = { prevEndH: null, prevCoords: null };
  return locations.map((loc, i) => {
    const coords = slotCoordsOf(loc);
    const { label, cursor: next } = nextSlot(
      cursor,
      coords,
      templateStart(i),
      opts.durationH ?? (Number(loc.duration) || 4)
    );
    cursor = next;
    return { ...loc, time_slot: label };
  });
}

// ---------------------------------------------------------------------------
// REPAIR SCHEDULE GAPS (TASK 50, §14/§15) — popravljalna plast NAD realnimi
// nogami (OSRM). Hevristika zgoraj (haversine ×1,5) podcenjuje gorske pare
// (Triglav→Soča: 0,28 h prek OSRM 1,5 h — voziti moraš okoli gorovja), zato
// deterministične poti (fallback generacija, quick-action, refine echo) po
// izgradnji nog še enkrat poravnajo termine z DEJANSKIMI vožnjami.
//
// Pravila (konzervativna, čista, deterministična):
//   - premakne se LE začetek termina (in z njim konec — trajanje OSTANE);
//   - vrstni red, ID-ji, cene, koordinate, trajanja: NIČ se ne spremeni;
//   - vrzel med zaporednima postankoma ≥ (vožnja + 30 min), če je noga znana;
//   - prekrivanje (naslednji začetek < prejšnji konec) se poravna tudi BREZ
//     noge (§15: prekrivajoč urnik ne sme priti v končni načrt neopazim);
//   - nogo, ki je ni (postanek brez koordinat), ne ugibamo — par ostane,
//     geo validacija ga pošteno javi (fail-visible);
//   - termin čez polnočno mejo se zapiše "24:30"/"25:00" — geo validacija ga
//     zavrne kot time_slot_invalid (iskreneje kot tiho rezanje trajanja).
// ---------------------------------------------------------------------------

function parseSlotMin(s: unknown): [number, number] | null {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!m) return null;
  const start = +m[1] * 60 + +m[2];
  const end = +m[3] * 60 + +m[4];
  if (end <= start) return null;
  return [start, end];
}

function fmtHM(min: number): string {
  const h = Math.floor(min / 60);
  const mm = min % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Resolver vožnje (v urah) med dvema zaporednima postankoma po ID-jih.
 *  Npr. nad LegRouteIndex: (a, b) => legs.get(legKey(a, b))?.min / 60 ?? null */
export type DriveHoursResolver = (
  aId: string,
  bId: string
) => number | null;

export interface RepairReport {
  /** Št. terminov, ki so bili premakjeni (začetek kasneje). */
  shifted: number;
  /** Št. premaknjenih terminov zaradi PREKRIVANJA (brez/z kljub nogi). */
  overlapShifted: number;
}

/** Popravi termine dneva tako, da vrzeli pokrijejo dejanske vožnje (in da
 *  prekrivanja izginejo). Čista preslikava — vrača NOVE dneve + poročilo. */
export function repairScheduleGaps(
  days: DayPlan[],
  resolveDriveH: DriveHoursResolver,
  bufferMin = 30
): { days: DayPlan[]; report: RepairReport } {
  const report: RepairReport = { shifted: 0, overlapShifted: 0 };
  const repaired = days.map((day) => {
    let prevEndMin: number | null = null;
    let prevId: string | null = null;
    const locations = (day.locations ?? []).map((loc) => {
      const slot = parseSlotMin(loc.time_slot);
      if (!slot) {
        // neveljaven/neparsable termin: ne moremo verižiti — pusti ga,
        // geo validacija ga javi (time_slot_invalid), repair NE izmišljuje
        prevEndMin = null;
        prevId = null;
        return loc;
      }
      let [start, end] = slot;
      if (prevEndMin != null) {
        const driveH =
          prevId != null ? resolveDriveH(prevId, String(loc.destination_id)) : null;
        const driveMin = driveH != null ? driveH * 60 : 0;
        const earliest = prevEndMin + driveMin + bufferMin;
        if (start < prevEndMin) {
          // prekrivanje — poravna po (prejšnji konec + morebitna vožnja + rezerva)
          const shift = earliest - start;
          start += shift;
          end += shift;
          report.overlapShifted++;
        } else if (start < earliest) {
          const shift = earliest - start;
          start += shift;
          end += shift;
          report.shifted++;
        }
      }
      prevEndMin = end;
      prevId = String(loc.destination_id ?? "");
      return { ...loc, time_slot: `${fmtHM(start)}-${fmtHM(end)}` };
    });
    return { ...day, locations };
  });
  return { days: repaired, report };
}
