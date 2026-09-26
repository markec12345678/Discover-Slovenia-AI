// ============================================================================
// TASK 89 — ZVOČNI POVZETEK DNEVA (1.80.0)
// ============================================================================
// Pokriva ČISTI sloj src/lib/itinerary-audio.ts:
//  - narrationStopsFromDay (preslikava LocationVisit[] — prazna imena odpadejo,
//    notes → description samo kadar obstaja),
//  - buildDayNarrationScript (ISKRENOST: 0 postankov → null; struktura
//    »Dan N. datum. od..do, Ime. opis.« SAMO iz dejstev; SL vrstilni
//    števniki + rodilni datumi — števke bi TTS glasil kot angleške besede,
//    izmerjeno 2026-09-24 z ASR povratno zanko; EN pusti števke — jam jih
//    izgovarja nativno),
//  - speechTime / speechDateLabel (oblike prijazne govoru; besedni termini
//    in nenavadne ure gredo nespremenjene — iskren izvirnik),
//  - chunkNarration (razrez ≤ meja PO STAVKIH; ovesno dolgi stavki po
//    besedni meji; vsebina NIKOLI ne izgine; prazno → []),
//  - NARRATION_LIMITS (meje kosov — brskalniška sinteza tiho poreže dolge
//    posamezne izgovore, zato komponenta izgovarja PO KOSIH).
//    (Nekdanja strežniška TTS orodja — concatWavBuffers/narrationCacheKey —
//    so ODSTRANJENA skupaj s strežniško potjo, ISSUE #9 Z9-D.)
//
// SOURCE-CONTRACT (readFileSync/existsSync dejanskih datotek) — ISSUE #9
// (ZERO-AI/GROUP C): strežniški TTS je ODSTRANJEN (tts-engine + /api/tts +
// /api/itinerary/tts NE obstajajo več); DayAudioButton gradi skript NA
// KLIENTU (ista čista lib funkcija) in ga izgovori BRKALNIŠKI glas
// (window.speechSynthesis, isti vzorec kot glasovni klepet — lib/voice);
// brskalnik brez govorne sinteze → dostopen tekstovni padec (»Prikaži
// besedilo«). TripTimeline + SharedTrip izrisujeta DayAudioButton (planner
// / shared površina); komponenta ima fail-closed + print:hidden + iskreno
// napako + analitiko; whitelist (klient + strežnik) + docs —
// docs/ANALYTICS-EVENTS.md dokumentira dogodek.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  NARRATION_LIMITS,
  buildDayNarrationScript,
  chunkNarration,
  narrationStopsFromDay,
  speechDateLabel,
  speechTime,
  type NarrationDayInput,
  type NarrationStopInput,
} from "@/lib/itinerary-audio";
import type { DayPlan, LocationVisit } from "@/lib/types";

const ROOT = join(import.meta.dir, "../../..");

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function mkVisit(
  id: string,
  over: Partial<LocationVisit> = {}
): LocationVisit {
  return {
    destination_id: id,
    destination_name: id.toUpperCase(),
    time_slot: "09:00",
    duration: 2,
    estimated_cost: 10,
    notes: "",
    ...over,
  };
}

function mkDay(n: number, visits: LocationVisit[]): DayPlan {
  return {
    day: n,
    locations: visits,
    weather: { condition: "Sončno", temp: 21 },
  };
}

function mkStop(
  name: string,
  over: Partial<NarrationStopInput> = {}
): NarrationStopInput {
  return { time: "09:00", name, ...over };
}

function mkNarrDay(
  n: number,
  stops: NarrationStopInput[],
  dateLabel?: string | null
): NarrationDayInput {
  return { dayNumber: n, stops, dateLabel: dateLabel ?? null };
}

// ---------------------------------------------------------------------------
// narrationStopsFromDay — preslikava LocationVisit[]
// ---------------------------------------------------------------------------

