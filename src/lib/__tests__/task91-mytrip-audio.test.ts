// ============================================================================
// TASK 91 — ZVOČNI POVZETEK DNEVA V MY TRIP (1.81.0)
// ============================================================================
// Pokriva razširitev čiste plasti src/lib/itinerary-audio.ts na strukturo
// MY TRIP (buildMyTrip → TripEntry[]):
//  - narrationStopsFromTripEntries (termin SAMO realen — time.start; ime
//    vedno; OPIS v tej strukturi ne obstaja → ga NE izmišljujemo; prazni
//    naslovi odpadejo — fail-closed),
//  - speechTripDateLabel (vir MY TRIP vsebuje leto, planner ne — za govor
//    se leto izpusti: »25. september 2026« → »25. september«, isti datum),
//  - maxStops 8 → 16 (dan 1 MY TRIP združi prihod + VSE izbrane postavke
//    kategorij — lahko > 8; globino varuje maxChunks, ne števec; planner
//    ostaja ≤ 8 po svoji validaciji).
//
// INTEGRACIJA: buildDayNarrationScript nad preslikanim MY TRIP dnevom
// (»Dan prvi.« intro + realni termini v besedah + imena brez termina).
//
// SOURCE-CONTRACT (readFileSync dejanskih datotek): JourneyTrip izrisuje
// DayAudioButton s surface="mytrip" + narrationStopsFromTripEntries +
// speechTripDateLabel; komponenta sprejema mytrip v surface tipu; route
// komentar slede novo mejo; analitični docs dopolnjen.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  NARRATION_LIMITS,
  buildDayNarrationScript,
  chunkNarration,
  narrationStopsFromTripEntries,
  speechTripDateLabel,
  type TripEntryLike,
} from "@/lib/itinerary-audio";

const ROOT = join(import.meta.dir, "../../..");

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

// ---------------------------------------------------------------------------
// Fixture — struktura TripEntry (MY TRIP), minimizirana na govorno relevantna
// polja (title + SAMO realni termin; timeNote/ikone/cene zvok ne zanimajo).
// ---------------------------------------------------------------------------

function mkEntry(over: Partial<TripEntryLike> & { title: string }): TripEntryLike {
  return { time: null, ...over };
}

// ---------------------------------------------------------------------------
// narrationStopsFromTripEntries
// ---------------------------------------------------------------------------

describe("narrationStopsFromTripEntries (preslikava MY TRIP dneva)", () => {
  test("termin SAMO kadar je realen (time.start) — vpis/trajanje iz vira", () => {
    const stops = narrationStopsFromTripEntries([
      mkEntry({ title: "Prihod: Dunaj", time: { start: "14:30" } }),
      mkEntry({ title: "Hotel Park", time: null }),
    ]);
    expect(stops).toEqual([
      { time: "14:30", name: "Prihod: Dunaj" },
      { time: "", name: "Hotel Park" },
    ]);
  });

  test("OPIS se NE izmišljuje — MY TRIP vnos ga nima (undefined, nikoli string)", () => {
    const stops = narrationStopsFromTripEntries([
      mkEntry({ title: "Restavracija Sokol", time: { start: "19:00" } }),
    ]);
    expect(stops.length).toBe(1);
    expect(Object.prototype.hasOwnProperty.call(stops[0], "description")).toBe(false);
  });

  test("prazni/whitespace naslovi odpadejo (fail-closed)", () => {
    const stops = narrationStopsFromTripEntries([
      mkEntry({ title: "   " }),
      mkEntry({ title: "" }),
      mkEntry({ title: "Bencinska Petrol" }),
    ]);
    expect(stops).toEqual([{ time: "", name: "Bencinska Petrol" }]);
  });

  test("imena in termini se porežejo (trim)", () => {
    const stops = narrationStopsFromTripEntries([
      mkEntry({ title: "  Triglav  ", time: { start: " 09:00 " } }),
    ]);
    expect(stops).toEqual([{ time: "09:00", name: "Triglav" }]);
  });

  test("time.start end polje je neodvisno — govori samo start (kronologija dneva)", () => {
    const stops = narrationStopsFromTripEntries([
      mkEntry({ title: "Transfer Dunaj – Ljubljana", time: { start: "14:30", end: "18:00" } as TripEntryLike["time"] }),
    ]);
    expect(stops[0].time).toBe("14:30");
  });

  test("strukturno tipiziranje — sprejme TripEntry obliko brez odvisnosti od journey tipov", () => {
    // isto obliko kot buildMyTrip izris (key/icon/cene odveč za govor)
    const journeyLike = [
      { key: "a", icon: "✈️", title: "Prihod: Zagreb", time: { start: "10:00" }, price: null },
      { key: "b", icon: "🏨", title: "Hotel Ljubljana", time: undefined, timeNote: { sl: "Ni ure.", en: "No time." } },
    ] as unknown as ReadonlyArray<TripEntryLike>;
    const stops = narrationStopsFromTripEntries(journeyLike);
    expect(stops.map((s) => s.name)).toEqual(["Prihod: Zagreb", "Hotel Ljubljana"]);
    expect(stops[1].time).toBe("");
  });
});

