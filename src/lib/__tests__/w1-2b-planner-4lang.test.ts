import { describe, expect, test } from "bun:test";
import { PL } from "@/lib/planner-lang";
import { generateDeterministicItinerary } from "@/lib/deterministic-itinerary";
import { buildFallbackRationale } from "@/lib/itinerary-quality";
import { validateItineraryGeo } from "@/lib/geo-validation";
import { buildStopReasons } from "@/lib/stop-insights";
import { buildPackingList } from "@/lib/packing-list";
import { matchEventsForItinerary } from "@/lib/events-match";
import { availabilityNote } from "@/lib/supply/availability-note";
import { buildCrowdNotices } from "@/lib/crowd-alternatives";
import { weatherCodeToTextFor } from "@/lib/weather-utils";
import { formatDayLabel } from "@/lib/itinerary-weather";
import type { Itinerary, PlannerInput } from "@/lib/types";

/**
 * W1-FAZA-2B (Issue #15): regresijska varovalka 4-jezičnega planner pogona.
 *
 * Pogodba (UX-WORKFLOW-BENCHMARK §4 V0 + kanon faze 2a):
 * - IT/DE sta POLNOPRAVNA jezika pogona (ne več SL-only fallback);
 * - manjkajoč prevod v PL() deduje EN (nikoli SL za IT/DE uporabnika — P4-8);
 * - neznan jezik → SL (nazaj-kompatibilno s starejšimi shranjenimi načrti);
 * - SL in EN izpisi ostanejo BITNO NESPREMENJENI (zero regression).
 */

const baseInput: PlannerInput = {
  budget: 500,
  days: 2,
  interests: ["narava"],
  season: "summer",
  groupSize: 2,
  language: "sl",
};

function itin2days(lang: PlannerInput["language"]): Itinerary {
  return generateDeterministicItinerary({ ...baseInput, language: lang });
}

describe("W1-faza-2b: PL() helper pogodba", () => {
  test("eksplicitni IT/DE prevodi zmagajo", () => {
    expect(
      PL("it", { sl: "zimsko", en: "winter", it: "invernale", de: "Winter" })
    ).toBe("invernale");
    expect(
      PL("de", { sl: "zimsko", en: "winter", it: "invernale", de: "Winter" })
    ).toBe("Winter");
  });

  test("manjkajoč IT/DE prevod deduje EN — NIKOLI SL (P4-8)", () => {
    expect(PL("it", { sl: "slovensko", en: "english" })).toBe("english");
    expect(PL("de", { sl: "slovensko", en: "english" })).toBe("english");
  });

  test("neznan/undefined jezik → SL (nazaj-kompatibilno)", () => {
    expect(PL("xx", { sl: "slovensko", en: "english" })).toBe("slovensko");
    expect(PL(undefined, { sl: "slovensko", en: "english" })).toBe("slovensko");
    expect(PL(null, { sl: "slovensko", en: "english" })).toBe("slovensko");
  });

  test("SL/EN ostajata kanonični (zero regression)", () => {
    expect(PL("sl", { sl: "a", en: "b", it: "c", de: "d" })).toBe("a");
    expect(PL("en", { sl: "a", en: "b", it: "c", de: "d" })).toBe("b");
  });
});

