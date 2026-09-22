// ============================================================================
// TASK 93 — SEGMENTACIJA DNEVA NA VSEH POVRŠINAH NAČRTA: testi (1.83.0)
// ============================================================================
//
// Pokriva:
//   1. segmentOfSlot (čista funkcija): urne košarice po ZAČETNI uri
//      (meje 11:59/12:00, 16:59/17:00, 00:xx), besedilni sloti SL+EN po
//      ključnih besedah, prazni/neznani → null (brez ugibanj, §8);
//   2. segmentBoundaryAt: glava na prvem postanku z znanim segmentom,
//      glava ob prehodu, brez glave v istem segmentu, neznan slot NE
//      lomi prehodov (ista semantika kot UI sprint v podrobnem pogledu —
//      ekstrakcija, ne redesign), defenzivni robovi;
//   3. DAY_SEGMENT_LABELS: SL + EN oznake za vse segmente (L vzorec);
//   4. SOURCE-CONTRACT (en a resnica):
//      - itinerary-planner.tsx: UVAŽA lib (segmentBoundaryAt) + skupno
//        komponento DaySegmentHeader, NIMA lokalne kopije segmentOfSlot;
//      - trip-timeline.tsx: glave segmentov + POŠTENE etape (PlannerStopLeg),
//        NIMA izmišljenega estimateTravelTime/KNOWN_DISTANCES ("~30 min");
//      - shared-trip.tsx: glave segmentov (col-span-full) prek lib;
//      - day-segment-header.tsx: ena komponenta, oznake iz lib, ikone
//        Sun/CloudSun/Moon, aria-hidden črte (presentation role);
//      - sporočila: mrtvi ključi seg*/toNextStop ODSTRANJENI (oznake
//        prihajajo iz lib, ne next-intl).
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

import {
  DAY_SEGMENT_LABELS,
  segmentBoundaryAt,
  segmentOfSlot,
  type DaySegment,
} from "@/lib/day-segments";

interface SlotItem {
  time_slot?: string | null;
}

function day(slots: (string | null | undefined)[]): SlotItem[] {
  return slots.map((time_slot) => ({ time_slot }));
}

// ---------------------------------------------------------------------------
// 1. segmentOfSlot — urne košarice + ključne besede + brez ugibanj
// ---------------------------------------------------------------------------

