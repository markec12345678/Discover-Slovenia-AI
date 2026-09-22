// ============================================================================
// TASK 92 — KONSOLIDACIJA TTS JEDRA: testi (1.82.0)
// ============================================================================
//
// Pokriva:
//   1. ByteLruCache (čisti razred, lastna instanca): LRU osvežitev na get,
//      izrivanje po BAJTIH (ne števcu), neizvedljiv vnos, statistika;
//   2. planAudioCacheKey (djb2): determinističnost, občutljivost na
//      vsebino (ne dolžino!), jezik, skupino, km, proračun; imenski
//      prostor „p" ločen od „n" (dnevna pripoved);
//   3. withTimeout: resolvi v roku pusti vrednost; prekoraček vrže
//      TtsEngineError("timeout");
//   4. VOICE_FOR_LANG: sl → tongtong, en → jam (popravek EN glasu D2 poti);
//   5. SOURCE-CONTRACT obeh poti + klienta:
//      - /api/itinerary/tts: strukturiran vhod (NI prostega besedila),
//        skript gradi strežnik, glas po jeziku prek jedra, skupni LRU,
//        rate limit SAMO na zgrešitvi, maxChunks varovalka, iskrene
//        napake, glave poštenosti;
//      - /api/tts: isto jedro (uvoz iz tts-engine, ne lokalne kopije),
//        rate limit na zgrešitvi;
//      - tts-engine: SDK samo strežniško, singleton, zaporedni klici,
//        timeout s čiščenjem timerja, spajanje concatWavBuffers;
//      - klient (itinerary-planner): pošlje STRUKTURIRANE podatke, audioKey
//        iz planAudioCacheKey (ne iz dolžine), analitika cache glave.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

// ---------------------------------------------------------------------------
// 1. ByteLruCache — LRU po bajtih (svoja instanca, 0 odvisnosti)
// ---------------------------------------------------------------------------

import {
  ByteLruCache,
  TTS_CACHE_MAX_BYTES,
  TtsEngineError,
  VOICE_FOR_LANG,
  withTimeout,
} from "@/lib/tts-engine";

function buf(bytes: number): Buffer {
  return Buffer.alloc(bytes, 0x61);
}

describe("TASK 92: ByteLruCache (LRU po bajtih)", () => {
  test("prazna instanca: get → null, statistika 0", () => {
    const c = new ByteLruCache(1000);
    expect(c.get("x")).toBeNull();
    const s = c.stats();
    expect(s.entries).toBe(0);
    expect(s.bytes).toBe(0);
    expect(s.maxBytes).toBe(1000);
  });

  test("put/get osnovni krog", () => {
    const c = new ByteLruCache(1000);
    const b = buf(10);
    c.put("k", b);
    expect(c.get("k")).toBe(b);
    expect(c.stats()).toEqual({ entries: 1, bytes: 10, maxBytes: 1000 });
  });

  test("get osveži LRU pozicijo (starejši se izriva prvi)", () => {
    const c = new ByteLruCache(25);
    c.put("a", buf(10));
    c.put("b", buf(10));
    c.get("a"); // a postane najnovejši
    c.put("c", buf(10)); // preseže 25 → izriva NAJSTAREJŠI (b)
    expect(c.get("a")).not.toBeNull();
    expect(c.get("b")).toBeNull(); // izriván, čeprav je prišel pred c
    expect(c.get("c")).not.toBeNull();
    expect(c.stats().bytes).toBe(30 - 10); // 20
  });

  test("izrivanje več vnosov naenkrat ob velikem put", () => {
    const c = new ByteLruCache(20);
    c.put("a", buf(8));
    c.put("b", buf(8));
    c.put("c", buf(8)); // 24 > 20 → odpade NAJSTAREJŠI (a)
    expect(c.get("a")).toBeNull();
    expect(c.get("b")).not.toBeNull();
    expect(c.get("c")).not.toBeNull();
    // nov velik vnos izrive vse, kar ne gre v proračun (b nato c)
    c.put("d", buf(15));
    expect(c.get("b")).toBeNull();
    expect(c.get("c")).toBeNull();
    expect(c.get("d")).not.toBeNull();
    expect(c.stats().bytes).toBe(15);
  });

  test("vnos VEČJI od proračuna se ne shrani (neizvedljiv)", () => {
    const c = new ByteLruCache(16);
    c.put("huge", buf(32));
    expect(c.get("huge")).toBeNull();
    expect(c.stats().entries).toBe(0);
  });

  test("put iste kode nadomesti vrednost (brez duplikata)", () => {
    const c = new ByteLruCache(1000);
    c.put("k", buf(10));
    c.put("k", buf(20));
    expect(c.stats()).toEqual({ entries: 1, bytes: 20, maxBytes: 1000 });
  });

  test("skupni proračun tts-engine je 32 MB (ista disciplina kot prej)", () => {
    expect(TTS_CACHE_MAX_BYTES).toBe(32 * 1024 * 1024);
  });
});

