import { describe, expect, test } from "bun:test";
import {
  dayZigzagQuality,
  mealStopWindow,
  LUNCH_WINDOW,
  DINNER_WINDOW,
} from "../day-quality";
import type { LocationVisit } from "../types";

// ============================================================================
// W11-B „DOKAZLJIVO UREJEN DAN" — testi čiste logike.
//
// Kanon koordinat: T1 dataset (bled/vintgar/piran/triglav so vsi vanj);
// backtracking definicija = M3 (geo-coherence, R_VISIT 30 km / D_LEFT 45 km).
// Obroki: kosilo [12,14), večerja [18,21); ključne besede SL/EN/IT/DE.
// ============================================================================

/** Pomočnik: postanek s T1 ID-jem (koordinate iz dataseta). */
function t1(
  id: string,
  name: string,
  timeSlot: string,
  extra: Partial<LocationVisit> = {}
): LocationVisit {
  return {
    destination_id: id,
    destination_name: name,
    time_slot: timeSlot,
    duration: 2,
    estimated_cost: 10,
    notes: "",
    ...extra,
  };
}

describe("dayZigzagQuality — M3 kanon (ista preverba kot engine)", () => {
  test("koherenten dan (Bled → Vintgar, ~5 km) → verifiable + zigzagFree", () => {
    const q = dayZigzagQuality({
      locations: [t1("bled", "Bled", "09:00-13:00"), t1("vintgar", "Vintgarska soteska", "14:00-18:00")],
    });
    expect(q.verifiable).toBe(true);
    expect(q.zigzagFree).toBe(true);
    expect(q.backtrackingEvents).toBe(0);
    expect(q.knownCoords).toBe(2);
  });

  test("klasični cik-cak (Bled → Piran → nazaj Bled) → NI zigzagFree", () => {
    // Bled→Piran ≈ 100 km haversine (odhod > 45 km), Piran→Bled vračanje
    // v območje Bleda (< 30 km) — točno M3 definicija vračanja.
    const q = dayZigzagQuality({
      locations: [
        t1("bled", "Bled", "09:00-11:00"),
        t1("piran", "Piran", "13:00-15:00"),
        t1("vintgar", "Vintgar (bližina Bleda)", "17:00-19:00"),
      ],
    });
    expect(q.verifiable).toBe(true);
    expect(q.zigzagFree).toBe(false);
    expect(q.backtrackingEvents).toBe(1);
  });

  test("gruča < 45 km (Triglav → Soča → Bohinj) NI cik-cak — legitimna raziskava", () => {
    // Dokumentirana semantika M3: lokalna gruča se ne šteje kot vračanje.
    const q = dayZigzagQuality({
      locations: [
        t1("triglav", "Triglav", "09:00-11:00"),
        t1("soca", "Reka Soča", "12:00-14:00"),
        t1("bohinj", "Bohinj", "16:00-18:00"),
      ],
    });
    expect(q.verifiable).toBe(true);
    expect(q.zigzagFree).toBe(true);
    expect(q.backtrackingEvents).toBe(0);
  });

  test("< 2 postanka → NI verifiable (trivialno ni dokaza, ne trdimo)", () => {
    const q = dayZigzagQuality({ locations: [t1("bled", "Bled", "09:00-13:00")] });
    expect(q.verifiable).toBe(false);
    expect(q.zigzagFree).toBe(false);
  });

  test("manjkajoče koordinate (neznan ID + brez lat/lng) → NI verifiable (iskreno)", () => {
    // Lažno zelena bi bila, če bi manjkajoči postanek tiho preskočili —
    // ravno on bi lahko bil vračanje. Fail-closed.
    const q = dayZigzagQuality({
      locations: [
        t1("bled", "Bled", "09:00-11:00"),
        {
          ...t1("neznan-id", "Nepoznan kraj", "13:00-15:00"),
          destination_id: "id-ki-ni-v-datasetu",
        },
        t1("vintgar", "Vintgar", "17:00-19:00"),
      ],
    });
    expect(q.verifiable).toBe(false);
    expect(q.zigzagFree).toBe(false);
    expect(q.knownCoords).toBe(2);
    expect(q.stops).toBe(3);
  });

  test("lastne koordinate (supply/klepet postanek) se upoštevajo", () => {
    const q = dayZigzagQuality({
      locations: [
        t1("bled", "Bled", "09:00-11:00"),
        {
          ...t1("supply-1", "Gostilna pri Ani", "12:00-14:00"),
          destination_id: "supply-1",
          lat: 46.3,
          lng: 14.1,
        },
      ],
    });
    expect(q.verifiable).toBe(true);
    expect(q.zigzagFree).toBe(true);
  });

  test("null island (0,0) se NE šteje kot znana koordinata", () => {
    const q = dayZigzagQuality({
      locations: [
        t1("bled", "Bled", "09:00-11:00"),
        {
          ...t1("osm-bad", "Kraj s pokvarjenimi koordinatami", "12:00-14:00"),
          destination_id: "osm-bad",
          lat: 0,
          lng: 0,
        },
      ],
    });
    expect(q.verifiable).toBe(false);
    expect(q.knownCoords).toBe(1);
  });

  test("prazen dan → nič ne trdimo", () => {
    const q = dayZigzagQuality({ locations: [] });
    expect(q.verifiable).toBe(false);
    expect(q.zigzagFree).toBe(false);
    expect(q.stops).toBe(0);
  });
});