describe("W1-faza-2b: deterministični motor izpisuje IT/DE", () => {
  test("recommendations so v italijanščini", () => {
    const it = itin2days("it");
    expect(it.recommendations?.[0]).toContain("Prenota l'alloggio");
    expect(it.tips?.[0]).toContain("Inizia presto");
  });

  test("recommendations so v nemščini", () => {
    const de = itin2days("de");
    expect(de.recommendations?.[0]).toContain("Buche die Unterkunft");
    expect(de.tips?.[0]).toContain("Starte früh");
  });

  test("vremenski fallback (winter) je v jeziku pogona — ne SL-only", () => {
    const it = generateDeterministicItinerary({
      ...baseInput,
      season: "winter",
      language: "it",
    });
    const de = generateDeterministicItinerary({
      ...baseInput,
      season: "winter",
      language: "de",
    });
    const en = generateDeterministicItinerary({
      ...baseInput,
      season: "winter",
      language: "en",
    });
    // POPRAVLJEN LATENTNI HROŠČ: prej je EN dobil "sneg" (SL-only fallback)
    expect(it.days[0].weather.condition).toBe("neve");
    expect(de.days[0].weather.condition).toBe("Schnee");
    expect(en.days[0].weather.condition).toBe("snow");
  });

  test("tagline postankov iz IT/DE prekrivnih plasti (faza 2a overlayji)", () => {
    const it = itin2days("it");
    const sl = itin2days("sl");
    const notes = it.days[0].locations.map((l) => l.notes ?? "");
    const slNotes = sl.days[0].locations.map((l) => l.notes ?? "");
    // IT načrt nosi IT tagline vsaj na enem postanku (slovenski tagline ≠
    // italijanski iz overlayja — preverimo, da se razlikujejo od SL izpisov)
    expect(notes.join("|")).not.toBe(slNotes.join("|"));
  });

  test("SL/EN izpisi ostanejo nespremenjeni (zero regression)", () => {
    const sl = itin2days("sl");
    expect(sl.recommendations?.[0]).toBe(
      "Rezerviraj nastanitev vsaj 2 tedna vnaprej"
    );
    const en = itin2days("en");
    expect(en.recommendations?.[0]).toBe(
      "Book accommodation at least 2 weeks ahead"
    );
  });
});