// ---------------------------------------------------------------------------
// 2. planAudioCacheKey — deterministični ključ nad VSEBINO
// ---------------------------------------------------------------------------

import {
  buildItineraryAudioScript,
  planAudioCacheKey,
  type AudioScriptItinerary,
} from "@/lib/planner-audio";
import { narrationCacheKey } from "@/lib/itinerary-audio";

const planA: AudioScriptItinerary = {
  total_budget: 500,
  days: [
    {
      day: 1,
      locations: [
        { destination_name: "Bled" },
        { destination_name: "Vintgar" },
      ],
    },
    {
      day: 2,
      locations: [{ destination_name: "Piran" }],
    },
  ],
};

const planB: AudioScriptItinerary = {
  total_budget: 500,
  days: [
    {
      day: 1,
      locations: [
        { destination_name: "Bohinj" },
        { destination_name: "Savica" },
      ],
    },
    {
      day: 2,
      locations: [{ destination_name: "Koper" }],
    },
  ],
};

describe("TASK 92: planAudioCacheKey (djb2 nad vsebino)", () => {
  test("determinističen: isti vhod → isti ključ (ponovni izračun)", () => {
    const k1 = planAudioCacheKey({
      itinerary: planA,
      dayKm: { 1: 100, 2: 50 },
      groupSize: 2,
      locale: "sl",
    });
    const k2 = planAudioCacheKey({
      itinerary: planA,
      dayKm: { 1: 100, 2: 50 },
      groupSize: 2,
      locale: "sl",
    });
    expect(k1).toBe(k2);
  });

  test("DVA RAZLIČNA načrta z ENAKO dolžino skripta → RAZLIČNA ključa (popravek buba)", () => {
    // obe skripti sta po dolžini praktično enaki (Bled/Vintgar/Piran vs
    // Bohinj/Savica/Koper — podobno število znakov) — stari ključ
    // `${locale}:${groupSize}:${chars}` bi ju IZENAČIL in klient bi
    // predvajal STARI zvok.
    const s1 = buildItineraryAudioScript({
      itinerary: planA,
      dayKm: {},
      groupSize: 2,
      locale: "sl",
    });
    const s2 = buildItineraryAudioScript({
      itinerary: planB,
      dayKm: {},
      groupSize: 2,
      locale: "sl",
    });
    expect(Math.abs(s1!.chars - s2!.chars)).toBeLessThanOrEqual(3); // ~enaka dolžina
    const k1 = planAudioCacheKey({
      itinerary: planA,
      dayKm: {},
      groupSize: 2,
      locale: "sl",
    });
    const k2 = planAudioCacheKey({
      itinerary: planB,
      dayKm: {},
      groupSize: 2,
      locale: "sl",
    });
    expect(k1).not.toBe(k2);
  });

  test("občutljivost: jezik / skupina / km / proraček / imena", () => {
    const base = {
      itinerary: planA,
      dayKm: { 1: 100 },
      groupSize: 2,
      locale: "sl" as const,
    };
    const k0 = planAudioCacheKey(base);
    expect(
      planAudioCacheKey({ ...base, locale: "en" as const })
    ).not.toBe(k0);
    expect(planAudioCacheKey({ ...base, groupSize: 3 })).not.toBe(k0);
    expect(planAudioCacheKey({ ...base, dayKm: { 1: 110 } })).not.toBe(k0);
    expect(
      planAudioCacheKey({
        ...base,
        itinerary: { ...planA, total_budget: 501 },
      })
    ).not.toBe(k0);
    expect(
      planAudioCacheKey({
        ...base,
        itinerary: {
          ...planA,
          days: [
            { day: 1, locations: [{ destination_name: "Bled " }] }, // presledek
            ...planA.days.slice(1),
          ],
        },
      })
    ).not.toBe(k0);
    // ŠTEVILKA dneva je v skriptu (»Dan 1:«) → mora biti v ključu
    expect(
      planAudioCacheKey({
        ...base,
        itinerary: {
          ...planA,
          days: [
            { day: 3, locations: planA.days[0].locations }, // dan 3, ne 1
            ...planA.days.slice(1),
          ],
        },
      })
    ).not.toBe(k0);
  });

  test("neobstoječi km se ne prereva v ključ (null izpada, NaN ne)", () => {
    const a = planAudioCacheKey({
      itinerary: planA,
      dayKm: {},
      groupSize: 2,
      locale: "sl",
    });
    const b = planAudioCacheKey({
      itinerary: planA,
      dayKm: { 99: 123 }, // dan 99 ne obstaja v načrtu
      groupSize: 2,
      locale: "sl",
    });
    expect(a).toBe(b); // ključi dneva, ki ni v days, ne vplivajo
  });

  test("imenski prostor: prefiks p, ločen od n (dnevna pripoved)", () => {
    const k = planAudioCacheKey({
      itinerary: planA,
      dayKm: {},
      groupSize: 2,
      locale: "sl",
    });
    expect(k.startsWith("p")).toBe(true);
    expect(k.length).toBeLessThan(12); // p + zgoščena vrednost
    const n = narrationCacheKey(
      {
        dayNumber: 1,
        dateLabel: null,
        stops: [{ time: "09:00", name: "Bled" }],
      },
      "sl"
    );
    expect(n.startsWith("n")).toBe(true);
    expect(k).not.toBe(n);
  });
});