// ---------------------------------------------------------------------------
// speechTripDateLabel — leto ven za govor (planner pariteta)
// ---------------------------------------------------------------------------

describe("speechTripDateLabel (MY TRIP datum brez leta za govor)", () => {
  test("SL: »25. september 2026« → »25. september«", () => {
    expect(speechTripDateLabel("25. september 2026")).toBe("25. september");
  });

  test("EN: »September 25, 2026« → »September 25« (vejica odpade z letom)", () => {
    expect(speechTripDateLabel("September 25, 2026")).toBe("September 25");
  });

  test("brez leta → nespremenjeno (planner oznake že take)", () => {
    expect(speechTripDateLabel("četrtek, 25. septembra")).toBe("četrtek, 25. septembra");
    expect(speechTripDateLabel("25. september")).toBe("25. september");
  });

  test("leto na koncu z oklepaji/ločili ne požre besedila pred njim", () => {
    expect(speechTripDateLabel("3. maj 2027")).toBe("3. maj");
    expect(speechTripDateLabel("December 31, 2025")).toBe("December 31");
  });

  test("NE požre leta sredi niza (samo končno leto) — iskren izvirnik sicer", () => {
    // vir piše leto SAMO na koncu (formatDateLabel) — sredinske štirimestne
    // številke (npr. naslov s hišno številko 2026) ostanejo nedotaknjene
    expect(speechTripDateLabel("25. september 2026 ob 8:00")).toBe("25. september 2026 ob 8:00");
  });

  test("prazen niz → prazen (klicalec ne pošlje, kadar datuma ni)", () => {
    expect(speechTripDateLabel("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// maxStops 8 → 16 (zod vrata slede konstanto — ENA resnica)
// ---------------------------------------------------------------------------

describe("NARRATION_LIMITS.maxStops (TASK 91: 16)", () => {
  test("meja je 16 — dan 1 MY TRIP (prihod + vse izbrane postavke) jo lahko preseče 8", () => {
    expect(NARRATION_LIMITS.maxStops).toBe(16);
  });

  test("globina varuje maxChunks (dolžina skripta), ne števec — 16 imen gre skozi chunker", () => {
    const stops = narrationStopsFromTripEntries(
      Array.from({ length: 16 }, (_, i) =>
        mkEntry({ title: `Znamenitost št. ${i + 1} v Ljubljani`, time: null })
      )
    );
    const script = buildDayNarrationScript(
      { dayNumber: 1, dateLabel: "25. september", stops },
      "sl"
    );
    expect(script).not.toBeNull();
    const chunks = chunkNarration(script!);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThanOrEqual(NARRATION_LIMITS.maxChunks);
    // VSA 16 imen so v skriptu (0 tihih izgub — globina NE reže vsebine)
    for (let i = 1; i <= 16; i++) {
      expect(script).toContain(`Znamenitost št. ${i} `);
    }
  });
});

// ---------------------------------------------------------------------------
// INTEGRACIJA — buildDayNarrationScript nad preslikanim MY TRIP dnevom
// ---------------------------------------------------------------------------

describe("buildDayNarrationScript ∘ narrationStopsFromTripEntries (MY TRIP dan 1)", () => {
  const day1: ReadonlyArray<TripEntryLike> = [
    mkEntry({ title: "Prihod: Dunaj (letališče)", time: { start: "14:30" } }),
    mkEntry({ title: "Transfer Dunaj – Ljubljana", time: { start: "14:30" } }),
    mkEntry({ title: "Hotel Park", time: null }),
    mkEntry({ title: "Restavracija Sokol", time: null }),
  ];

  test("SL: »Dan prvi.« + realni termini v besedah + imena brez termina ostanejo imenovana", () => {
    const script = buildDayNarrationScript(
      {
        dayNumber: 1,
        dateLabel: speechTripDateLabel("25. september 2026"),
        stops: narrationStopsFromTripEntries(day1),
      },
      "sl"
    );
    expect(script).not.toBeNull();
    expect(script!.startsWith("Dan prvi.")).toBe(true);
    // leto je ODSTRANJENO (govorna pariteta s plannerjem) + številka dneva
    // v besedi (rodilni vrstilnik; mesec MY TRIP vira je nominativni —
    // »september« — izgovorljivo, ne popravljamo vsebine vira)
    expect(script).toContain("petindvajsetega september");
    expect(script).not.toContain("2026");
    // realni termin → ure v besedah (izmera: števke glasi kot angleške)
    expect(script).toContain("ob štirinajstih in pol");
    // postanki BREZ termina ostanejo imenovani (ne tiho skriti)
    expect(script).toContain("Hotel Park.");
    expect(script).toContain("Restavracija Sokol.");
  });

  test("EN: »Day 1.« intro + števke terminov ostanejo (jam glasi nativno)", () => {
    const script = buildDayNarrationScript(
      {
        dayNumber: 1,
        dateLabel: speechTripDateLabel("September 25, 2026"),
        stops: narrationStopsFromTripEntries(day1),
      },
      "en"
    );
    expect(script).not.toBeNull();
    expect(script!.startsWith("Day 1.")).toBe(true);
    expect(script).toContain("September 25");
    expect(script).not.toContain("2026");
    expect(script).toContain("at 14:30");
  });

  test("dan brez datuma (dateLabel null) → intro brez datuma, postanke NE izgubi", () => {
    const script = buildDayNarrationScript(
      { dayNumber: 2, dateLabel: null, stops: narrationStopsFromTripEntries(day1) },
      "sl"
    );
    expect(script).not.toBeNull();
    expect(script!.startsWith("Dan drugi.")).toBe(true);
    expect(script).toContain("Prihod: Dunaj (letališče)");
  });

  test("iskrenost: dan z SAMO praznimi naslovi → null (gumb se ne izriše)", () => {
    const script = buildDayNarrationScript(
      {
        dayNumber: 1,
        dateLabel: null,
        stops: narrationStopsFromTripEntries([mkEntry({ title: " " })]),
      },
      "sl"
    );
    expect(script).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SOURCE-CONTRACT — JourneyTrip izrisuje gumb; tipi/komentarji/docs v scopu
// ---------------------------------------------------------------------------

describe("SOURCE-CONTRACT: JourneyTrip (MY TRIP) izrisuje DayAudioButton", () => {
  const comp = source("src/components/journey-trip.tsx");
  const button = source("src/components/itinerary-audio.tsx");

  test("JourneyTrip importa DayAudioButton + MY TRIP preslikavi iz čiste plasti", () => {
    expect(comp).toContain('from "@/components/itinerary-audio"');
    expect(comp).toContain("DayAudioButton");
    expect(comp).toContain("narrationStopsFromTripEntries(day.entries)");
    expect(comp).toContain("speechTripDateLabel(day.dateLabel[lang])");
  });

  test("gumb s surface=mytrip + lang po lokalnem jeziku (MY TRIP je sl + en)", () => {
    expect(comp).toContain('surface="mytrip"');
    expect(comp).toContain("lang={lang}");
  });

  test("datum za govor se pošlje SAMO kadar dan ima realen datum (sicer null)", () => {
    // večvrstični ternary: day.date → speechTripDateLabel(...), sicer null
    // (meta-opombe »Datum prihoda ni vnesen" govor NE bere)
    expect(comp).toContain("const audioDateLabel = day.date");
    expect(comp).toContain("? speechTripDateLabel(day.dateLabel[lang])");
    expect(comp).toContain(": null;");
  });

  test("komponenta sprejema mytrip v surface tipu (analitika loči površino)", () => {
    expect(button).toContain('"planner" | "shared" | "mytrip"');
  });
});

describe("SOURCE-CONTRACT: meja/analitika/docs usklajeni (ENA resnica)", () => {
  test("lib meja je 16 in zod vrata uporabljajo KONSTANTO (ne literal)", () => {
    const lib = source("src/lib/itinerary-audio.ts");
    const route = source("src/app/api/tts/route.ts");
    expect(lib).toContain("maxStops: 16");
    expect(route).toContain("NARRATION_LIMITS.maxStops");
    expect(route).not.toContain(".max(8)");
  });

  test("planner-analytics komentar omejuje surface na planner|shared|mytrip", () => {
    const analytics = source("src/lib/planner-analytics.ts");
    expect(analytics).toContain("planner|shared|mytrip");
  });

  test("docs/ANALYTICS-EVENTS.md dokumentira surface=mytrip (1.81)", () => {
    const docs = source("docs/ANALYTICS-EVENTS.md");
    expect(docs).toContain("`surface` (`planner`/`shared`/`mytrip`)");
    expect(docs).toContain("`surface=mytrip` (1.81)");
  });
});