describe("TASK 89: narrationStopsFromDay", () => {
  test("preslika termin/ime/notes in obreže presledke", () => {
    const stops = narrationStopsFromDay([
      mkVisit("bled", {
        destination_name: "  Blejsko jezero  ",
        time_slot: " 09:00 ",
        notes: "  Pohod okoli jezera.  ",
      }),
    ]);
    expect(stops).toEqual([
      { time: "09:00", name: "Blejsko jezero", description: "Pohod okoli jezera." },
    ]);
  });

  test("prazno ime odpade; prazne notes → brez description", () => {
    const stops = narrationStopsFromDay([
      mkVisit("a", { destination_name: "" }),
      mkVisit("b", { destination_name: "   " }),
      mkVisit("c", { notes: "" }),
    ]);
    expect(stops).toEqual([{ time: "09:00", name: "C", description: undefined }]);
  });
});

// ---------------------------------------------------------------------------
// speechTime — zvoku prijazni termini
// ---------------------------------------------------------------------------

describe("TASK 89: speechTime", () => {
  test("SL obseg polne ure → od .. do ..", () => {
    expect(speechTime("09:00-13:00", "sl")).toBe("od devetih do trinajstih");
  });

  test("SL obseg s končnimi minutami", () => {
    expect(speechTime("09:00-11:30", "sl")).toBe("od devetih do enajstih in pol");
    expect(speechTime("09:00-11:45", "sl")).toBe("od devetih do enajstih in 45 minut");
  });

  test("SL ena polna ura → ob ..", () => {
    expect(speechTime("09:00", "sl")).toBe("ob devetih");
    expect(speechTime("9:00", "sl")).toBe("ob devetih");
  });

  test("SL polna ura in pol / minute", () => {
    expect(speechTime("14:30", "sl")).toBe("ob štirinajstih in pol");
    expect(speechTime("09:15", "sl")).toBe("ob devetih in 15 minut");
  });

  test("SL nepravilne ure 1–4 (enih/dveh/treh/štirih)", () => {
    expect(speechTime("01:00", "sl")).toBe("ob enih");
    expect(speechTime("02:00", "sl")).toBe("ob dveh");
    expect(speechTime("03:00", "sl")).toBe("ob treh");
    expect(speechTime("04:00", "sl")).toBe("ob štirih");
  });

  test("SL besedni termin gre nespremenjeno (že je govor)", () => {
    expect(speechTime("zjutraj", "sl")).toBe("zjutraj");
    expect(speechTime("popoldne", "sl")).toBe("popoldne");
  });

  test("SL nenavadna ura (>23) ostane iskren izvirnik", () => {
    expect(speechTime("25:00", "sl")).toBe("25:00");
  });

  test("unicode pomišljaj (–) v obsegu deluje", () => {
    expect(speechTime("09:00–13:00", "sl")).toBe("od devetih do trinajstih");
  });

  test("EN obseg → from .. to ..", () => {
    expect(speechTime("09:00-13:00", "en")).toBe("from 9 to 13");
    expect(speechTime("09:30-13:45", "en")).toBe("from 9:30 to 13:45");
  });

  test("EN ena ura → at .. o'clock / at ..:MM", () => {
    expect(speechTime("09:00", "en")).toBe("at 9 o'clock");
    expect(speechTime("14:30", "en")).toBe("at 14:30");
  });

  test("prazzen termin → prazzen niz", () => {
    expect(speechTime("", "sl")).toBe("");
    expect(speechTime("   ", "en")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// speechDateLabel — datumi v izgovorljivi obliki
// ---------------------------------------------------------------------------

describe("TASK 89: speechDateLabel", () => {
  test("SL dan v mesecu → rodilni vrstilni števnik", () => {
    expect(speechDateLabel("petek, 25. septembra", "sl")).toBe(
      "petek, petindvajsetega septembra"
    );
    expect(speechDateLabel("četrtek, 24. septembra", "sl")).toBe(
      "četrtek, štiriindvajsetega septembra"
    );
    expect(speechDateLabel("nedelja, 1. novembra", "sl")).toBe(
      "nedelja, prvega novembra"
    );
    expect(speechDateLabel("torek, 31. oktobra", "sl")).toBe(
      "torek, enaintridesetega oktobra"
    );
  });

  test("SL dan > 31 (neveljaven) ostane izvirnik", () => {
    expect(speechDateLabel("petek, 45. septembra", "sl")).toBe(
      "petek, 45. septembra"
    );
  });

  test("EN pusti, kot je (jam glasi števke nativno)", () => {
    expect(speechDateLabel("Thursday, 24 September", "en")).toBe(
      "Thursday, 24 September"
    );
  });

  test("SL brez datuma v nizu → nespremenjeno", () => {
    expect(speechDateLabel("Dan brez datuma", "sl")).toBe("Dan brez datuma");
  });
});

// ---------------------------------------------------------------------------
// buildDayNarrationScript — ISKRENOST pripovedi
// ---------------------------------------------------------------------------

describe("TASK 89: buildDayNarrationScript", () => {
  test("fail-closed: 0 postankov → null", () => {
    expect(buildDayNarrationScript(mkNarrDay(1, []), "sl")).toBeNull();
    expect(
      buildDayNarrationScript(mkNarrDay(1, [mkStop("   ")]), "sl")
    ).toBeNull();
  });

  test("SL: vrstilni števnik + rodilni datum + govoru prijazni termini + opisi", () => {
    const script = buildDayNarrationScript(
      mkNarrDay(
        2,
        [
          mkStop("Blejsko jezero", {
            time: "09:00-13:00",
            description: "Pohod okoli jezera, približno dve uri in pol.",
          }),
          mkStop("Soteska Vintgar", { time: "14:30" }),
          mkStop("Blejski otok", { time: "" }),
        ],
        "petek, 25. septembra"
      ),
      "sl"
    );
    expect(script).not.toBeNull();
    expect(script).toContain("Dan drugi.");
    expect(script).toContain("petek, petindvajsetega septembra.");
    expect(script).toContain("od devetih do trinajstih, Blejsko jezero.");
    expect(script).toContain("Pohod okoli jezera, približno dve uri in pol.");
    expect(script).toContain("ob štirinajstih in pol, Soteska Vintgar.");
    // postanek brez termina ostane IMENOVAN (ne skrit)
    expect(script).toContain("Blejski otok.");
  });

  test("SL: dan > 31 → števka (iskren izvirnik, ne izmišljena beseda)", () => {
    const script = buildDayNarrationScript(mkNarrDay(32, [mkStop("Bled")]), "sl");
    expect(script).toContain("Dan 32.");
  });

  test("SL: brez datuma → samo intro (0 izmišljenih datumov)", () => {
    const script = buildDayNarrationScript(mkNarrDay(1, [mkStop("Bled")]), "sl");
    expect(script).toBe("Dan prvi. ob devetih, Bled.");
  });

  test("EN: Day N + digits + from/at oblike", () => {
    const script = buildDayNarrationScript(
      mkNarrDay(
        2,
        [
          mkStop("Lake Bled", { time: "09:00-13:00", description: "A walk." }),
          mkStop("Vintgar Gorge", { time: "14:30" }),
        ],
        "Friday, 25 September"
      ),
      "en"
    );
    expect(script).toContain("Day 2.");
    expect(script).toContain("Friday, 25 September.");
    expect(script).toContain("from 9 to 13, Lake Bled.");
    expect(script).toContain("A walk.");
    expect(script).toContain("at 14:30, Vintgar Gorge.");
  });

  test("opis se normalizira (zaporedni presledki) in kapira na mejo", () => {
    const long = "A".repeat(NARRATION_LIMITS.maxDescriptionChars + 50);
    const script = buildDayNarrationScript(
      mkNarrDay(1, [
        mkStop("X", { description: `  ${long}  in   več.  ` }),
      ]),
      "sl"
    );
    expect(script).toContain("A".repeat(NARRATION_LIMITS.maxDescriptionChars));
    expect(script).not.toContain(`${long} in več.`);
    expect(script).not.toMatch(/\s{2,}/);
  });

  test("ime se kapira na maxNameChars (varovalka zod vrat)", () => {
    const name = "N".repeat(NARRATION_LIMITS.maxNameChars + 30);
    const script = buildDayNarrationScript(mkNarrDay(1, [mkStop(name)]), "sl");
    expect(script).toContain("N".repeat(NARRATION_LIMITS.maxNameChars));
    expect(script!.length).toBeLessThan(
      name.length + 20 // ime je bilo obrezano
    );
  });

  test("večkratni presledki v vnosu se stisnejo", () => {
    const script = buildDayNarrationScript(
      mkNarrDay(1, [mkStop("Bled   jezero", { time: " 09:00 " })]),
      "sl"
    );
    expect(script).toBe("Dan prvi. ob devetih, Bled jezero.");
  });
});

// ---------------------------------------------------------------------------
// chunkNarration — razrez na kose ≤ 1024 (omejitev TTS API)
// ---------------------------------------------------------------------------

describe("TASK 89: chunkNarration", () => {
  test("kratko besedilo → en kos, nespremenjeno", () => {
    expect(chunkNarration("Ena poved.")).toEqual(["Ena poved."]);
    expect(chunkNarration("Dve. Povedi.")).toEqual(["Dve. Povedi."]);
  });

  test("prazno/belo → [] (klicalec ne pokliče TTS)", () => {
    expect(chunkNarration("")).toEqual([]);
    expect(chunkNarration("   \n\t  ")).toEqual([]);
  });

  test("dolgo besedilo: vsi kosi ≤ meja, vsebina ohranjena", () => {
    const sentences = Array.from(
      { length: 60 },
      (_, i) => `Stavek številka ${i} o dnevu potovanja.`
    );
    const text = sentences.join(" ");
    const chunks = chunkNarration(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(NARRATION_LIMITS.chunkTargetChars);
    }
    // vsebava (po stisku presledkov) je identična celemu besedilu
    expect(chunks.join(" ").replace(/\s+/g, " ").trim()).toBe(
      text.replace(/\s+/g, " ").trim()
    );
  });

  test("ovesno dolg stavek brez ločil → besedna meja, brez izgube", () => {
    const words = Array.from({ length: 300 }, (_, i) => `beseda${i}`);
    const text = words.join(" ");
    const chunks = chunkNarration(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(100);
    }
    expect(chunks.join(" ").split(/\s+/).filter(Boolean).length).toBe(300);
  });

  test("meja 0/5 → varovalka (ne neskončna zanka)", () => {
    expect(chunkNarration("karkoli", 0)).toEqual([]);
  });

  test("privzeta meja = chunkTargetChars (960, pod API 1024)", () => {
    expect(NARRATION_LIMITS.chunkTargetChars).toBeLessThan(
      NARRATION_LIMITS.maxChunkChars
    );
    expect(NARRATION_LIMITS.chunkTargetChars).toBe(960);
  });
});

// ---------------------------------------------------------------------------
// SOURCE-CONTRACT — ISSUE #9 (ZERO-AI): strežniški TTS ODSTRANJEN
// ---------------------------------------------------------------------------

describe("ISSUE #9: strežniški TTS ne obstaja več (0 strežniških AI klicev)", () => {
  test("tts-engine + obe TTS ruti sta IZBRISANI (existsSync → false)", () => {
    expect(existsSync(join(ROOT, "src/lib/tts-engine.ts"))).toBe(false);
    expect(existsSync(join(ROOT, "src/app/api/tts/route.ts"))).toBe(false);
    expect(
      existsSync(join(ROOT, "src/app/api/itinerary/tts/route.ts"))
    ).toBe(false);
  });

  test("noben vir v src/ več ne kliče strežniškega TTS (rute/engine)", () => {
    // rekurzivna hoja po src/ (brez testov) — ostankov pogodbe z odstranjeno
    // plastjo (fetch "/api/tts" | "/api/itinerary/tts" | uvoz tts-engine)
    // ne sme biti nikjer več.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) {
          if (entry === "node_modules" || entry === "__tests__") continue;
          walk(p);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry)) continue;
        const text = readFileSync(p, "utf8");
        if (
          text.includes('"/api/tts"') ||
          text.includes('"/api/itinerary/tts"') ||
          text.includes("@/lib/tts-engine")
        ) {
          offenders.push(p);
        }
      }
    };
    walk(join(ROOT, "src"));
    expect(offenders).toEqual([]);
  });

  test("čista lib ostaja nedotaknjena (jedro izvoženih funkcij + ZERO-AI)", () => {
    const lib = source("src/lib/itinerary-audio.ts");
    expect(lib).toContain("export function buildDayNarrationScript");
    expect(lib).toContain("export function chunkNarration");
    expect(lib).toContain("export function speechTime");
    expect(lib).toContain("export function speechDateLabel");
    // ISSUE #9 Z9-D: strežniško-TTS orodja (WAV spajanje, ključ predpomnilnika)
    // so ODSTRANJENA — nimajo več produkcijskega klicalca.
    expect(lib).not.toContain("export function concatWavBuffers");
    expect(lib).not.toContain("export function narrationCacheKey");
    expect(lib).not.toContain("parseWav");
  });
});

// ---------------------------------------------------------------------------
// SOURCE-CONTRACT — komponenta DayAudioButton (brskalniški SpeechSynthesis)
// ---------------------------------------------------------------------------

describe("ISSUE #9: DayAudioButton — brskalniški SpeechSynthesis", () => {
  const comp = source("src/components/itinerary-audio.tsx");

  test("skript gradi KLIENT (ista čista lib funkcija) + govori speechSynthesis", () => {
    expect(comp).toContain("buildDayNarrationScript");
    expect(comp).toContain("speechSynthesis");
    expect(comp).toContain("SpeechSynthesisUtterance");
    expect(comp).toContain("speechLanguageTag"); // sl → sl-SI / en → en-US
    expect(comp).toContain("ttsSupported");
    expect(comp).toContain("utterance.rate = 1");
  });

  test("DOLGA pripoved govori PO KOSIH (chunkNarration) — brez tihih rezov", () => {
    // Brskalniška sinteza na nekaterih platformah tiho poreže posamezne
    // dolge izgovore — komponenta razreže skript PO STAVKIH (ista čista
    // funkcija kot nekdajna strežniška pot) in izgovarja zaporedno;
    // seja (sessionRef) poskrbi, da Ustavi res ustavi vse kose.
    expect(comp).toContain("chunkNarration");
    expect(comp).toContain("speakNext");
    expect(comp).toContain("sessionRef");
    expect(comp).not.toContain("new SpeechSynthesisUtterance(text)");
  });

  test("NI strežniškega TTS klica, NI blob predpomnilnika, NI z-ai", () => {
    expect(comp).not.toContain('"/api/tts"');
    expect(comp).not.toContain('"/api/itinerary/tts"');
    expect(comp).not.toContain("URL.createObjectURL");
    expect(comp).not.toContain("z-ai");
    expect(comp).not.toContain("cachedUrlFor");
    expect(comp).not.toContain("rememberBlob");
  });

  test("fail-closed: dan brez uporabnih postankov → brez gumba", () => {
    expect(comp).toContain("if (!available) return null");
    expect(comp).toContain("script !== null");
  });

  test("tekstovni padec: brskalnik brez govorne sinteze → Prikaži besedilo", () => {
    expect(comp).toContain("Prikaži besedilo");
    expect(comp).toContain("Show text");
    expect(comp).toContain("Računalniški glas ni na voljo");
    expect(comp).toContain("Computer voice unavailable");
    expect(comp).toContain("speechOut === false");
  });

  test("iskrena napaka (role=alert) + ustavljanje (cancel) + print:hidden", () => {
    expect(comp).toContain('role="alert"');
    expect(comp).toContain("speechSynthesis.cancel()");
    expect(comp).toContain("print:hidden");
    expect(comp).toContain("aria-label");
    expect(comp).toContain("L.buttonAria(dayNumber)");
  });

  test("analitika: itinerary_audio_play s površino (engine = browser)", () => {
    expect(comp).toContain('trackPlannerEvent("itinerary_audio_play"');
    expect(comp).toContain("surface");
    expect(comp).toContain("browser-speech-synthesis");
  });
});

// ---------------------------------------------------------------------------
// SOURCE-CONTRACT — integracija obeh površin + whitelist + docs
// ---------------------------------------------------------------------------

describe("TASK 89: integracija površin + analitika", () => {
  const timeline = source("src/components/trip-timeline.tsx");
  const shared = source("src/components/shared-trip.tsx");
  const analyticsLib = source("src/lib/planner-analytics.ts");
  const analyticsRoute = source("src/app/api/analytics/event/route.ts");
  const analyticsDocs = source("docs/ANALYTICS-EVENTS.md");

  test("TripTimeline (planner) izriše gumb z lang + surface=planner", () => {
    expect(timeline).toContain("DayAudioButton");
    expect(timeline).toContain('surface="planner"');
    expect(timeline).toContain("narrationStopsFromDay(day.locations)");
    expect(timeline).toContain("formatDayLabel(dayISO, lang)");
  });

  test("SharedTrip (deljeni načrt) izriše gumb (sl, surface=shared)", () => {
    expect(shared).toContain("DayAudioButton");
    expect(shared).toContain('surface="shared"');
    expect(shared).toContain('lang="sl"');
    expect(shared).toContain("narrationStopsFromDay(day.locations)");
    expect(shared).toContain("formatDayLabelSI(dayISO)");
  });

  test("analitični dogodek je v klientni whitelisti (union)", () => {
    expect(analyticsLib).toContain('"itinerary_audio_play"');
  });

  test("analitični dogodek je v strežniški VALID_EVENTS", () => {
    expect(analyticsRoute).toContain('"itinerary_audio_play"');
  });

  test("dogodek je dokumentiran v docs/ANALYTICS-EVENTS.md", () => {
    // TASK 91 (1.81) je vrstico razširil: (1.80; 1.81 `surface=mytrip`) —
    // dogodek še vedno dokumentiran, surface pa zdaj vključuje MY TRIP
    expect(analyticsDocs).toMatch(/`itinerary_audio_play` \(1\.80(; 1\.81 `surface=mytrip`)?\)/);
    expect(analyticsDocs).toContain("TASK 89");
  });
});

// ---------------------------------------------------------------------------
// SOURCE-CONTRACT — čistost lib plasti (0 omrežja, 0 db, 0 React)
// ---------------------------------------------------------------------------

describe("TASK 89: čistost lib plasti", () => {
  const lib = source("src/lib/itinerary-audio.ts");

  test("lib NE odpira omrežja/db/React (kanon čistih slojev)", () => {
    expect(lib).not.toMatch(/\bfetch\s*\(/);
    expect(lib).not.toMatch(/from\s+["']react["']/);
    expect(lib).not.toMatch(/@\/lib\/db/);
    expect(lib).not.toMatch(/\bPrismaClient\b/);
  });

  test("lib uva ZDAJ le tipe (0 stranskih učinkov ob importu)", () => {
    expect(lib).toMatch(/^import type \{ DayPlan \} from "@\/lib\/types";$/m);
    expect(lib).not.toMatch(/^import (?!type)[^t]/m);
  });
});