// ---------------------------------------------------------------------------
// 3. withTimeout — pravi timeout (tipiziran, timer počiščen)
// ---------------------------------------------------------------------------

describe("TASK 92: withTimeout", () => {
  test("obljuba, ki se razreši v roku, vrne vrednost", async () => {
    const v = await withTimeout(
      new Promise<string>((resolve) => setTimeout(() => resolve("ok"), 5)),
      1000
    );
    expect(v).toBe("ok");
  });

  test("prekoračen rok vrže TtsEngineError z vrsto timeout", async () => {
    let caught: unknown = null;
    try {
      await withTimeout(
        new Promise<string>((resolve) =>
          setTimeout(() => resolve("prepozno"), 50)
        ),
        5
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TtsEngineError);
    expect((caught as TtsEngineError).kind).toBe("timeout");
    expect((caught as TtsEngineError).message).toContain("5");
  });

  test("zavrnila obljuba se preda naprej (ne zaužije timeout)", async () => {
    let caught: unknown = null;
    try {
      await withTimeout(Promise.reject(new Error("sdk")), 1000);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("sdk");
  });
});

// ---------------------------------------------------------------------------
// 4. Glasovi (ENA resnica — EN uporabnik ne posluša več tongtonga)
// ---------------------------------------------------------------------------

describe("TASK 92: glasovi po jeziku", () => {
  test("sl → tongtong, en → jam", () => {
    expect(VOICE_FOR_LANG.sl).toBe("tongtong");
    expect(VOICE_FOR_LANG.en).toBe("jam");
    expect(Object.keys(VOICE_FOR_LANG).sort()).toEqual(["en", "sl"]);
  });
});

// ---------------------------------------------------------------------------
// 5. SOURCE-CONTRACT — obe poti + jedro + klient
// ---------------------------------------------------------------------------

describe("TASK 92: tts-engine source-contract", () => {
  const engine = source("src/lib/tts-engine.ts");

  test("SDK uvaža SAMO dinamično (strežniško, ena instanca na proces)", () => {
    expect(engine).toContain('import("z-ai-web-dev-sdk")');
    expect(engine).toContain("ttsClientPromise");
    expect(engine).toContain("ttsClientPromise = null"); // odpoved → ponastavitev
  });

  test("spajanje WAV: isto jedro kot TASK 89 (concatWavBuffers)", () => {
    expect(engine).toContain("concatWavBuffers");
    expect(engine).not.toContain("wavDataPayload"); // stara D2 kopija izrinjena
  });

  test("zaporedni klici + pravi timeout na klic", () => {
    expect(engine).toContain("for (const chunk of chunks)");
    expect(engine).toContain("withTimeout(ttsChunk(chunk, voice), TTS_CALL_TIMEOUT_MS)");
    expect(engine).toContain("clearTimeout(timer)"); // timer se POČISTI
  });

  test("iskrene tipizirane napake (timeout/unavailable/invalid_wav)", () => {
    expect(engine).toContain('"timeout"');
    expect(engine).toContain('"unavailable"');
    expect(engine).toContain('"invalid_wav"');
    expect(engine).toContain("class TtsEngineError");
  });

  test("skupni LRU predpomnilnik (ByteLruCache, 32 MB, ena instanca)", () => {
    expect(engine).toContain("export class ByteLruCache");
    expect(engine).toContain("export const ttsCache");
    expect(engine).toContain("TTS_CACHE_MAX_BYTES");
  });
});

describe("TASK 92: /api/itinerary/tts source-contract (D2 pot)", () => {
  const route = source("src/app/api/itinerary/tts/route.ts");

  test("VHOD NI več prosti tekst — strukturirani podatki načrta", () => {
    expect(route).toContain("buildItineraryAudioScript");
    expect(route).not.toContain("body.text"); // kavčuk stare oblike
    expect(route).toContain("itinerary: z.object");
    expect(route).toContain("dayKm: z.record");
    expect(route).toContain("groupSize: z.number().int()");
  });

  test("skript gradi STREŽNIK (ista čista funkcija kot klient)", () => {
    expect(route).toContain("const script = buildItineraryAudioScript");
    expect(route).toContain('locale === "en" ? "en" : "sl"');
  });

  test("glas po jeziku PREK jedra (ne hardcoded tongtong za EN)", () => {
    expect(route).toContain("synthesizeChunks");
    expect(route).not.toContain('voice: "tongtong"'); // stara napaka: EN v tongtongu
  });

  test("skupni LRU + hit/miss glava + planAudioCacheKey", () => {
    expect(route).toContain("ttsCache.get");
    expect(route).toContain("ttsCache.put");
    expect(route).toContain("planAudioCacheKey");
    expect(route).toContain('"X-TTS-Cache": "hit"');
    expect(route).toContain('"X-TTS-Cache": "miss"');
  });

  test("rate limit SAMO na zgrešitvi predpomnilnika (replay prosto)", () => {
    // vrstni red v izvorni kodi: ttsCache.get … NATO rateLimit
    const cacheIdx = route.indexOf("ttsCache.get(cacheKey)");
    const limitIdx = route.indexOf('key: "itinerary-tts"');
    expect(cacheIdx).toBeGreaterThan(-1);
    expect(limitIdx).toBeGreaterThan(cacheIdx);
  });

  test("razrez/spajanje iz skupnega jedra (stara lokalna kopija izrinjena)", () => {
    expect(route).toContain("chunkNarration");
    expect(route).not.toContain("function splitIntoChunks");
    expect(route).not.toContain("function wavDataPayload");
    expect(route).not.toContain("function concatWav(");
    expect(route).not.toContain("function wavFormat");
  });

  test("iskrene napake ostajajo (SL sporočila, 400/413/429/502)", () => {
    expect(route).toContain("Neveljaven JSON.");
    expect(route).toContain("poskusi znova");
    expect(route).toContain("method_not_allowed");
    expect(route).toContain("NARRATION_LIMITS.maxChunks");
  });

  test("glave poštenosti: kosi + jezik + glas + predpomnilnik", () => {
    expect(route).toContain('"X-Audio-Chunks"');
    expect(route).toContain('"X-Audio-Locale"');
    expect(route).toContain('"X-Audio-Voice"');
    expect(route).toContain('"Cache-Control": "no-store"');
  });
});

describe("TASK 92: /api/tts source-contract (konsolidacija na jedro)", () => {
  const route = source("src/app/api/tts/route.ts");

  test("uvozi jedro (ne vzdržuje lokalne kopije glasu/predpomnilnika)", () => {
    expect(route).toContain('from "@/lib/tts-engine"');
    expect(route).toContain("synthesizeChunks");
    expect(route).toContain("ttsCache");
    // LOKALNE kopije (TASK 89) so se preselile v jedro:
    expect(route).not.toContain("const VOICE_FOR_LANG");
    expect(route).not.toContain("function getTtsClient");
    expect(route).not.toContain("const cache = new Map");
    expect(route).not.toContain("function cachePut");
  });

  test("strukturirana vrata ostajajo (zrcalijo NARRATION_LIMITS)", () => {
    expect(route).toContain("buildDayNarrationScript");
    expect(route).toContain("narrationCacheKey");
    expect(route).toContain("chunkNarration");
    expect(route).toContain("NARRATION_LIMITS.maxStops");
    expect(route).toContain("stops: z.array(stopSchema)");
  });

  test("rate limit SAMO na zgrešitvi (prej ga NI bilo — luknja zaprta)", () => {
    const cacheIdx = route.indexOf("ttsCache.get(cacheKey)");
    const limitIdx = route.indexOf('key: "api-tts"');
    expect(cacheIdx).toBeGreaterThan(-1);
    expect(limitIdx).toBeGreaterThan(cacheIdx);
    expect(route).toContain("rateLimit(request");
  });

  test("iskrene napake: 503 tts_unavailable, 400, 405 GET (nespremenjene)", () => {
    expect(route).toContain('{ error: "tts_unavailable" }');
    expect(route).toContain('{ error: "invalid_day" }');
    expect(route).toContain('{ error: "no_stops" }');
    expect(route).toContain("method_not_allowed");
  });
});

describe("TASK 92: klient (itinerary-planner) source-contract", () => {
  const comp = source("src/components/sections/itinerary-planner.tsx");

  test("pošlje STRUKTURIRANE podatke (ne besedila skripta)", () => {
    expect(comp).toContain("body: JSON.stringify({");
    expect(comp).toContain("itinerary,");
    expect(comp).toContain("dayKm,");
    expect(comp).toContain("groupSize: formData.groupSize,");
    expect(comp).not.toContain("text: audioScript.text"); // stara oblika
  });

  test("audioKey iz planAudioCacheKey (vsebina, ne dolžina)", () => {
    expect(comp).toContain("planAudioCacheKey");
    expect(comp).not.toContain("audioScript.chars}"); // stari šibki ključ
  });

  test("analitika ready prebere tudi strežniški predpomnilnik", () => {
    expect(comp).toContain('"X-TTS-Cache"');
    expect(comp).toContain("cache:");
  });

  test("strežniška SL napaka gre v konzolo (dijagnostika), klient vidi t()", () => {
    expect(comp).toContain('console.error("[itinerary/tts]"');
    expect(comp).toContain('t("listenError")');
  });
});

describe("TASK 92: neodvisnost površin (0 regresij DayAudioButton)", () => {
  test("DayAudioButton še vedno kliče /api/tts s strukturiranim dnem", () => {
    const button = source("src/components/itinerary-audio.tsx");
    expect(button).toContain('"/api/tts"');
    // telo: lang + day { dayNumber, dateLabel, stops } — skript gradi strežnik
    expect(button).toContain("dayNumber,");
    expect(button).toContain("stops: usableStops");
  });
});
