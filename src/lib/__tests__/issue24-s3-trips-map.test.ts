// ISSUE #24 SKLOP 3 (1.165.0) — »Zemljevid mojih potovanj« (P3 NEW FEATURE
// CANDIDATE, Polarsteps profilni globus): pogodbenski + funkcionalni testi.
//
// Obseg:
//  ① FUNKCIONALNO pinsFromItinerary/pinsFromItineraryJson (čisti delivec):
//     T1 koordinate, OSM lastne koordinate, null-island, neveljavne oblike,
//     day atribucija, cap 120, vrstni red, fallback imena;
//  ② SOURCE-CONTRACT API route (varnostna disciplina brez DB):
//     rate limit, SHARE_ID_RE kanon, meja 50, zasebne poti SAMO lastnik,
//     NE poveča števca ogledov, čisti helper kot edini vir pinov;
//  ③ SOURCE-CONTRACT komponenta: escapeHtml na VSEM uporabniškem tekstu,
//     encodeURIComponent href, telemetrija samo ob uspehu, fail-closed null,
//     Rules of Hooks (zgodnji returni ZA zadnjim useEffect), a11y;
//  ④ SOURCE-CONTRACT integracija hub: obe veji (gost + prijavljeni) z
//     istim fallbackom imen kot kartice;
//  ⑤ ANALITIKA pariteta: my_trips_map_opened obstaja v klient unionu IN
//     strežniški VALID_EVENTS (isti kanon kot W3 parity test).
//
// Vzorec: source-contract readFileSync (isto kot issue22b / task8-f2c) +
// funkcionalni klici čistega helperja (0 DB — sandbox prijazen).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  pinsFromItinerary,
  pinsFromItineraryJson,
  TRIP_MAP_MAX_STOPS,
} from "../trips-map-pins";
import type { Itinerary, LocationVisit } from "../types";

const ROOT = join(import.meta.dir, "../../..");

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const ROUTE = source("src/app/api/trips/map-pins/route.ts");
const HELPER = source("src/lib/trips-map-pins.ts");
const COMPONENT = source("src/components/my-trips-map.tsx");
const HUB = source("src/app/moja-potovanja/moja-potovanja-view.tsx");
const ANALYTICS_UNION = source("src/lib/planner-analytics.ts");
const ANALYTICS_SERVER = source("src/app/api/analytics/event/route.ts");

