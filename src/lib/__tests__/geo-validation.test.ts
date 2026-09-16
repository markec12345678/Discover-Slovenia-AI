import { describe, test, expect } from "bun:test";
import { validateItineraryGeo } from "@/lib/geo-validation";
import { legKey, type LegRouteIndex, type LegRoute } from "@/lib/road-routing";
import type { Itinerary, LocationVisit } from "@/lib/types";

// ============================================================================
// 1.29.0 (uporabnikova revizija #14): GEO regresijski testi.
//
// validateItineraryGeo je ČISTA funkcija (isto na serverju in clientu) —
// P0.2 GEO-VALIDACIJA je rešila pilotske napake (10 ERROR dni, najslabši
// 337 km), a do zdaj NI imela nobenega unit testa (geo.test.ts pokriva
// host/robots/sitemap, ne validacijskih pravil). Ti testi kodirajo vsako
// pravilo iz glave geo-validation.ts (1–10) z realnimi koordinatami
// destinacij iz slovenia-data.ts — brez ruganja z internals.
// ============================================================================

/** Minimalen veljaven postanek (polja, ki jih validacija dejansko bere). */
function stop(
  id: string,
  name: string,
  slot = "09:00-12:00",
  duration = 2
): LocationVisit {
  return {
    destination_id: id,
    destination_name: name,
    time_slot: slot,
    duration,
    estimated_cost: 0,
    notes: "",
  };
}

function itineraryOf(
  days: { day: number; stops: LocationVisit[] }[],
  tripStartDate?: string
): Itinerary {
  return {
    days: days.map((d) => ({
      day: d.day,
      locations: d.stops,
      weather: { condition: "sončno", temp: 20 },
    })),
    total_budget: 0,
    recommendations: [],
    tips: [],
    source: "fallback",
    ...(tripStartDate ? { tripStartDate } : {}),
  };
}

function rulesOf(v: ReturnType<typeof validateItineraryGeo>) {
  return v.issues.map((i) => `${i.rule}:${i.level}`);
}

// ---------------------------------------------------------------------------
// Pravilo 0 (baza): kratek dan brez težav → worst "ok"
// ---------------------------------------------------------------------------

