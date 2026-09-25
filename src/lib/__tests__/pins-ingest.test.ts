// ============================================================================
// T5-b1 / M4 (Issue #5 fix val 1) — PINS-INGEST: unit testi (prej 0 pokritosti)
// ============================================================================
//
// ZADEVA: src/lib/pins-ingest.ts (F14 "Uvozi shranjene točke", ~400 vrstic)
// je po reviziji T5-a2 edini ingest vir BREZ testne pokritosti (M4 v
// docs/PRODUCT-FUNCTIONALITY-MATRIX.md §5). Ta datoteka pokriva:
//
//   1. PARSER (parsePins) — vse tri vhodne oblike:
//      · Google Takeout "Saved Places.json" (GeoJSON FeatureCollection,
//        koordinate v vrstnem redu [lng, lat] — klasična past!),
//      · KML (<Placemark> z <name> in <coordinates>lng,lat[,alt]</…>),
//      · navaden besedilni seznam (ena točka na vrstico, oznake seznama
//        "-", "•", "1." se odstranijo);
//   2. MATCHER (matchPins) — deterministično ujemanje z destinacijami:
//      · po koordinatah: najbližja destinacija v polmeru PIN_COORD_RADIUS_KM
//        (25 km) ima PREDNOST (hoteli/restavracije blizu kraja),
//      · po imenu: vzorci iz url-ingest PATTERNS (en vir resnice), besedne
//        meje, diakritika-neobčutljivo, najdaljši vzorec zmaga,
//      · izven polmera → pošten fallback na ime; brez obeh → pinsUnmatched
//        (NIČ se ne izmišljuje — iskrenostna pogodba F14);
//   3. ROBNI PRIMERI: prazen vhod, pokvarjen JSON, KML brez Placemark-ov,
//      koordinate izven obsega / null island, meja MAX_PINS (2000),
//      oblika rezultata pri 0 zadetkih;
//   4. PREDLOGI (suggestion): dnevi ~2 destinaciji na dan (1–7), interesi
//      iz bestFor (BESTFOR_TO_INTEREST — en vir), rangiranje po pinCount.
//
// Koordinate v fixture-ih so REALNE koordinate iz slovenia-data.ts
// (bled 46.3683/14.0944, piran 45.5233/13.5676, bohinj 46.2833/13.8833 …).
// ============================================================================

import { describe, test, expect } from "bun:test";
import {
  parsePins,
  matchPins,
  ingestPins,
  PIN_COORD_RADIUS_KM,
  MAX_PINS,
  type PinItem,
} from "@/lib/pins-ingest";
import { PATTERNS, BESTFOR_TO_INTEREST } from "@/lib/url-ingest";
import { DESTINATIONS } from "@/lib/slovenia-data";

// --- fixture-i (realne koordinate destinacij iz dataseta) -------------------

const BLED = DESTINATIONS.find((d) => d.id === "bled")!.coords; // 46.3683, 14.0944
const PIRAN = DESTINATIONS.find((d) => d.id === "piran")!.coords; // 45.5233, 13.5676
const BOHINJ = DESTINATIONS.find((d) => d.id === "bohinj")!.coords; // 46.2833, 13.8833

/** Google Takeout "Saved Places.json" — GeoJSON [lng, lat] vrstni red. */
const TAKEOUT_JSON = JSON.stringify({
  type: "FeatureCollection",
  features: [
    {
      properties: { Title: "Bled Castle" },
      geometry: { coordinates: [14.0944, 46.3683] },
    },
    {
      properties: { Title: "Piran old town" },
      geometry: { coordinates: [13.5676, 45.5233] },
    },
  ],
});

/** KML izvoz zemljevidov — <name> + <coordinates>lng,lat[,alt]</…>. */
const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Blejski grad &amp; otok</name>
      <Point><coordinates>14.0944,46.3683,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Tartinijev trg</name>
      <Point><coordinates>13.5676,45.5233</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;