/** Pritisni presledke/nove vrstice v en presledek (robustno na formatiranje). */
function norm(src: string): string {
  return src.replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// fiksture (isti minimalni kanon kot issue22b)
// ---------------------------------------------------------------------------

function stop(partial: Partial<LocationVisit> = {}): LocationVisit {
  return {
    destination_id: partial.destination_id ?? "bled",
    destination_name: partial.destination_name ?? "Bled",
    time_slot: partial.time_slot ?? "09:00-11:00",
    duration: partial.duration ?? 2,
    estimated_cost: partial.estimated_cost ?? 15,
    notes: partial.notes ?? "",
    ...partial,
  };
}

function fixtureItinerary(): Itinerary {
  return {
    days: [
      {
        day: 1,
        locations: [
          stop({ destination_name: "Bled" }),
          stop({
            destination_id: "vintgar",
            destination_name: "Vintgarska soteska",
          }),
        ],
        weather: { condition: "sončno", temp: 24 },
      },
      {
        day: 2,
        locations: [stop({ destination_name: "Bled (2. dan)" })],
        weather: { condition: "oblačno", temp: 20 },
      },
    ],
    total_budget: 30,
    recommendations: [],
    tips: [],
    source: "ai",
  };
}

// ---------------------------------------------------------------------------
// ① FUNKCIONALNO — čisti delivec pinov
// ---------------------------------------------------------------------------

describe("① pinsFromItinerary — čisti delivec (koordinate + dan + ime)", () => {
  test("T1 destinacije: koordinate iz dataseta (bled, vintgar) + day atribucija", () => {
    const pins = pinsFromItinerary(fixtureItinerary());
    expect(pins.length).toBe(3);
    expect(pins[0]).toEqual({ lat: 46.3683, lng: 14.0944, name: "Bled", day: 1 });
    expect(pins[1]).toEqual({
      lat: 46.4,
      lng: 14.1167,
      name: "Vintgarska soteska",
      day: 1,
    });
    // isti bled na dan 2 — pin obstaja (dan je atribut, ne dedupe)
    expect(pins[2]).toEqual({
      lat: 46.3683,
      lng: 14.0944,
      name: "Bled (2. dan)",
      day: 2,
    });
  });

  test("OSM kraj (1.42): lastne koordinate, ko destination_id NI v T1 datasetu", () => {
    const pins = pinsFromItinerary({
      days: [
        {
          day: 1,
          locations: [
            stop({
              destination_id: "osm-node-991",
              destination_name: "Zavrh pri Livkah",
              lat: 45.5,
              lng: 16.5,
            }),
          ],
        },
      ],
    });
    expect(pins).toEqual([
      { lat: 45.5, lng: 16.5, name: "Zavrh pri Livkah", day: 1 },
    ]);
  });

  test("null island (0,0) NI veljavna koordinata (TASK 50 §14 GEO)", () => {
    const pins = pinsFromItinerary({
      days: [
        {
          day: 1,
          locations: [
            stop({ destination_id: "socca", lat: 0, lng: 0 }),
            stop({ destination_id: "vintgar", destination_name: "Vintgar" }),
          ],
        },
      ],
    });
    // halucinirana koordinata izpade, pošteni pin ostane
    expect(pins.length).toBe(1);
    expect(pins[0].name).toBe("Vintgar");
  });

  test("neznan id BREZ lastnih koordinat → iskreno brez pina (ne izmišljuje)", () => {
    const pins = pinsFromItinerary({
      days: [
        {
          day: 1,
          locations: [
            stop({ destination_id: "ne-obstaja", destination_name: "Nikjer" }),
          ],
        },
      ],
    });
    expect(pins).toEqual([]);
  });

  test("ne-finite lat/lng → brez pina (NaN/Infinity ne grejo skozi)", () => {
    const pins = pinsFromItinerary({
      days: [
        {
          day: 1,
          locations: [
            stop({
              destination_id: "osm-node-x",
              destination_name: "X",
              lat: Number.NaN,
              lng: 14,
            }),
          ],
        },
      ],
    });
    expect(pins).toEqual([]);
  });

  test("day atribucija: manjkajoč/nepošten day → obrambni vrstni red + 1", () => {
    const pins = pinsFromItinerary({
      days: [
        { locations: [stop()] }, // brez day → index+1 = 1
        { day: 7, locations: [stop({ destination_id: "vintgar", destination_name: "V" })] },
        { day: 999, locations: [stop({ destination_name: "Bled" })] }, // >99 → index+1 = 3
      ],
    });
    expect(pins.map((p) => p.day)).toEqual([1, 7, 3]);
  });

  test("cap: TRIP_MAP_MAX_STOPS = 120 in se seznam pošteno odreže", () => {
    expect(TRIP_MAP_MAX_STOPS).toBe(120);
    const many = {
      days: [
        {
          day: 1,
          locations: Array.from({ length: 150 }, () => stop()),
        },
      ],
    };
    expect(pinsFromItinerary(many).length).toBe(120);
  });

  test("vrstni red pinov sledi vrstnemu redu postankov (ne sortira)", () => {
    const pins = pinsFromItinerary(fixtureItinerary());
    expect(pins.map((p) => p.name)).toEqual([
      "Bled",
      "Vintgarska soteska",
      "Bled (2. dan)",
    ]);
  });

  test("ime: trim + cap 80 + fallback na destination_id ko ime manjka", () => {
    const longName = "N".repeat(200);
    const pins = pinsFromItinerary({
      days: [
        {
          day: 1,
          locations: [
            stop({ destination_name: `  ${longName}  ` }),
            stop({ destination_id: "osm-node-7", destination_name: "", lat: 1, lng: 2 }),
          ],
        },
      ],
    });
    expect(pins[0].name).toBe("N".repeat(80));
    expect(pins[1].name).toBe("osm-node-7");
  });

  test("neveljaven JSON → [] (napaka parsiranja ne sesuje zemljevida)", () => {
    expect(pinsFromItineraryJson("{konec sveta")).toEqual([]);
    expect(pinsFromItineraryJson("null")).toEqual([]);
    expect(pinsFromItineraryJson("42")).toEqual([]);
  });

  test("ne-days oblike + posamezen smeten postanek → preskoči, ostane pošteno", () => {
    expect(pinsFromItinerary({})).toEqual([]);
    expect(pinsFromItinerary(null)).toEqual([]);
    expect(pinsFromItinerary({ days: "ne array" })).toEqual([]);
    expect(pinsFromItinerary({ days: [null, 42, { locations: 5 }] })).toEqual([]);
    // smeten lokacija med poštenimi
    const pins = pinsFromItinerary({
      days: [
        {
          day: 1,
          locations: [
            "smeti",
            null,
            stop({ destination_name: "Bled" }),
            { destination_id: 42 },
            stop({ destination_id: "vintgar", destination_name: "V" }),
          ],
        },
      ],
    });
    expect(pins.length).toBe(2);
    expect(pins[0].name).toBe("Bled");
    expect(pins[1].name).toBe("V");
  });

  test("veljaven JSON string okrogla pot (kanon shranjevanja)", () => {
    const json = JSON.stringify(fixtureItinerary());
    expect(pinsFromItineraryJson(json).length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// ② SOURCE-CONTRACT — API route (varnostna disciplina)
// ---------------------------------------------------------------------------

describe("② POST /api/trips/map-pins — varnostna disciplina", () => {
  test("rate limit 30/min s ključem trips-map-pins", () => {
    expect(
      norm(ROUTE).includes(
        'rateLimit(request, { limit: 30, windowMs: 60_000, key: "trips-map-pins", });'
      )
    ).toBe(true);
  });

  test("SHARE_ID_RE iz trip-permissions (EN kanon z /pot — ne lasten regex)", () => {
    expect(ROUTE).toContain(
      'import { SHARE_ID_RE } from "@/lib/trip-permissions";'
    );
    expect(norm(ROUTE)).toContain("SHARE_ID_RE.test(id)");
  });

  test("meja 50 ids na zahtevo + velikostno varovalo telesa 8 KB", () => {
    expect(norm(ROUTE)).toContain("MAX_IDS = 50");
    expect(norm(ROUTE)).toContain("MAX_BODY_BYTES = 8_192");
    expect(norm(ROUTE)).toContain("raw.length > MAX_BODY_BYTES");
  });

  test("zasebne poti SAMO lastnik: pogoj isPublic || userId === sessionUserId", () => {
    expect(norm(ROUTE)).toContain(
      "if (!row.isPublic && row.userId !== sessionUserId) continue;"
    );
  });

  test("NE poveča števca ogledov — nikakršen update/write na SavedItinerary", () => {
    // branje je findMany (select), celotna datoteka ne vsebuje update/save
    expect(norm(ROUTE)).toContain("db.savedItinerary.findMany");
    expect(norm(ROUTE)).not.toContain("update(");
    expect(norm(ROUTE)).not.toContain("updateMany");
    expect(norm(ROUTE)).not.toContain("increment");
    // dokumentirana odločitev v glavi route (iskrena nova površina brez štetja)
    expect(norm(ROUTE)).toContain("števec ogledov SE NE poveča");
  });

  test("pine izlušči IZKLJUČNO čisti helper pinsFromItineraryJson", () => {
    expect(ROUTE).toContain(
      'import { pinsFromItineraryJson, type TripMapPins } from "@/lib/trips-map-pins";'
    );
    expect(norm(ROUTE)).toContain("pinsFromItineraryJson(row.itinerary)");
  });

  test("tiho izpust neznanih id-jev (množična poizvedba ne potrdi obstoja)", () => {
    expect(norm(ROUTE)).toContain(
      'if (!row) continue; // neznani id — tiho izpust (brez potrditve obstoja)'
    );
  });

  test("helper je čist: ne uvaža db/next-auth (server-only odvisnosti ostanejo v routi)", () => {
    expect(HELPER).not.toContain('from "@/lib/db"');
    expect(HELPER).not.toContain("next-auth");
    // resolucija koordinat je IZVOŽENI kanon coordsOfStop
    expect(HELPER).toContain('import { coordsOfStop } from "./geo-validation"');
  });
});

// ---------------------------------------------------------------------------
// ③ SOURCE-CONTRACT — komponenta MyTripsMap
// ---------------------------------------------------------------------------

describe("③ MyTripsMap — iskrenost, varnost, dostopnost", () => {
  test("ena zahteva: POST /api/trips/map-pins z ids (ne N klicev na pot)", () => {
    expect(norm(COMPONENT)).toContain(
      'fetch("/api/trips/map-pins", { method: "POST"'
    );
    expect(norm(COMPONENT)).toContain(
      'JSON.stringify({ ids: list.map((t) => t.shareId) })'
    );
  });

  test("VES uporabniški tekst v tooltip/popup skozi escapeHtml (XSS varovalo)", () => {
    expect(COMPONENT).toContain('import { escapeHtml } from "@/lib/security"');
    const n = norm(COMPONENT);
    expect(n).toContain("`${escapeHtml(stop.name)} · ${escapeHtml(label)}`");
    expect(n).toContain("<strong>${escapeHtml(stop.name)}</strong>");
    expect(n).toContain("${escapeHtml(label)} · ${escapeHtml(T.day[lang])}");
  });

  test("href poti encodan (shareId iz nezaupnega localStorage)", () => {
    expect(norm(COMPONENT)).toContain(
      '"/pot/${encodeURIComponent(entry.shareId)}"'
    );
  });

  test("telemetrija my_trips_map_opened SAMO ob uspešnem prikazu pinov", () => {
    const n = norm(COMPONENT);
    expect(n).toContain(
      'trackPlannerEvent("my_trips_map_opened", { trips: list.length, pins: valid.length, })'
    );
    // klic živi ZNOTRAJ if (valid.length > 0) — ne ob praznem odgovoru
    const idxGuard = n.indexOf("if (valid.length > 0) {");
    const idxTrack = n.indexOf('trackPlannerEvent("my_trips_map_opened"');
    expect(idxGuard).toBeGreaterThanOrEqual(0);
    expect(idxTrack).toBeGreaterThan(idxGuard);
  });

  test("fail-closed: failed/empty/trips=0 → return null (brez mrtvega prostora)", () => {
    const n = norm(COMPONENT);
    expect(n).toContain(
      "if (trips.length === 0 || failed) return null;"
    );
    expect(n).toContain(
      "if (entries !== null && entries.length === 0) return null;"
    );
  });

  test("Rules of Hooks: zadnji useEffect PRED prvim returnom (pogojni hooki ne obstajajo)", () => {
    const n = norm(COMPONENT);
    const idxLastEffect = n.lastIndexOf("}, [entries]);");
    const idxFirstReturn = n.indexOf("if (trips.length === 0 || failed) return null;");
    expect(idxLastEffect).toBeGreaterThanOrEqual(0);
    expect(idxFirstReturn).toBeGreaterThan(idxLastEffect);
  });

  test("a11y: legenda aria-pressed, nalaganje aria-busy + sr-only, mapa role=img", () => {
    const n = norm(COMPONENT);
    expect(n).toContain("aria-pressed={visible}");
    expect(n).toContain('aria-busy="true"');
    expect(n).toContain("sr-only");
    expect(n).toContain('role="img"');
  });

  test("dvojezičnost {sl,en} celotnega slovarja T (kanon huba)", () => {
    const n = norm(COMPONENT);
    for (const key of [
      "title",
      "allTrips",
      "hint",
      "open",
      "day",
      "loadingAria",
      "mapAria",
      "legendAria",
    ]) {
      // vsak list slovarja se prične s SL nizom (privzeti jezik površine)
      expect(n).toContain(`${key}: { sl: "`);
    }
    // in ima vsak tudi EN protistr (ciljni nizi, ne zgolj oblika)
    expect(n).toContain('title: { sl: "Zemljevid mojih potovanj", en: "My trips on a map"');
    expect(n).toContain('allTrips: { sl: "Vsi", en: "All"');
    expect(n).toContain('open: { sl: "Odpri pot", en: "Open trip"');
    // tripsCount je funkcijski list (množinska logika SL/EN — isti vzorec kot hub)
    expect(n).toContain("tripsCount: { sl: (n: number)");
    expect(n).toMatch(/en: \(n: number\) =>/);
  });
});

// ---------------------------------------------------------------------------
// ④ SOURCE-CONTRACT — integracija hub /moja-potovanja
// ---------------------------------------------------------------------------

describe("④ Hub integracija — obe veji, isti fallback imen kot kartice", () => {
  test("uvoz MyTripsMap", () => {
    expect(HUB).toContain(
      'import { MyTripsMap } from "@/components/my-trips-map";'
    );
  });

  test("GOSTOV pogled: zemljevid pod lokalnimi karticami (localTrips !== null)", () => {
    const n = norm(HUB);
    expect(n).toContain("localTrips !== null && trips.length > 0 && (");
    // gostov fallback imena = isti kanon kot kartice (fallbackName + savedAt)
    expect(n).toContain(
      "t.name ?? L.trips.fallbackName[lang](formatDate(t.savedAt, lang))"
    );
  });

  test("PRIJAVLJEN pogled: zemljevid pod karticami računa (data.trips)", () => {
    const n = norm(HUB);
    expect(n).toContain(
      "t.name ?? L.trips.fallbackName[lang](formatDate(t.createdAt, lang))"
    );
  });

  test("obe veji podajata lang (L-vzorec {sl,en} podeduje jezik huba)", () => {
    const n = norm(HUB);
    expect((n.match(/<MyTripsMap/g) ?? []).length).toBe(2);
    expect((n.match(/lang=\{lang\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// ⑤ ANALITIKA — pariteta klient union ↔ strežniška VALID_EVENTS
// ---------------------------------------------------------------------------

describe("⑤ my_trips_map_opened — pariteta analitike", () => {
  test("obstaja v PlannerEventName (klient) IN VALID_EVENTS (strežnik)", () => {
    expect(ANALYTICS_UNION).toContain('| "my_trips_map_opened"');
    expect(ANALYTICS_SERVER).toContain('"my_trips_map_opened"');
  });
});
