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
//  - concatWavBuffers (RIFF hoja po kosih — vir piše fmt+AIGC+LIST+data,
//    NE kanonična 44-bajtna glava; pad byte pri lihih velikostih; formatna
//    neusklajenost/smeti/trunciranje → null; en kos → validacija + passthrough),
//  - narrationCacheKey (determinizem; loči dan/jezik/termin/datum/opis).
//
// SOURCE-CONTRACT (readFileSync dejanskih datotek): /api/tts gradi skript
// SAM iz strukturiranih podatkov (NE prostega besedila — varuje pred
// zlorabo), zod vrata zrcalijo NARRATION_LIMITS, glasi tongtong/jam po
// jeziku; TripTimeline + SharedTrip izrisujeta DayAudioButton (planner /
// shared površina); komponenta ima fail-closed + print:hidden + iskreno
// napako + analitiko; whitelist (klient + strežnik) + docs ANGLEŠKO NE —
// docs/ANALYTICS-EVENTS.md dokumentira dogodek.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  NARRATION_LIMITS,
  buildDayNarrationScript,
  chunkNarration,
  concatWavBuffers,
  narrationCacheKey,
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

// ── WAV fixture: ISTA ne-standardna postavitev kosov kot pravi TTS vir ────
// (izmerjeno 2026-09-24: fmt(16) + AIGC(250|liho) + LIST(26) + data).
// velikost PCM v bajtih; sampleRate/bit/kanali parameterizirani za negative.

interface SrcWavOpts {
  aigcSize?: number;
  sampleRate?: number;
  bits?: number;
  channels?: number;
}

