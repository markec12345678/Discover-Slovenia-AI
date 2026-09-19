// TASK 50 (1.55.0) — schedule-slots: drive-aware termini fallback/quick-action
// Testi: T1 prioriteta koordinat, konzervativna ocena vožnje, premik začetka
// termina, format oznake, reslotLocations nad realnimi T1 pari (Triglav→Soča,
// Bohinj→Postojna — isti pari, ki so pred popravilom sprožili schedule_gap
// ERROR na živem strežniku).
import { describe, expect, test } from "bun:test";
import {
  slotCoordsOf,
  driveHoursBetween,
  slotStartFor,
  slotLabel,
  nextSlot,
  reslotLocations,
  repairScheduleGaps,
} from "../schedule-slots";
import type { DayPlan, LocationVisit } from "../types";

const T1 = (id: string): { lat: number; lng: number } => {
  const c = slotCoordsOf({ destination_id: id });
  if (!c) throw new Error(`T1 coords manjkajo za ${id}`);
  return c;
};

describe("TASK 50: schedule-slots (drive-aware termini)", () => {
  test("slotCoordsOf: T1 dataset prednost nad lastnimi (lažnimi) koordinatami", () => {
    const c = slotCoordsOf({ destination_id: "bled", lat: 0.1, lng: 0.2 });
    expect(c).toEqual(T1("bled"));
  });

  test("slotCoordsOf: lastne koordinate za ne-T1 (supply/osm postanke)", () => {
    expect(slotCoordsOf({ destination_id: "kiwitaxi:411", lat: 46.34, lng: 14.09 })).toEqual({ lat: 46.34, lng: 14.09 });
  });

  test("slotCoordsOf: null island (0,0) NIKOLI ni veljavna koordinata", () => {
    expect(slotCoordsOf({ destination_id: "osm:node-1", lat: 0, lng: 0 })).toBeNull();
    // tudi za T1 ID z lastno (0,0) — dataset zmaga, torej VEDNO veljavno:
    expect(slotCoordsOf({ destination_id: "bled", lat: 0, lng: 0 })).toEqual(T1("bled"));
  });

  test("slotCoordsOf: manjkajoče koordinate → null (nikoli ne ugibamo)", () => {
    expect(slotCoordsOf({ destination_id: "neznan-id" })).toBeNull();
    expect(slotCoordsOf({})).toBeNull();
  });

  test("driveHoursBetween: konzervativna ocena za CESTNE pare; gorski vrhovi so ZNANA meja hevristike", () => {
    // Bohinj→Postojna: OSRM ~1,8 h (živi dokaz B1). Haversine ~60 km → 1,8 h ✓.
    const h2 = driveHoursBetween(T1("bohinj"), T1("postojna"));
    expect(h2).toBeGreaterThan(1.4);
    expect(h2).toBeLessThan(2.4);
    // Triglav→Soča: haversine ~9 km (vrh → Trenta preko grebena) — hevristika
    // podceni (OSRM vožnja okoli gorovja ~1,5 h). TO JE RAZLOG, zakaj obstaja
    // repairScheduleGaps nad REALNIMI nogami (deterministične poti) —
    // hevristika sama gorskih parov ne more rešiti.
    const h = driveHoursBetween(T1("triglav"), T1("soca"));
    expect(h).toBeLessThan(0.6);
  });

  test("slotStartFor: kratek prehod → predloga ritma (nazaj kompatibilno)", () => {
    expect(slotStartFor({ templateStartH: 14, prevEndH: 13, driveH: 0.4 })).toBe(14);
  });

  test("slotStartFor: vožnja 1,35 h + 0,5 rezerva → ceil na 15 (ne 14)", () => {
    // prej: fiksen ritem 14:00 → schedule_gap ERROR (vrzel 1 h < vožnja 1,5 h)
    expect(slotStartFor({ templateStartH: 14, prevEndH: 13, driveH: 1.35 })).toBe(15);
  });

  test("slotStartFor: brez prejšnjega/meznih podatkov → predloga", () => {
    expect(slotStartFor({ templateStartH: 14, prevEndH: null, driveH: 1.5 })).toBe(14);
    expect(slotStartFor({ templateStartH: 14, prevEndH: 13, driveH: null })).toBe(14);
  });

  test("slotStartFor: ekstremna vožnja (245 km → ~7 h) → premik brez zgornje meje (iskreno pozno, validator javi day_km)", () => {
    // Murska Sobota→Triglav haversine ~200 km × 1,5/50 = 6 h → 13+6+0,5 → ceil 20
    const h = driveHoursBetween(T1("murska-sobota"), T1("triglav"));
    expect(slotStartFor({ templateStartH: 14, prevEndH: 13, driveH: h })).toBeGreaterThanOrEqual(19);
  });

  test("slotLabel: HH:00-HH:00 format (razširljiv prek 24 — validator ga pošteno zavrne)", () => {
    expect(slotLabel(9, 4)).toBe("09:00-13:00");
    expect(slotLabel(15, 4)).toBe("15:00-19:00");
    expect(slotLabel(20, 4)).toBe("20:00-24:00");
  });

  test("nextSlot: kURZOR veriga — cestni par (Bohinj→Postojna ~1,8 h) premakne termin, gorski par ostane na hevristiki (repair ga pokrije z nogami)", () => {
    let cursor = { prevEndH: null as number | null, prevCoords: null as { lat: number; lng: number } | null };
    const s1 = nextSlot(cursor, T1("bohinj"), 9, 4);
    expect(s1.label).toBe("09:00-13:00");
    cursor = s1.cursor;
    const s2 = nextSlot(cursor, T1("postojna"), 14, 4);
    // bohinj→postojna ~1,8 h + 0,5 → 15:18 → ceil 16
    expect(s2.label).toBe("16:00-20:00");
    expect(s2.cursor.prevEndH).toBe(20);
    // gorski par (triglav→soca 0,28 h hevristika): termin ostane na predlogi —
    // to pokrije repairScheduleGaps z REALNIMI OSRM nogami (glej spodnji describe)
    let c2 = { prevEndH: null as number | null, prevCoords: null as { lat: number; lng: number } | null };
    const g1 = nextSlot(c2, T1("triglav"), 9, 4);
    c2 = g1.cursor;
    const g2 = nextSlot(c2, T1("soca"), 14, 4);
    expect(g2.label).toBe("14:00-18:00");
  });

  test("reslotLocations: realni T1 pari (Bohinj→Postojna) dobijo vrzel ≥ vožnji (schedule_gap ERROR zaprt)", () => {
    const locations: LocationVisit[] = [
      { destination_id: "bohinj", destination_name: "Bohinj", time_slot: "09:00-13:00", duration: 4, estimated_cost: 0, notes: "" },
      { destination_id: "postojna", destination_name: "Postojnska jama", time_slot: "14:00-18:00", duration: 4, estimated_cost: 0, notes: "" },
    ];
    const reslotted = reslotLocations(locations, { spacingH: 5, durationH: 4 });
    const first = reslotted[0].time_slot;
    const second = reslotted[1].time_slot;
    expect(first).toBe("09:00-13:00");
    // vožnja ~1,8 h + 0,5 → najmanj 15:00 (prej 14:00 → ERROR)
    expect(second).not.toBe("14:00-18:00");
    const startH = Number(second.slice(0, 2));
    expect(startH).toBeGreaterThanOrEqual(15);
    // vrzel pokrije ocenjeno vožnjo:
    const driveH = driveHoursBetween(T1("bohinj"), T1("postojna"));
    expect(startH - 13).toBeGreaterThanOrEqual(driveH);
  });

  test("reslotLocations: kratki pari OSTANEJO na fiksnem ritmu (0 regresij za mestne dneve)", () => {
    const locations: LocationVisit[] = [
      { destination_id: "bled", destination_name: "Bled", time_slot: "x", duration: 4, estimated_cost: 0, notes: "" },
      { destination_id: "vintgar", destination_name: "Vintgar", time_slot: "x", duration: 4, estimated_cost: 0, notes: "" },
    ];
    const reslotted = reslotLocations(locations, { spacingH: 5, durationH: 4 });
    // bled→vintgar ~7 km → ~0,2 h + 0,5 = 0,7 h → ceil 1 → template 14 ostane
    expect(reslotted[1].time_slot).toBe("14:00-18:00");
  });

  test("reslotLocations: postanki brez koordinat → fiksni ritem (nazaj kompatibilno)", () => {
    const locations: LocationVisit[] = [
      { destination_id: "kiwitaxi:999", destination_name: "?", time_slot: "x", duration: 4, estimated_cost: 0, notes: "" },
      { destination_id: "osm:node-1", destination_name: "?", time_slot: "x", duration: 4, estimated_cost: 0, notes: "" },
    ];
    const reslotted = reslotLocations(locations, { spacingH: 5, durationH: 4 });
    expect(reslotted[0].time_slot).toBe("09:00-13:00");
    expect(reslotted[1].time_slot).toBe("14:00-18:00");
  });

  test("reslotLocations: čista preslikava — duration/notes/id-ji ostanejo, spreminja se LE time_slot", () => {
    const locations: LocationVisit[] = [
      { destination_id: "bled", destination_name: "Bled", time_slot: "11:00-15:00", duration: 4, estimated_cost: 50, notes: "xyz" },
      { destination_id: "postojna", destination_name: "Postojna", time_slot: "16:00-20:00", duration: 4, estimated_cost: 30, notes: "abc" },
    ];
    const reslotted = reslotLocations(locations, { spacingH: 5, durationH: 4 });
    expect(reslotted[0].duration).toBe(4);
    expect(reslotted[0].estimated_cost).toBe(50);
    expect(reslotted[0].notes).toBe("xyz");
    expect(reslotted[0].destination_id).toBe("bled");
    expect(reslotted[0].time_slot).not.toBe("11:00-15:00");
  });
});