describe("W1-faza-2b: enrich moduli 4-jezično", () => {
  test("buildFallbackRationale — IT/DE stavki", () => {
    const quality = {
      totalStops: 4,
      uniqueDestinations: 3,
      drivingMinutes: 120,
      budgetAccuracy: 1,
      daysWithBreaks: 2,
    } as unknown as Parameters<typeof buildFallbackRationale>[1];
    const it = buildFallbackRationale(
      { ...baseInput, language: "it" },
      quality,
      "it"
    );
    expect(it).toContain("Il viaggio è pianificato");
    expect(it).toContain("con le preferenze");
    const de = buildFallbackRationale(
      { ...baseInput, language: "de" },
      quality,
      "de"
    );
    expect(de).toContain("Die Reise ist für eine");
  });

  test("validateItineraryGeo — msgDayKm v IT/DE", () => {
    // Bled → Ljubljana → Piran ≈ 170 cestnih km > prag warn (150) — sproži
    // pravilo dayKm; termini realistični (vožnje pokrite z rezervo)
    const heavy: Itinerary = {
      days: [
        {
          day: 1,
          weather: { condition: "sončno", temp: 22 },
          locations: [
            {
              destination_id: "bled",
              destination_name: "Bled",
              time_slot: "9:00–11:00",
              duration: 2,
              estimated_cost: 20,
            },
            {
              destination_id: "ljubljana",
              destination_name: "Ljubljana",
              time_slot: "12:30–15:30",
              duration: 3,
              estimated_cost: 20,
            },
            {
              destination_id: "piran",
              destination_name: "Piran",
              time_slot: "17:30–20:00",
              duration: 2.5,
              estimated_cost: 20,
            },
          ],
        },
      ],
      total_budget: 60,
    } as unknown as Itinerary;
    const it = validateItineraryGeo(heavy, "it");
    const itMsgs = (it.issues ?? []).map((i) => i.message).join(" | ");
    expect(itMsgs).toContain("km di guida in un giorno");
    const de = validateItineraryGeo(heavy, "de");
    const deMsgs = (de.issues ?? []).map((i) => i.message).join(" | ");
    expect(deMsgs).toContain("km Fahrt an einem Tag");
    const sl = validateItineraryGeo(heavy, "sl");
    const slMsgs = (sl.issues ?? []).map((i) => i.message).join(" | ");
    expect(slMsgs).toContain("km vožnje v enem dnevu");
  });

  test("buildStopReasons — interes oznake v IT/DE", () => {
    // Bled bestFor = romantika/družina/fotografija → interes "romantika"
    const plan: Itinerary = {
      days: [
        {
          day: 1,
          weather: { condition: "sončno", temp: 22 },
          locations: [
            {
              destination_id: "bled",
              destination_name: "Bled",
              time_slot: "9:00–12:00",
              duration: 3,
              estimated_cost: 20,
            },
          ],
        },
      ],
      total_budget: 20,
    } as unknown as Itinerary;
    const it = buildStopReasons(
      plan,
      { ...baseInput, interests: ["romantika"], language: "it" },
      "it"
    );
    const reason = it.days[0].locations[0].reason ?? "";
    expect(reason).toContain("corrisponde ai tuoi interessi");
    expect(reason).toContain("romanticismo");
    const de = buildStopReasons(
      plan,
      { ...baseInput, interests: ["romantika"], language: "de" },
      "de"
    );
    const reasonDe = de.days[0].locations[0].reason ?? "";
    expect(reasonDe).toContain("passt zu deinen Interessen");
    expect(reasonDe).toContain("Romantik");
    const en = buildStopReasons(
      plan,
      { ...baseInput, interests: ["romantika"], language: "en" },
      "en"
    );
    expect(en.days[0].locations[0].reason ?? "").toContain(
      "matches your interests (romance"
    );
  });

  test("buildPackingList — sezonski kosi v IT/DE", () => {
    const it = buildPackingList({ ...baseInput, lang: "it" });
    expect(it.some((i) => i.includes("Crema solare"))).toBe(true);
    const de = buildPackingList({ ...baseInput, lang: "de" });
    expect(de.some((i) => i.includes("Sonnencreme"))).toBe(true);
    const sl = buildPackingList({ ...baseInput, lang: "sl" });
    expect(sl.some((i) => i.includes("Sončna krema"))).toBe(true);
  });

  test("matchEventsForItinerary — dogodki iz EVENTS_IT/DE overlayjev", () => {
    const days = [
      {
        day: 1,
        locations: [{ destination_id: "ljubljana" }],
      },
    ];
    const it = matchEventsForItinerary(days, 3, null, "it");
    expect(it.length).toBeGreaterThan(0);
    // imena dogodkov v IT ne smejo biti slovenska (overlay deluje)
    const sl = matchEventsForItinerary(days, 3, null, "sl");
    expect(it.map((e) => e.name).join("|")).not.toBe(
      sl.map((e) => e.name).join("|")
    );
    const de = matchEventsForItinerary(days, 3, null, "de");
    expect(de.length).toBeGreaterThan(0);
  });

  test("availabilityNote — 4-jezična semantika (Task 47 iskrenost)", () => {
    expect(availabilityNote("live_available", "it")).toContain(
      "disponibilità: confermata"
    );
    expect(availabilityNote("unknown", "de")).toContain(
      "nicht überprüft"
    );
    expect(availabilityNote("not_supported", "it")).toContain(
      "verifica con il fornitore"
    );
  });

  test("weatherCodeToTextFor — polni dispečer", () => {
    expect(weatherCodeToTextFor("it", 0)).toBe("cielo sereno");
    expect(weatherCodeToTextFor("de", 61)).toBe("Regen");
    expect(weatherCodeToTextFor("en", 0)).toBe("clear");
    expect(weatherCodeToTextFor("sl", 0)).toBe("jasno");
  });

  test("formatDayLabel — IT/DE prek Intl", () => {
    expect(formatDayLabel("2026-07-14", "it")).toBe("martedì, 14 luglio");
    expect(formatDayLabel("2026-07-14", "de")).toBe("Dienstag, 14. Juli");
    expect(formatDayLabel("2026-07-14", "en")).toBe("Tuesday, 14 July");
  });

  test("buildCrowdNotices — brez startDate → prazno (semantika ohranjena)", () => {
    const plan: Itinerary = {
      days: [
        {
          day: 1,
          weather: { condition: "sončno", temp: 22 },
          locations: [
            {
              destination_id: "bled",
              destination_name: "Bled",
              time_slot: "9:00–12:00",
              duration: 3,
              estimated_cost: 20,
            },
          ],
        },
      ],
      total_budget: 20,
    } as unknown as Itinerary;
    expect(buildCrowdNotices(plan, baseInput, "it")).toEqual([]);
  });
});