// ---------------------------------------------------------------------------
// 1. PARSER — Google Takeout JSON (GeoJSON)
// ---------------------------------------------------------------------------

describe("parsePins — Google Takeout JSON (GeoJSON FeatureCollection)", () => {
  test("Title + geometry.coordinates [lng, lat] → geojson; lat je DRUGA številka (past vrstnega reda)", () => {
    const { format, pins } = parsePins(TAKEOUT_JSON);
    expect(format).toBe("geojson");
    expect(pins).toHaveLength(2);
    // GeoJSON vrstni red je [lng, lat] — parser ga MORA preklopiti
    expect(pins[0]).toEqual({
      title: "Bled Castle",
      lat: 46.3683,
      lng: 14.0944,
    });
    expect(pins[1]!.lat).toBe(45.5233);
    expect(pins[1]!.lng).toBe(13.5676);
  });

  test("alternativna oblika: properties.location {latitude, longitude}", () => {
    const raw = JSON.stringify({
      features: [
        {
          properties: {
            name: "Bohinjsko jezero",
            location: { latitude: 46.2833, longitude: 13.8833 },
          },
        },
      ],
    });
    const { format, pins } = parsePins(raw);
    expect(format).toBe("geojson");
    expect(pins).toHaveLength(1);
    expect(pins[0]).toEqual({
      title: "Bohinjsko jezero",
      lat: 46.2833,
      lng: 13.8833,
    });
  });

  test("veljaven JSON brez features (ni FeatureCollection) → pošten fallback na besedilni seznam", () => {
    const { format, pins } = parsePins('{"error": "not a takeout export"}');
    // 0 točk iz GeoJSON plasti → ni lažne "geojson" oblike
    expect(format).toBe("text");
    expect(pins).toHaveLength(1); // cela vrstica kot ena besedilna točka
    expect(pins[0]!.lat).toBeNull();
  });

  test("koordinate izven obsega (lat 999) → zavrnjene; točka z naslovom ostane brez geo", () => {
    const raw = JSON.stringify({
      features: [
        {
          properties: { Title: "Weird pin" },
          geometry: { coordinates: [999, 999] },
        },
      ],
    });
    const { pins } = parsePins(raw);
    expect(pins).toHaveLength(1);
    expect(pins[0]!.title).toBe("Weird pin");
    expect(pins[0]!.lat).toBeNull();
    expect(pins[0]!.lng).toBeNull();
  });

  test("brez naslova IN z neveljavnimi koordinatami → točka je IZPUŠČENA", () => {
    const raw = JSON.stringify({
      features: [
        { properties: {}, geometry: { coordinates: [999, 999] } },
        { properties: { Title: "OK" }, geometry: { coordinates: [14.0944, 46.3683] } },
      ],
    });
    const { pins } = parsePins(raw);
    expect(pins).toHaveLength(1);
    expect(pins[0]!.title).toBe("OK");
  });

  test("null island (0,0) NI veljavna koordinata (prazen GeoJSON fallback)", () => {
    const raw = JSON.stringify({
      features: [{ properties: { Title: "Null island" }, geometry: { coordinates: [0, 0] } }],
    });
    const { pins } = parsePins(raw);
    expect(pins).toHaveLength(1);
    expect(pins[0]!.lat).toBeNull();
    expect(pins[0]!.lng).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. PARSER — KML
// ---------------------------------------------------------------------------

describe("parsePins — KML (Placemark)", () => {
  test("<name> + <coordinates>lng,lat[,alt] → kml; dekodirane XML entitete", () => {
    const { format, pins } = parsePins(KML);
    expect(format).toBe("kml");
    expect(pins).toHaveLength(2);
    // &amp; → &; višina (alt) za dvema koordinatama se ignorira
    expect(pins[0]).toEqual({
      title: "Blejski grad & otok",
      lat: 46.3683,
      lng: 14.0944,
    });
    expect(pins[1]).toEqual({
      title: "Tartinijev trg",
      lat: 45.5233,
      lng: 13.5676,
    });
  });

  test("KML brez <Placemark> (prazna datoteka) → fallback na besedilni seznam", () => {
    const { format, pins } = parsePins(
      '<?xml version="1.0"?><kml><Document></Document></kml>'
    );
    expect(format).toBe("text");
    expect(pins).toHaveLength(1); // cela vrstica kot ena točka (ne lažni "kml")
  });

  test("neštevilčne koordinate v <coordinates> → točka ostane samo z naslovom", () => {
    const raw = `<kml><Document><Placemark><name>Naslov brez geo</name><Point><coordinates>abc,def</coordinates></Point></Placemark></Document></kml>`;
    const { format, pins } = parsePins(raw);
    expect(format).toBe("kml");
    expect(pins).toHaveLength(1);
    expect(pins[0]!.title).toBe("Naslov brez geo");
    expect(pins[0]!.lat).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. PARSER — navadni besedilni seznam
// ---------------------------------------------------------------------------

describe("parsePins — navadni besedilni seznam", () => {
  test("vrstica = točka; oznake seznama (-, •, 1.) se odstranijo; prazne vrstice preskočene", () => {
    const raw = ["Bled", "- Piran", "1. Ljubljana", "• Postojnska jama", "   ", "Bohinj"].join("\n");
    const { format, pins } = parsePins(raw);
    expect(format).toBe("text");
    expect(pins).toHaveLength(5);
    expect(pins.map((p) => p.title)).toEqual([
      "Bled",
      "Piran",
      "Ljubljana",
      "Postojnska jama",
      "Bohinj",
    ]);
    for (const p of pins) {
      expect(p.lat).toBeNull();
      expect(p.lng).toBeNull();
    }
  });

  test("pokvarjen JSON (ne razparsa) → pošten fallback na besedilni seznam", () => {
    const { format, pins } = parsePins("{ pokvarjen json");
    expect(format).toBe("text");
    expect(pins).toHaveLength(1);
    expect(pins[0]!.title).toBe("{ pokvarjen json");
  });

  test("prazen vhod → text oblika, 0 točk (brez izmišljenih)", () => {
    const { format, pins } = parsePins("   \n  ");
    expect(format).toBe("text");
    expect(pins).toHaveLength(0);
  });

  test(`meja MAX_PINS (${MAX_PINS}): besedilni seznam z več vrsticami se poreže`, () => {
    const raw = Array.from(
      { length: MAX_PINS + 2 },
      (_, i) => `Točka ${i + 1}`
    ).join("\n");
    const { pins } = parsePins(raw);
    expect(pins).toHaveLength(MAX_PINS);
  });

  test(`meja MAX_PINS (${MAX_PINS}): GeoJSON features se porežejo na isto mejo`, () => {
    const raw = JSON.stringify({
      features: Array.from(
        { length: MAX_PINS + 3 },
        (_, i) => ({
          properties: { Title: `Točka ${i + 1}` },
          geometry: { coordinates: [14.0944, 46.3683] },
        })
      ),
    });
    const { format, pins } = parsePins(raw);
    expect(format).toBe("geojson");
    expect(pins).toHaveLength(MAX_PINS);
  });
});

// ---------------------------------------------------------------------------
// 4. MATCHER — ujemanje po imenu (PATTERNS iz url-ingest, en vir resnice)
// ---------------------------------------------------------------------------

describe("matchPins — ujemanje po imenu (brez koordinat)", () => {
  test("naslov \"Bled\" → bled viaName, polna oblika zadetka (pinCount/matchedTitles/nearestKm)", () => {
    const result = matchPins([{ title: "Bled", lat: null, lng: null }]);
    expect(result.pinsTotal).toBe(1);
    expect(result.pinsUnmatched).toBe(0);
    expect(result.matches).toEqual([
      {
        id: "bled",
        name: "Bled",
        slug: "bled",
        pinCount: 1,
        matchedTitles: ["Bled"],
        nearestKm: null,
        viaName: true,
      },
    ]);
  });

  test("najdaljši vzorec zmaga: \"Hotel Triglav Bled\" → triglav (7 črk) pred bled (4)", () => {
    // Dokumentiran primer iz glave modula: koordinate odločijo, BREZ njih
    // pa daljši vzorec — "triglav" je daljši od "bled".
    const result = matchPins([{ title: "Hotel Triglav Bled", lat: null, lng: null }]);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.id).toBe("triglav");
    expect(result.matches[0]!.viaName).toBe(true);
  });

  test("več točk na isto destinacijo → pinCount sešteje, matchedTitles strop 3, viaName če KATERA KOLI po imenu", () => {
    const result = matchPins([
      { title: "Bled", lat: null, lng: null },
      { title: "Bled Castle", lat: null, lng: null },
      { title: "Hotel Park", lat: BLED.lat, lng: BLED.lng },
    ]);
    expect(result.matches).toHaveLength(1);
    const m = result.matches[0]!;
    expect(m.id).toBe("bled");
    expect(m.pinCount).toBe(3);
    expect(m.matchedTitles).toEqual(["Bled", "Bled Castle", "Hotel Park"]);
    expect(m.viaName).toBe(true); // 2 od 3 točk po imenu
    expect(m.nearestKm).toBe(0); // koordinatna točka je TOČNO na Bledu
  });

  test("tuj naslov brez vzorca → pinsUnmatched (nič izmišljanja)", () => {
    const result = matchPins([
      { title: "Neznani hostl", lat: null, lng: null },
      { title: "Karlovy Vary", lat: null, lng: null },
    ]);
    expect(result.pinsTotal).toBe(2);
    expect(result.pinsUnmatched).toBe(2);
    expect(result.matches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. MATCHER — ujemanje po koordinatah (≤ 25 km, prednost pred imenom)
// ---------------------------------------------------------------------------

describe("matchPins — ujemanje po koordinatah", () => {
  test("javni meji sta razkriti: PIN_COORD_RADIUS_KM = 25, MAX_PINS = 2000", () => {
    expect(PIN_COORD_RADIUS_KM).toBe(25);
    expect(MAX_PINS).toBe(2000);
  });

  test("točka TOČNO na koordinatah Bleda → bled, nearestKm 0, viaName false", () => {
    const result = matchPins([{ title: "Hotel Park", lat: BLED.lat, lng: BLED.lng }]);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.id).toBe("bled");
    expect(result.matches[0]!.viaName).toBe(false);
    expect(result.matches[0]!.nearestKm).toBe(0);
  });

  test("točka ~0,5 km od Bleda (hotel v mestu) → bled; nearestKm na 1 decimalko", () => {
    // 0,005° lat ≈ 0,56 km od Bleda — še vedno najbližja destinacija
    const result = matchPins([
      { title: "Vila pri jezeru", lat: BLED.lat + 0.005, lng: BLED.lng },
    ]);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.id).toBe("bled");
    expect(result.matches[0]!.viaName).toBe(false);
    expect(result.matches[0]!.nearestKm).toBeGreaterThan(0);
    expect(result.matches[0]!.nearestKm).toBeLessThanOrEqual(1);
  });

  test("koordinate IZVEN 25 km od vseh destinacij → pošten fallback na ime (Bled @ Dunaj)", () => {
    // Dunaj (~48.2N, 16.4E) je oddaljen > 25 km od VSAKE destinacije nabora
    const result = matchPins([
      { title: "Bled — spomin na Alpe", lat: 48.208, lng: 16.373 },
    ]);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.id).toBe("bled");
    expect(result.matches[0]!.viaName).toBe(true); // ime je prevzelo odločitev
    expect(result.matches[0]!.nearestKm).toBeNull();
  });

  test("tuja točka (Pariz) brez prepoznavnega imena → pinsUnmatched 1, matches []", () => {
    const result = matchPins([
      { title: "Eiffel Tower", lat: 48.8584, lng: 2.2945 },
    ]);
    expect(result.pinsTotal).toBe(1);
    expect(result.pinsUnmatched).toBe(1);
    expect(result.matches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. MATCHER — predlogi (suggestion) + oblika rezultata
// ---------------------------------------------------------------------------

describe("matchPins — predlogi in oblika rezultata", () => {
  test("0 točk → pinsTotal 0, pinsUnmatched 0, matches [], days 1 (varovalka), prazni interesi", () => {
    const result = matchPins([]);
    expect(result).toEqual({
      pinsTotal: 0,
      pinsUnmatched: 0,
      matches: [],
      suggestion: { interests: [], days: 1, preferredDestinations: [] },
    });
  });

  test("dnevi = ceil(zadetki / 2), strop 7; preferredDestinations po pinCount", () => {
    // bled 2× (vrh), piran 1×, ljubljana 1× → 3 zadetki → 2 dni
    const result = matchPins([
      { title: "Bled", lat: null, lng: null },
      { title: "Blejski grad", lat: null, lng: null },
      { title: "Piran", lat: null, lng: null },
      { title: "Ljubljana", lat: null, lng: null },
    ]);
    expect(result.matches).toHaveLength(3);
    expect(result.suggestion.days).toBe(2);
    expect(result.suggestion.preferredDestinations[0]).toBe("bled");
    expect(result.suggestion.preferredDestinations).toHaveLength(3);
  });

  test("interesi = union bestFor zadetih skozi BESTFOR_TO_INTEREST (max 4) — en vir preslikave", () => {
    // bled.bestFor = [romantika, družina, fotografija] → [romantika, družina, narava]
    const result = matchPins([{ title: "Bled", lat: null, lng: null }]);
    expect(result.suggestion.interests).toEqual(["romantika", "družina", "narava"]);
    // preslikava res prihaja iz url-ingest (ne lastna kopija)
    expect(BESTFOR_TO_INTEREST["fotografija"]).toBe("narava");
    expect(PATTERNS.bled).toContain("bled");
  });

  test("rangiranje: izenačeni pinCount → imenski zadetki PRED bližino (deterministično)", () => {
    const result = matchPins([
      { title: "Bohinj — izlet", lat: BOHINJ.lat, lng: BOHINJ.lng }, // po koordinatah
      { title: "Bled", lat: null, lng: null }, // po imenu
    ]);
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0]!.id).toBe("bled");
    expect(result.matches[0]!.pinCount).toBe(1);
    expect(result.matches[1]!.id).toBe("bohinj");
  });
});

// ---------------------------------------------------------------------------
// 7. CELOTEN POGON — ingestPins (parse + match, kot ga kliče API ruta)
// ---------------------------------------------------------------------------

describe("ingestPins — celoten pogon (parse + match)", () => {
  test("Takeout JSON z Bledom in Piranom → geojson + 2 koordinatna zadetka", () => {
    const result = ingestPins(TAKEOUT_JSON);
    expect(result.format).toBe("geojson");
    expect(result.pinsTotal).toBe(2);
    expect(result.pinsUnmatched).toBe(0);
    expect(result.matches.map((m) => m.id).sort()).toEqual(["bled", "piran"]);
    for (const m of result.matches) {
      expect(m.viaName).toBe(false); // obe točki po koordinatah (0 km)
      expect(m.nearestKm).toBe(0);
    }
    expect(result.suggestion.days).toBe(1); // 2 zadetka → ceil(2/2) = 1
  });

  test("mešan vhod: geojson točke + tuj pin → iskren pinsUnmatched", () => {
    const raw = JSON.stringify({
      features: [
        { properties: { Title: "Piran old town" }, geometry: { coordinates: [13.5676, 45.5233] } },
        { properties: { Title: "Rimski Kolosej" }, geometry: { coordinates: [12.4922, 41.8902] } },
      ],
    });
    const result = ingestPins(raw);
    expect(result.pinsTotal).toBe(2);
    expect(result.pinsUnmatched).toBe(1); // Rim — izven polmera, brez vzorca
    expect(result.matches.map((m) => m.id)).toEqual(["piran"]);
  });
});