describe("TASK 50: repairScheduleGaps (noge OSRM, minute natančnost)", () => {
  const mkDay = (slots: string[], ids: string[]): DayPlan => ({
    day: 1,
    weather: { condition: "sončno", temp: 22 },
    locations: slots.map((s, i) => ({
      destination_id: ids[i],
      destination_name: ids[i],
      time_slot: s,
      duration: 4,
      estimated_cost: 0,
      notes: "",
    })),
  });
  // resolver, ki vrne realne OSRM minute (npr. Triglav→Soča 1,5 h)
  const legsMap = new Map<string, number>([
    ["triglav|soca", 1.5],
    ["bohinj|postojna", 1.8],
    ["ljubljana|piran", 1.5],
  ]);
  const resolve = (a: string, b: string): number | null => legsMap.get(`${a}|${b}`) ?? null;

  test("vrzel 1 h < vožnja 1,5 h → termin premaknjen na (konec + vožnja + 30 min)", () => {
    const day = mkDay(["09:00-13:00", "14:00-18:00"], ["triglav", "soca"]);
    const { days, report } = repairScheduleGaps([day], resolve);
    expect(days[0].locations[0].time_slot).toBe("09:00-13:00");
    // 13:00 + 1,5 h + 0,5 h = 15:00
    expect(days[0].locations[1].time_slot).toBe("15:00-19:00");
    expect(report.shifted).toBe(1);
  });

  test("PREKRIVANJE (V1 scenarij) → poravnano tudi BREZ noge; trajanje ohranjeno", () => {
    const day = mkDay(["09:00-13:00", "12:00-16:00"], ["bled", "vintgar"]);
    const { days, report } = repairScheduleGaps([day], resolve); // bled|vintgar ni v nogah
    expect(days[0].locations[1].time_slot).toBe("13:30-17:30");
    expect(report.overlapShifted).toBe(1);
    // trajanje 4 h ohranjeno:
    const m = days[0].locations[1].time_slot.match(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/)!;
    expect(+m[3] * 60 + +m[4] - (+m[1] * 60 + +m[2])).toBe(240);
  });

  test("kaskada: drugi premik potegne tretji termin (veriga)", () => {
    const day = mkDay(
      ["09:00-13:00", "14:00-18:00", "19:00-23:00"],
      ["triglav", "soca", "kobarid"]
    );
    const { days } = repairScheduleGaps([day], resolve);
    expect(days[0].locations[1].time_slot).toBe("15:00-19:00");
    // tretji: prejšnji konec 19:00 + brez noge + 30 min → 19:30
    expect(days[0].locations[2].time_slot).toBe("19:30-23:30");
  });

  test("korekten urnik ostane NEDOTIKNJEN (0 premikov)", () => {
    const day = mkDay(["09:00-13:00", "16:00-20:00"], ["triglav", "soca"]);
    const { days, report } = repairScheduleGaps([day], resolve);
    expect(days[0].locations[1].time_slot).toBe("16:00-20:00");
    expect(report.shifted + report.overlapShifted).toBe(0);
  });

  test("neparsable termin prekine verigo (ne izmišljujemo) — ostali ostanejo", () => {
    const day = mkDay(["09:00-13:00", "najkasneje zvečer", "14:00-18:00"], ["a", "b", "c"]);
    const { days, report } = repairScheduleGaps([day], resolve);
    expect(days[0].locations[1].time_slot).toBe("najkasneje zvečer");
    // tretji termin po prekinitvi verige ostane na 14:00 (brez prevEnd)
    expect(days[0].locations[2].time_slot).toBe("14:00-18:00");
    expect(report.shifted + report.overlapShifted).toBe(0);
  });

  test("FIXED-čas (18:30-19:30) se premika v korakih 30 min (HH:MM natančnost)", () => {
    const day: DayPlan = {
      day: 1,
      weather: { condition: "sončno", temp: 22 },
      locations: [
        { destination_id: "x", destination_name: "x", time_slot: "09:00-13:00", duration: 4, estimated_cost: 0, notes: "" },
        { destination_id: "y", destination_name: "y", time_slot: "13:30-14:30", duration: 1, estimated_cost: 77, notes: "FIXED" },
      ],
    };
    const legs = new Map<string, number>([["x|y", 2.0]]);
    const { days } = repairScheduleGaps([day], (a, b) => legs.get(`${a}|${b}`) ?? null);
    // prekrivanje: 13:30 < 13:00? ne — ampak gap 30 min < vožnja 2 h + 30 → premik na 15:30
    expect(days[0].locations[1].time_slot).toBe("15:30-16:30");
    // cena/trajanje/FIXED oznaka nedotaknjeni:
    expect(days[0].locations[1].estimated_cost).toBe(77);
    expect(days[0].locations[1].duration).toBe(1);
    expect(days[0].locations[1].notes).toBe("FIXED");
  });

  test("čista preslikava dneva — day/weather/id-ji ostanejo, spreminja se LE time_slot", () => {
    const day = mkDay(["09:00-13:00", "14:00-18:00"], ["triglav", "soca"]);
    const { days } = repairScheduleGaps([day], resolve);
    expect(days[0].day).toBe(1);
    expect(days[0].weather).toEqual(day.weather);
    expect(days[0].locations.map((l) => l.destination_id)).toEqual(["triglav", "soca"]);
    expect(days[0]).not.toBe(day); // nov objekt
  });
});