function makeSrcWav(pcmLen: number, opts: SrcWavOpts = {}): Buffer {
  const {
    aigcSize = 250,
    sampleRate = 24000,
    bits = 16,
    channels = 1,
  } = opts;
  const pad = aigcSize % 2;
  const listOff = 36 + 8 + aigcSize + pad;
  const dataOff = listOff + 8 + 26;
  const headerLen = dataOff + 8;
  const total = headerLen + pcmLen;
  const b = Buffer.alloc(total);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(total - 8, 4);
  b.write("WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE((sampleRate * channels * bits) / 8, 28);
  b.writeUInt16LE((channels * bits) / 8, 32);
  b.writeUInt16LE(bits, 34);
  b.write("AIGC", 36, "ascii");
  b.writeUInt32LE(aigcSize, 40);
  b.write("LIST", listOff, "ascii");
  b.writeUInt32LE(26, listOff + 4);
  b.write("data", dataOff, "ascii");
  b.writeUInt32LE(pcmLen, dataOff + 4);
  for (let i = 0; i < pcmLen; i++) {
    b[headerLen + i] = (i % 251) + 1; // nikoli 0 → ločljivo od alloc(0)
  }
  return b;
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
// concatWavBuffers — spajanje WAV (ne-standardna glava vira!)
// ---------------------------------------------------------------------------

describe("TASK 89: concatWavBuffers", () => {
  test("en veljaven kos → passthrough (ista referenca)", () => {
    const a = makeSrcWav(1000);
    expect(concatWavBuffers([a])).toBe(a);
  });

  test("en kos z liho AIGC goro (pad byte) → pravilen parse", () => {
    const odd = makeSrcWav(100, { aigcSize: 251 });
    expect(concatWavBuffers([odd])).toBe(odd);
  });

  test("dva kosa → kanonična glava + PCM v vrstnem redu", () => {
    const a = makeSrcWav(1000);
    const b = makeSrcWav(2000);
    const merged = concatWavBuffers([a, b]);
    expect(merged).not.toBeNull();
    expect(merged!.length).toBe(44 + 3000);
    expect(merged!.toString("ascii", 0, 4)).toBe("RIFF");
    expect(merged!.readUInt32LE(4)).toBe(36 + 3000);
    expect(merged!.toString("ascii", 8, 12)).toBe("WAVE");
    expect(merged!.toString("ascii", 36, 40)).toBe("data");
    expect(merged!.readUInt32LE(40)).toBe(3000);
    // fmt: 24 kHz mono 16-bit PCM
    expect(merged!.readUInt16LE(20)).toBe(1);
    expect(merged!.readUInt16LE(22)).toBe(1);
    expect(merged!.readUInt32LE(24)).toBe(24000);
    expect(merged!.readUInt32LE(28)).toBe(48000);
    expect(merged!.readUInt16LE(34)).toBe(16);
    // PCM vrstni red: prvi bajt a, nato b na 44+1000
    expect(merged![44]).toBe(a[336]);
    expect(merged![44 + 1000]).toBe(b[336]);
    expect(merged![44 + 2999]).toBe(b[335 + 2000]);
  });

  test("trije kosi (liha + soda AIGC mešano)", () => {
    const a = makeSrcWav(1000);
    const odd = makeSrcWav(100, { aigcSize: 251 });
    const merged = concatWavBuffers([a, odd, a]);
    expect(merged!.length).toBe(44 + 2100);
  });

  test("različen sampleRate → null (NE mešaj formatov)", () => {
    const a = makeSrcWav(1000);
    const bad = makeSrcWav(500, { sampleRate: 44100 });
    expect(concatWavBuffers([a, bad])).toBeNull();
  });

  test("različen bits → null", () => {
    const a = makeSrcWav(1000);
    const bad = makeSrcWav(500, { bits: 8 });
    expect(concatWavBuffers([a, bad])).toBeNull();
  });

  test("smeti (ne-WAV) → null tudi kot en sam kos", () => {
    expect(concatWavBuffers([Buffer.from("hello world")])).toBeNull();
  });

  test("trunciran WAV (data obeta več, kot je v datoteki) → null", () => {
    const a = makeSrcWav(1000);
    const truncated = a.subarray(0, a.length - 100);
    expect(concatWavBuffers([truncated])).toBeNull();
  });

  test("prazzen seznam → null", () => {
    expect(concatWavBuffers([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// narrationCacheKey — determinizem
// ---------------------------------------------------------------------------

describe("TASK 89: narrationCacheKey", () => {
  test("isti vhod → isti ključ (determinizem)", () => {
    const day = mkNarrDay(
      2,
      [mkStop("Bled", { time: "09:00", description: "Opis." })],
      "petek, 25. septembra"
    );
    expect(narrationCacheKey(day, "sl")).toBe(narrationCacheKey(day, "sl"));
  });

  test("različen dan/jezik/datum/termin → različen ključ", () => {
    const base = mkNarrDay(2, [mkStop("Bled", { time: "09:00" })], "x");
    expect(narrationCacheKey(mkNarrDay(3, [mkStop("Bled", { time: "09:00" })], "x"), "sl")).not.toBe(
      narrationCacheKey(base, "sl")
    );
    expect(narrationCacheKey(base, "en")).not.toBe(narrationCacheKey(base, "sl"));
    expect(
      narrationCacheKey(mkNarrDay(2, [mkStop("Bled", { time: "10:00" })], "x"), "sl")
    ).not.toBe(narrationCacheKey(base, "sl"));
    expect(narrationCacheKey(mkNarrDay(2, [mkStop("Bled", { time: "09:00" })], "y"), "sl")).not.toBe(
      narrationCacheKey(base, "sl")
    );
  });

  test("opis z zaporednimi presledki ne spremeni ključa (normalizacija)", () => {
    const a = mkNarrDay(1, [mkStop("Bled", { description: "en   opis" })]);
    const b = mkNarrDay(1, [mkStop("Bled", { description: "en opis" })]);
    expect(narrationCacheKey(a, "sl")).toBe(narrationCacheKey(b, "sl"));
  });

  test("prazna imena postankov se odstranijo iz ključa", () => {
    const a = mkNarrDay(1, [mkStop("Bled"), mkStop("")]);
    const b = mkNarrDay(1, [mkStop("Bled")]);
    expect(narrationCacheKey(a, "sl")).toBe(narrationCacheKey(b, "sl"));
  });
});

// ---------------------------------------------------------------------------
// SOURCE-CONTRACT — /api/tts (strežnik gradi skript SAM; zod vrata)
// ---------------------------------------------------------------------------

describe("TASK 89: /api/tts source-contract", () => {
  const route = source("src/app/api/tts/route.ts");

  test("skript gradi STREŽNIK iz strukturiranih podatkov (ista lib funkcija)", () => {
    expect(route).toContain("buildDayNarrationScript");
    expect(route).toContain("narrationCacheKey");
    expect(route).toContain("chunkNarration");
    expect(route).toContain("concatWavBuffers");
  });

  test("VHOD NI prostho besedilo — zod sprejme SAMO strukturo dneva", () => {
    // ne sme obstajati prosti 'text'/'input'/'script' vhod iz telesa zahteve
    expect(route).not.toMatch(/z\.string\(\)[^;]*\b(script|narration|prompt)\b/i);
    expect(route).toContain("stops: z.array(stopSchema)");
    expect(route).toContain("dayNumber: z.number().int().min(1).max(30)");
  });

  test("zod vrata zrcalijo NARRATION_LIMITS (ENA resnica)", () => {
    expect(route).toContain("NARRATION_LIMITS.maxStops");
    expect(route).toContain("NARRATION_LIMITS.maxNameChars");
    expect(route).toContain("NARRATION_LIMITS.maxDescriptionChars");
    expect(route).toContain("NARRATION_LIMITS.maxTimeChars");
    expect(route).toContain("NARRATION_LIMITS.maxDateLabelChars");
  });

  test("glasi po jeziku: sl → tongtong, en → jam (empirična izbira)", () => {
    expect(route).toContain('sl: "tongtong"');
    expect(route).toContain('en: "jam"');
  });

  test("SDK SAMO strežniško + časovni proračun na klic", () => {
    expect(route).toContain('import("z-ai-web-dev-sdk")');
    expect(route).toContain("TTS_CALL_TIMEOUT_MS");
    expect(route).toContain("withTimeout");
  });

  test("iskrene napake: 503 tts_unavailable, 400 invalid_day/no_stops, 405 GET", () => {
    expect(route).toContain('{ error: "tts_unavailable" }');
    expect(route).toContain('{ error: "invalid_day" }');
    expect(route).toContain('{ error: "no_stops" }');
    expect(route).toContain("method_not_allowed");
  });

  test("LRU predpomnilnik po bajtih (32 MB varovalka)", () => {
    expect(route).toContain("CACHE_MAX_BYTES");
    expect(route).toContain("cacheGet");
    expect(route).toContain("cachePut");
  });

  test("varovalka maxChunks (413 script_too_long)", () => {
    expect(route).toContain("NARRATION_LIMITS.maxChunks");
    expect(route).toContain('{ error: "script_too_long" }');
  });
});

// ---------------------------------------------------------------------------
// SOURCE-CONTRACT — komponenta DayAudioButton
// ---------------------------------------------------------------------------

describe("TASK 89: DayAudioButton source-contract", () => {
  const comp = source("src/components/itinerary-audio.tsx");

  test("fail-closed: dan brez uporabnih postankov → brez gumba", () => {
    expect(comp).toContain("if (!available) return null");
    expect(comp).toContain("usableStops.length > 0");
  });

  test("klientni blob predpomnilnik (LRU) + objekt URL-ji", () => {
    expect(comp).toContain("cachedUrlFor");
    expect(comp).toContain("rememberBlob");
    expect(comp).toContain("URL.createObjectURL");
    expect(comp).toContain("URL.revokeObjectURL");
  });

  test("iskrena napaka (role=alert) + loading stanje + ustavljanje", () => {
    expect(comp).toContain('role="alert"');
    expect(comp).toContain('"loading"');
    expect(comp).toContain("stopPlayback");
    expect(comp).toContain('audio.addEventListener("ended"');
  });

  test("print:hidden (dokument ostane dejstva, ne zvok) + a11y", () => {
    expect(comp).toContain("print:hidden");
    expect(comp).toContain("aria-label");
    expect(comp).toContain("L.buttonAria(dayNumber)");
  });

  test("analitika: itinerary_audio_play s površino", () => {
    expect(comp).toContain('trackPlannerEvent("itinerary_audio_play"');
    expect(comp).toContain("surface");
  });

  test("POST /api/tts s strukturiranim telesom (lang + day)", () => {
    expect(comp).toContain('"/api/tts"');
    expect(comp).toContain("body: JSON.stringify");
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