describe("validateItineraryGeo — osnova", () => {
  test("kratek dan (Bled → Bohinj) brez opozoril → worst ok, metrike prisotne", () => {
    const v = validateItineraryGeo(
      itineraryOf([
        {
          day: 1,
          stops: [
            stop("bled", "Bled", "09:00-12:00"),
            stop("bohinj", "Bohinj", "13:00-16:00"), // 1 h vrzeli ≥ vožnja + 15 min
          ],
        },
      ])
    );
    expect(v.worst).toBe("ok");
    expect(v.issues).toHaveLength(0);
    expect(v.days).toHaveLength(1);
    expect(v.days[0].stops).toBe(2);
    // hevristika: haversine(Bled,Bohinj) × 1,3 → zaokroženo na 5
    expect(v.days[0].km).toBeGreaterThan(0);
    expect(v.tripKm).toBe(v.days[0].km);
    // brez indeksa nog → metoda NI razkrita (client, stari načrti)
    expect(v.method).toBeUndefined();
  });

  test("prazen načrt (0 dni) → prazne metrike, worst ok, tripKm 0", () => {
    const v = validateItineraryGeo(itineraryOf([]));
    expect(v.days).toHaveLength(0);
    expect(v.issues).toHaveLength(0);
    expect(v.tripKm).toBe(0);
    expect(v.worst).toBe("ok");
  });

  test("km so vedno zaokroženi na 5 (brez lažne natančnosti)", () => {
    const v = validateItineraryGeo(
      itineraryOf([
        {
          day: 1,
          stops: [
            stop("ljubljana", "Ljubljana", "09:00-12:00"),
            stop("bled", "Bled", "14:00-16:00"),
          ],
        },
      ])
    );
    for (const d of v.days) {
      expect(d.km % 5).toBe(0);
      expect(d.drivingMinutes % 5).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Pravilo 1: kilometri na dan (> 150 WARN, > 250 ERROR) — regresija P0-2
// (pilot: najslabši dan 337 km)
// ---------------------------------------------------------------------------

describe("pravilo 1 — day_km", () => {
  test("Prekmurje → Primorska v enem dnevu → day_km ERROR (regresija 337 km pilota)", () => {
    const v = validateItineraryGeo(
      itineraryOf([
        { day: 1, stops: [stop("murska-sobota", "Murska Sobota"), stop("piran", "Piran")] },
      ])
    );
    const rules = rulesOf(v);
    expect(rules).toContain("day_km:error");
    // vsak dan 337 km pomeni tudi pre dolgo posamično etapo — ERROR
    expect(rules).toContain("leg_distance:error");
    expect(v.worst).toBe("error");
    expect(v.days[0].km).toBeGreaterThanOrEqual(250);
  });

  test("zmerni prevozni dan (~160–250 km, 3 postanki) → day_km WARN, ne ERROR", () => {
    // Maribor → Ljubljana → Postojna ≈ 135 + 45 = 180 km ceste (hevristika)
    const v = validateItineraryGeo(
      itineraryOf([
        {
          day: 1,
          stops: [
            stop("maribor", "Maribor", "08:00-10:00"),
            stop("ljubljana", "Ljubljana", "13:00-15:00"), // 3 h vrzeli ≥ ~2,7 h vožnje
            stop("postojna", "Postojna", "16:30-18:00"), // 1,5 h vrzeli ≥ ~1 h vožnje
          ],
        },
      ])
    );
    const rules = rulesOf(v);
    expect(rules).toContain("day_km:warn");
    expect(rules).not.toContain("day_km:error");
  });
});

// ---------------------------------------------------------------------------
// Pravilo 2: število glavnih postankov (> 4 WARN, > 5 ERROR)
// ---------------------------------------------------------------------------

describe("pravilo 2 — day_stops", () => {
  test("6 postankov v gorenjskem grozdu → day_stops ERROR", () => {
    const v = validateItineraryGeo(
      itineraryOf([
        {
          day: 1,
          stops: [
            stop("bled", "Bled"),
            stop("bohinj", "Bohinj"),
            stop("kranjska-gora", "Kranjska Gora"),
            stop("kobarid", "Kobarid"),
            stop("soca", "Soča"),
            stop("triglav", "Triglav"),
          ],
        },
      ])
    );
    const rules = rulesOf(v);
    expect(rules).toContain("day_stops:error");
    expect(v.days[0].stops).toBe(6);
  });

  test("5 postankov → day_stops WARN (nad 4, pod 5)", () => {
    const v = validateItineraryGeo(
      itineraryOf([
        {
          day: 1,
          stops: [
            stop("bled", "Bled"),
            stop("bohinj", "Bohinj"),
            stop("kranjska-gora", "Kranjska Gora"),
            stop("kobarid", "Kobarid"),
            stop("soca", "Soča"),
          ],
        },
      ])
    );
    expect(rulesOf(v)).toContain("day_stops:warn");
  });
});

// ---------------------------------------------------------------------------
// Pravilo 3: zaporedna razdalja med točkama (> 80 WARN, > 150 ERROR)
// ---------------------------------------------------------------------------

describe("pravilo 3 — leg_distance", () => {
  test("Ljubljana → Piran (~100 km ceste) → leg_distance WARN", () => {
    const v = validateItineraryGeo(
      itineraryOf([
        { day: 1, stops: [stop("ljubljana", "Ljubljana"), stop("piran", "Piran")] },
      ])
    );
    const rules = rulesOf(v);
    expect(rules).toContain("leg_distance:warn");
    expect(rules).not.toContain("leg_distance:error");
  });
});

// ---------------------------------------------------------------------------
// Pravila 5 + 7: urnik (vrzel/prekrivanje) in manjkajoče koordinate
// ---------------------------------------------------------------------------

describe("pravilo 5 — schedule_gap / schedule_overlap", () => {
  test("prekrivajoča termina → schedule_overlap ERROR", () => {
    const v = validateItineraryGeo(
      itineraryOf([
        {
          day: 1,
          stops: [
            stop("bled", "Bled", "09:00-12:00"),
            stop("bohinj", "Bohinj", "11:00-14:00"), // začne pred koncem prejšnjega
          ],
        },
      ])
    );
    expect(rulesOf(v)).toContain("schedule_overlap:error");
  });

  test("vrzel 15 min za etapo, ki vzame ure → schedule_gap ERROR", () => {
    const v = validateItineraryGeo(
      itineraryOf([
        {
          day: 1,
          stops: [
            stop("piran", "Piran", "09:00-09:30"),
            stop("maribor", "Maribor", "09:45-12:00"), // 0,25 h vrzeli, vožnja ~4 h
          ],
        },
      ])
    );
    const rules = rulesOf(v);
    expect(rules).toContain("schedule_gap:error");
    expect(v.worst).toBe("error");
  });

  test("urnik, ki DIHA (vrzel ≥ vožnja + 15 min) → brez schedule opozoril", () => {
    const v = validateItineraryGeo(
      itineraryOf([
        {
          day: 1,
          stops: [
            stop("bled", "Bled", "09:00-11:00"),
            stop("bohinj", "Bohinj", "16:00-18:00"), // 5 h vrzeli za ~15 km etapo
          ],
        },
      ])
    );
    const rules = rulesOf(v);
    expect(rules).not.toContain("schedule_gap:warn");
    expect(rules).not.toContain("schedule_gap:error");
  });
});

describe("pravilo 7 — missing_coords", () => {
  test("neznan destination_id → missing_coords ERROR (razdalje so lahko podcenjene)", () => {
    const v = validateItineraryGeo(
      itineraryOf([{ day: 1, stops: [stop("ne-obstaja", "Izmišljeno")] }])
    );
    expect(rulesOf(v)).toContain("missing_coords:error");
  });
});

// ---------------------------------------------------------------------------
// Pravilo 6: isti kraj dvakrat isti dan
// ---------------------------------------------------------------------------

describe("pravilo 6 — duplicate_stop", () => {
  test("Bled dvakrat isti dan → duplicate_stop WARN", () => {
    const v = validateItineraryGeo(
      itineraryOf([
        {
          day: 1,
          stops: [
            stop("bled", "Bled", "09:00-11:00"),
            stop("bohinj", "Bohinj", "11:30-13:30"),
            stop("bled", "Bled", "14:00-16:00"),
          ],
        },
      ])
    );
    expect(rulesOf(v)).toContain("duplicate_stop:warn");
  });
});

// ---------------------------------------------------------------------------
// Pravili 9 + 10 (F5.5): odpiralni časi — SAMO z znanim tripStartDate
// ---------------------------------------------------------------------------

describe("pravili 9 + 10 — closed_month / closed_weekday", () => {
  test("Vintgar novembra (destination-level) → closed_month ERROR", () => {
    const v = validateItineraryGeo(
      itineraryOf([{ day: 1, stops: [stop("vintgar", "Soteska Vintgar")] }], "2027-11-10"),
      "sl"
    );
    const rules = rulesOf(v);
    expect(rules).toContain("closed_month:error");
  });

  test("Vintgar julija → brez closed_month (odprta april–oktober)", () => {
    const v = validateItineraryGeo(
      itineraryOf([{ day: 1, stops: [stop("vintgar", "Soteska Vintgar")] }], "2027-07-10")
    );
    expect(rulesOf(v)).not.toContain("closed_month:error");
    expect(rulesOf(v)).not.toContain("closed_month:warn");
  });

  test("Ptuj ob ponedeljku (atrakcija) → closed_weekday WARN (2027-01-04 je ponedeljek)", () => {
    const v = validateItineraryGeo(
      itineraryOf([{ day: 1, stops: [stop("ptuj", "Ptuj")] }], "2027-01-04")
    );
    expect(rulesOf(v)).toContain("closed_weekday:warn");
  });

  test("BREZ tripStartDate → pravili odpiralnih časov NE veljata (brez trditev)", () => {
    // ista Ptuj destinacija, a brez datuma — ni poštene trditve o dnevu
    const v = validateItineraryGeo(
      itineraryOf([{ day: 1, stops: [stop("ptuj", "Ptuj")] }])
    );
    const rules = rulesOf(v);
    expect(rules).not.toContain("closed_weekday:warn");
    expect(rules).not.toContain("closed_month:error");
  });

  test("drugi dan potovanja pade na ponedeljek (start nedelja) → zaprtje zajeto na dan 2", () => {
    const v = validateItineraryGeo(
      itineraryOf(
        [
          { day: 1, stops: [stop("ljubljana", "Ljubljana")] },
          { day: 2, stops: [stop("ptuj", "Ptuj")] },
        ],
        "2027-01-03" // nedelja → dan 2 = 2027-01-04 ponedeljek
      )
    );
    const ptujIssues = v.issues.filter((i) => i.day === 2 && i.rule === "closed_weekday");
    expect(ptujIssues).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Lokalizacija sporočil (lang parameter)
// ---------------------------------------------------------------------------

describe("lokalizacija sporočil", () => {
  const overloaded = itineraryOf([
    { day: 1, stops: [stop("murska-sobota", "Murska Sobota"), stop("piran", "Piran")] },
  ]);

  test("lang=sl → slovensko sporočilo (ključne besede)", () => {
    const v = validateItineraryGeo(overloaded, "sl");
    const dayKm = v.issues.find((i) => i.rule === "day_km");
    expect(dayKm).toBeDefined();
    expect(dayKm!.message).toContain("vožnje v enem dnevu");
  });

  test("lang=en → angleško sporočilo (ključne besede)", () => {
    const v = validateItineraryGeo(overloaded, "en");
    const dayKm = v.issues.find((i) => i.rule === "day_km");
    expect(dayKm).toBeDefined();
    expect(dayKm!.message).toContain("driving in one day");
  });
});

// ---------------------------------------------------------------------------
// F5.6: indeks nog (OSRM) — metoda razkritja + realne ceste povozijo hevristiko
// ---------------------------------------------------------------------------

describe("F5.6 — indeks nog (road routing)", () => {
  test("OSRM noga povozí hevristiko: km/min iz indeksa + method \"osrm\"", () => {
    const legs: LegRouteIndex = new Map();
    const osrmLeg: LegRoute = {
      km: 20,
      min: 25,
      source: "osrm",
      geometry: [
        [46.36, 14.11],
        [46.28, 13.87],
      ],
    };
    legs.set(legKey("bled", "bohinj"), osrmLeg);

    const v = validateItineraryGeo(
      itineraryOf([{ day: 1, stops: [stop("bled", "Bled"), stop("bohinj", "Bohinj")] }]),
      "sl",
      legs
    );
    expect(v.method).toBe("osrm");
    expect(v.days[0].km).toBe(20); // iz indeksa, ne haversine × 1,3
    expect(v.days[0].drivingMinutes).toBe(25);
    expect(v.tripKm).toBe(20);
  });

  test("prazen indeks (0 nog) → method \"heuristic\"", () => {
    const v = validateItineraryGeo(
      itineraryOf([{ day: 1, stops: [stop("bled", "Bled"), stop("bohinj", "Bohinj")] }]),
      "sl",
      new Map()
    );
    expect(v.method).toBe("heuristic");
  });

  test("mešan indeks (osrm + heuristic) → method \"mixed\"", () => {
    const legs: LegRouteIndex = new Map();
    legs.set(legKey("bled", "bohinj"), { km: 20, min: 25, source: "osrm" });
    legs.set(legKey("bohinj", "kobarid"), { km: 60, min: 70, source: "heuristic" });

    const v = validateItineraryGeo(
      itineraryOf([
        {
          day: 1,
          stops: [stop("bled", "Bled"), stop("bohinj", "Bohinj"), stop("kobarid", "Kobarid")],
        },
      ]),
      "sl",
      legs
    );
    expect(v.method).toBe("mixed");
  });

  test("noga v napačni smeri (ključ B|A) se NE uporabi — smer poti šteje", () => {
    const legs: LegRouteIndex = new Map();
    // indeks ima samo obratni vrstni red — klic išče A|B
    legs.set(legKey("bohinj", "bled"), { km: 20, min: 25, source: "osrm" });

    const v = validateItineraryGeo(
      itineraryOf([{ day: 1, stops: [stop("bled", "Bled"), stop("bohinj", "Bohinj")] }]),
      "sl",
      legs
    );
    // hevristika je bila uporabljena (km ≠ 20), metoda ostane heuristic
    expect(v.method).toBe("heuristic");
    expect(v.days[0].km).not.toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Defenzivnost: deformirani vhodi (pilot: AI JSON je lahko čuden)
// ---------------------------------------------------------------------------

describe("defenzivnost", () => {
  test("neparsable time_slot → pravilo urnika se preskoči (brez ugibanj)", () => {
    const v = validateItineraryGeo(
      itineraryOf([
        {
          day: 1,
          stops: [
            stop("bled", "Bled", "cel dan"),
            stop("bohinj", "Bohinj", "zvečer"),
          ],
        },
      ])
    );
    const rules = rulesOf(v);
    expect(rules).not.toContain("schedule_overlap:error");
    expect(rules).not.toContain("schedule_gap:warn");
    expect(rules).not.toContain("schedule_gap:error");
  });

  test("day brez locations → metrike dneva obstajajo z ničlami", () => {
    const v = validateItineraryGeo(itineraryOf([{ day: 1, stops: [] }]));
    expect(v.days).toHaveLength(1);
    expect(v.days[0].stops).toBe(0);
    expect(v.days[0].km).toBe(0);
  });
});