describe("TASK 93: segmentOfSlot", () => {
  test("ura < 12 → jutro (vključno 00:30, 11:59)", () => {
    expect(segmentOfSlot("00:30-01:00")).toBe("morning");
    expect(segmentOfSlot("9:00-11:00")).toBe("morning");
    expect(segmentOfSlot("09:00-11:00")).toBe("morning");
    expect(segmentOfSlot("11:59-12:30")).toBe("morning");
  });

  test("12:00 ≤ ura < 17 → popoldan (meje 12:00 in 16:59)", () => {
    expect(segmentOfSlot("12:00-13:00")).toBe("afternoon");
    expect(segmentOfSlot("13:30-15:00")).toBe("afternoon");
    expect(segmentOfSlot("16:59-17:30")).toBe("afternoon");
  });

  test("ura ≥ 17 → večer (meja 17:00, skrajni 23:59)", () => {
    expect(segmentOfSlot("17:00-18:00")).toBe("evening");
    expect(segmentOfSlot("19:00-21:00")).toBe("evening");
    expect(segmentOfSlot("23:59-23:59")).toBe("evening");
  });

  test("košarica po ZAČETNI uri — konec lahko sega čez mejo", () => {
    // 11:00-14:00 je JUTRO (začetek), čeprav se konča popoldan
    expect(segmentOfSlot("11:00-14:00")).toBe("morning");
    expect(segmentOfSlot("16:00-20:00")).toBe("afternoon");
  });

  test("besedilni sloti SL → ključne besede", () => {
    expect(segmentOfSlot("Zjutraj")).toBe("morning");
    expect(segmentOfSlot("jutranji obisk")).toBe("morning");
    expect(segmentOfSlot("Popoldan")).toBe("afternoon");
    expect(segmentOfSlot("večer")).toBe("evening");
    expect(segmentOfSlot("zvečer sprehod")).toBe("evening");
    expect(segmentOfSlot("vecer brez šumnika")).toBe("evening");
  });

  test("besedilni sloti EN → ključne besede", () => {
    expect(segmentOfSlot("Morning")).toBe("morning");
    expect(segmentOfSlot("afternoon")).toBe("afternoon");
    expect(segmentOfSlot("Evening")).toBe("evening");
    expect(segmentOfSlot("night walk")).toBe("evening");
  });

  test("neznano → null (brez ugibanj — §8 poštenost)", () => {
    expect(segmentOfSlot("")).toBe(null);
    expect(segmentOfSlot("ob prihodu")).toBe(null);
    expect(segmentOfSlot("cel dan")).toBe(null);
    expect(segmentOfSlot("13.15")).toBe(null); // decimalna ura se ne parsira
    expect(segmentOfSlot(null)).toBe(null);
    expect(segmentOfSlot(undefined)).toBe(null);
  });

  test("povratna združljivost: format UI sprinta nespremenjen", () => {
    // Isti vnosi kot v prvotni lokalni implementaciji plannerja
    expect(segmentOfSlot("9:00-10:30")).toBe("morning");
    expect(segmentOfSlot("14:00-16:00")).toBe("afternoon");
    expect(segmentOfSlot("18:00-20:00")).toBe("evening");
    expect(segmentOfSlot("prosti termin")).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// 2. segmentBoundaryAt — pravilo glave (ekstrakcija UI sprint semantike)
// ---------------------------------------------------------------------------

describe("TASK 93: segmentBoundaryAt", () => {
  test("prvi postanek z znanim segmentom → glava (dan se začne z JUTRO)", () => {
    const items = day(["9:00-10:00", "10:30-11:30"]);
    expect(segmentBoundaryAt(items, 0)).toEqual({
      segment: "morning",
      showHeader: true,
    });
  });

  test("prehod Jutro → Popoldan → Večer → glava na vsakem prehodu", () => {
    const items = day(["9:00-10:00", "13:00-14:00", "19:00-20:00"]);
    expect(segmentBoundaryAt(items, 1)).toEqual({
      segment: "afternoon",
      showHeader: true,
    });
    expect(segmentBoundaryAt(items, 2)).toEqual({
      segment: "evening",
      showHeader: true,
    });
  });

  test("isti segment kot prejšnji → brez glave", () => {
    const items = day(["9:00-10:00", "10:30-11:30", "11:45-12:00"]);
    expect(segmentBoundaryAt(items, 1).showHeader).toBe(false);
    expect(segmentBoundaryAt(items, 2).showHeader).toBe(false);
  });

  test("neznan slot → brez glave (ne trdimo ničesar)", () => {
    const items = day(["prosto", "cel dan"]);
    expect(segmentBoundaryAt(items, 0)).toEqual({
      segment: null,
      showHeader: false,
    });
    expect(segmentBoundaryAt(items, 1).showHeader).toBe(false);
  });

  test("neznan prejšnji + znan trenutni → glava (semantika UI sprinta)", () => {
    // Podrobni pogled: prev === null || seg !== prevSeg — neznan prevSeg
    // (null) se razlikuje od znanega seg → glava se pokaže
    const items = day(["prosto", "13:00-14:00"]);
    expect(segmentBoundaryAt(items, 1)).toEqual({
      segment: "afternoon",
      showHeader: true,
    });
  });

  test("znan prejšnji + neznan trenutni → brez glave, segment null", () => {
    const items = day(["9:00-10:00", "prosto"]);
    expect(segmentBoundaryAt(items, 1)).toEqual({
      segment: null,
      showHeader: false,
    });
  });

  test("vsi neznani → nikoli glava (star načrt ostane brez segmentov)", () => {
    const items = day(["", null, "prosto"]);
    for (let i = 0; i < items.length; i++) {
      expect(segmentBoundaryAt(items, i).showHeader).toBe(false);
    }
  });

  test("defenzivni robovi: prazno / indeks ven → fail-closed", () => {
    expect(segmentBoundaryAt([], 0)).toEqual({
      segment: null,
      showHeader: false,
    });
    expect(segmentBoundaryAt(day(["9:00-10:00"]), 5)).toEqual({
      segment: null,
      showHeader: false,
    });
    expect(segmentBoundaryAt(day(["9:00-10:00"]), -1)).toEqual({
      segment: null,
      showHeader: false,
    });
  });

  test("redni vrstni red ohranjen — segmentacija NE prerazporeduje", () => {
    // Nemonoton dan (9:00, 20:00, 10:00) ostane v izvirnem vrstnem redu;
    // glave se pokažejo ob vsakem PREHODU (konturnost, ne izenačevanje)
    const items = day(["9:00-10:00", "20:00-21:00", "10:00-11:00"]);
    expect(segmentBoundaryAt(items, 1)).toEqual({
      segment: "evening",
      showHeader: true,
    });
    expect(segmentBoundaryAt(items, 2)).toEqual({
      segment: "morning",
      showHeader: true,
    });
  });
});

// ---------------------------------------------------------------------------
// 3. DAY_SEGMENT_LABELS — dvajezične oznake (L vzorec)
// ---------------------------------------------------------------------------

describe("TASK 93: DAY_SEGMENT_LABELS", () => {
  test("SL oznake (SharedTrip bere .sl)", () => {
    expect(DAY_SEGMENT_LABELS.morning.sl).toBe("Jutro");
    expect(DAY_SEGMENT_LABELS.afternoon.sl).toBe("Popoldan");
    expect(DAY_SEGMENT_LABELS.evening.sl).toBe("Večer");
  });

  test("EN oznake (timeline/planner na /en)", () => {
    expect(DAY_SEGMENT_LABELS.morning.en).toBe("Morning");
    expect(DAY_SEGMENT_LABELS.afternoon.en).toBe("Afternoon");
    expect(DAY_SEGMENT_LABELS.evening.en).toBe("Evening");
  });

  test("vsak segment ima obe izvedbi (popolna tipovska pokritost)", () => {
    const segments: DaySegment[] = ["morning", "afternoon", "evening"];
    for (const s of segments) {
      const l = DAY_SEGMENT_LABELS[s];
      expect(l.sl.length).toBeGreaterThan(0);
      expect(l.en.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. SOURCE-CONTRACT — ena resnica, 0 duplikatov, 0 fikcij
// ---------------------------------------------------------------------------

describe("TASK 93: source-contract", () => {
  const lib = source("src/lib/day-segments.ts");
  const header = source("src/components/day-segment-header.tsx");
  const planner = source("src/components/sections/itinerary-planner.tsx");
  const timeline = source("src/components/trip-timeline.tsx");
  const shared = source("src/components/shared-trip.tsx");

  test("lib: čista plast — 0 omrežja/db/React", () => {
    expect(lib).not.toContain('from "react"');
    expect(lib).not.toContain("fetch(");
    expect(lib).not.toContain("lucide-react");
  });

  test("planner: uvaža lib + skupno komponento, NIMA lokalne kopije", () => {
    expect(planner).toContain('from "@/lib/day-segments"');
    expect(planner).toContain('from "@/components/day-segment-header"');
    expect(planner).toContain("segmentBoundaryAt(");
    expect(planner).toContain("<DaySegmentHeader");
    // lokalna kopija odstranjena
    expect(planner).not.toContain("function segmentOfSlot");
    expect(planner).not.toContain("SEGMENT_LABEL_KEYS");
    expect(planner).not.toContain("SEGMENT_ICONS");
  });

  test("timeline: glave segmentov + POŠTENE etape (PlannerStopLeg)", () => {
    expect(timeline).toContain("segmentBoundaryAt(");
    expect(timeline).toContain("<DaySegmentHeader");
    expect(timeline).toContain("<PlannerStopLeg");
    expect(timeline).toContain('legs?: Itinerary["legs"]');
    // IZMIŠLJENI "~30 min" odstranjen za vedno (komentar v glavi datoteke
    // dokumentira ODSTRANITEV — kontroliramo dejansko kodno vzorevino)
    expect(timeline).not.toContain("estimateTravelTime");
    expect(timeline).not.toContain("KNOWN_DISTANCES");
    expect(timeline).not.toContain('return "~30 min"');
    expect(timeline).not.toContain("Google Maps Distance Matrix");
  });

  test("timeline: etapa pred glavo pred kartico (vrstni red kot podrobni pogled)", () => {
    const legPos = timeline.indexOf("{prev && <PlannerStopLeg");
    const headerPos = timeline.indexOf("{showHeader && segment && (");
    const cardPos = timeline.indexOf("{/* Kartica */}");
    expect(legPos).toBeGreaterThan(-1);
    expect(headerPos).toBeGreaterThan(legPos);
    expect(cardPos).toBeGreaterThan(headerPos);
  });

  test("shared: glave segmentov v mreži (col-span-full) prek lib", () => {
    expect(shared).toContain("segmentBoundaryAt(");
    expect(shared).toContain("<DaySegmentHeader");
    expect(shared).toContain('className="col-span-full"');
    expect(shared).toContain('lang="sl"');
  });

  test("komponenta glave: oznake iz lib, ikone, presentation role", () => {
    expect(header).toContain('from "@/lib/day-segments"');
    expect(header).toContain("DAY_SEGMENT_LABELS");
    expect(header).toContain("Sun");
    expect(header).toContain("CloudSun");
    expect(header).toContain("Moon");
    expect(header).toContain('role="presentation"');
    expect(header).toContain('aria-hidden="true"');
  });

  test("sporočila: mrtvi ključi seg*/toNextStop odstranjeni (SL + EN)", () => {
    for (const loc of ["sl", "en"]) {
      const msgs = source(`src/i18n/messages/${loc}.json`);
      expect(msgs).not.toContain('"segMorning"');
      expect(msgs).not.toContain('"segAfternoon"');
      expect(msgs).not.toContain('"segEvening"');
      expect(msgs).not.toContain('"toNextStop"');
    }
  });

  test("planner podrobni pogumb posreduje legs timeline-u (isti vir kot Podrobno)", () => {
    expect(planner).toContain("legs={itinerary.legs}");
  });
});