describe("mealStopWindow — obrok v kanonskem razponu", () => {
  test("restavracija s terminom 13:00 → kosilo", () => {
    expect(
      mealStopWindow({
        destination_name: "Gostilna pri Lipcu",
        notes: "Kosilo z lokalnimi s specialitetami",
        time_slot: "13:00-14:30",
      })
    ).toBe("lunch");
  });

  test("restavracija s terminom 19:30 → večerja", () => {
    expect(
      mealStopWindow({
        destination_name: "Restavracija Marog",
        notes: "",
        time_slot: "19:30-21:00",
      })
    ).toBe("dinner");
  });

  test("termin 16:00 (med razponoma) → null (iskreno brez žetona)", () => {
    expect(
      mealStopWindow({
        destination_name: "Gostilna Sokol",
        notes: "",
        time_slot: "16:00-17:30",
      })
    ).toBeNull();
  });

  test("kosilo ob 11:30 → null (zunaj kanonskega [12,14))", () => {
    expect(
      mealStopWindow({
        destination_name: "Zajtrk in kosilo",
        notes: "",
        time_slot: "11:30-13:00",
      })
    ).toBeNull();
  });

  test("NE-obročni postanek (muzej) ob 13:00 → null", () => {
    expect(
      mealStopWindow({
        destination_name: "Narodni muzej",
        notes: "Stalna zbirka",
        time_slot: "13:00-15:00",
      })
    ).toBeNull();
  });

  test("obrok brez parsabilnega termina → null", () => {
    expect(
      mealStopWindow({
        destination_name: "Gostilna pri Ani",
        notes: "",
        time_slot: "popoldne",
      })
    ).toBeNull();
  });

  test("ključne besede IT/DE se prepoznajo (ristorante / Wirtshaus)", () => {
    expect(
      mealStopWindow({
        destination_name: "Ristorante Da Mario",
        notes: "",
        time_slot: "12:30-14:00",
      })
    ).toBe("lunch");
    expect(
      mealStopWindow({
        destination_name: "Wirtshaus am See",
        notes: "",
        time_slot: "19:00-21:00",
      })
    ).toBe("dinner");
  });

  test("večerja ob 21:00 natanko → null ([18,21) zgornja meja izključena)", () => {
    expect(
      mealStopWindow({
        destination_name: "Restavracija zvezda",
        notes: "",
        time_slot: "21:00-22:30",
      })
    ).toBeNull();
  });

  test("razpona sta kanonska: kosilo 12–14, večerja 18–21", () => {
    expect(LUNCH_WINDOW).toEqual({ fromH: 12, toH: 14 });
    expect(DINNER_WINDOW).toEqual({ fromH: 18, toH: 21 });
  });
});
