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

// ===========================================================================
// W1-FAZA-2B-2 (1.129.0): plan-qa + packing-smart + refine + parser + izvozi
// ===========================================================================

import {
  answerPlanQuestion,
  EXAMPLE_QUESTIONS,
  buildUnknownAnswer,
} from "@/lib/plan-qa";
import { renderFactsSheet, buildPlanFacts } from "@/lib/plan-facts";
import { buildSmartPackingList } from "@/lib/packing-smart";
import { parseRefineCommand } from "@/lib/refine-command-parser";
import { applyQuickAction, QUICK_ACTIONS } from "@/lib/refine-actions";
import { buildItineraryAudioScript } from "@/lib/planner-audio";
import { buildItineraryICS, icsFileName } from "@/lib/ics-export";
import { formatEventDate } from "@/lib/events-data";
import { DAY_SEGMENT_LABELS } from "@/lib/day-segments";

describe("W1-faza-2b-2: PLAN Q&A 4-jezično", () => {
  test("EXAMPLE_QUESTIONS nosi vse štiri jezike", () => {
    expect(EXAMPLE_QUESTIONS.it[0]).toContain("km");
    expect(EXAMPLE_QUESTIONS.de[0]).toContain("km");
    expect(EXAMPLE_QUESTIONS.sl.length).toBe(EXAMPLE_QUESTIONS.it.length);
  });

  test("vprašanje v IT jeziku → deterministični odgovor v IT", () => {
    const it = generateDeterministicItinerary({ ...baseInput, language: "it", days: 2 });
    const res = answerPlanQuestion({
      question: "Quanti km e quanta guida in tutto?",
      itinerary: it,
      input: { ...baseInput, language: "it" },
      lang: "it",
    });
    expect(res).not.toBeNull();
    expect(res!.intent).toBe("drive_total");
    expect(res!.text).toContain("Viaggio intero:");
    expect(res!.text).toContain("al volante");
    expect(res!.text).not.toMatch(/[šžč]/); // brez SL mešanja
  });

  test("vprašanje v DE jeziku → odgovor v DE (pakirni namen)", () => {
    const de = generateDeterministicItinerary({ ...baseInput, language: "de", days: 2 });
    const res = answerPlanQuestion({
      question: "Was soll ich einpacken?",
      itinerary: de,
      input: { ...baseInput, language: "de" },
      lang: "de",
    });
    expect(res).not.toBeNull();
    expect(res!.intent).toBe("packing");
    expect(res!.text).toContain("Packliste");
  });

  test("IT dnevi (giorno 2) se razrešijo; izven obsega iskreno", () => {
    const it = generateDeterministicItinerary({ ...baseInput, language: "it", days: 2 });
    const oor = answerPlanQuestion({
      question: "Cosa c'è il giorno 7?",
      itinerary: it,
      input: { ...baseInput, language: "it" },
      lang: "it",
    });
    expect(oor!.intent).toBe("out_of_range");
    expect(oor!.text).toContain("solo 2");
    expect(oor!.text).toContain("giorni");
  });

  test("DE vremenski namen + vremenske besede v DE", () => {
    const de = generateDeterministicItinerary({ ...baseInput, language: "de", days: 2 });
    const res = answerPlanQuestion({
      question: "Wie ist das Wetter im Plan?",
      itinerary: de,
      input: { ...baseInput, language: "de" },
      lang: "de",
    });
    expect(res!.intent).toBe("weather");
    expect(res!.text).toContain("Wetter");
  });

  test("buildUnknownAnswer IT/DE — brez SL", () => {
    expect(buildUnknownAnswer("it")).toContain("non tirerò a indovinare");
    expect(buildUnknownAnswer("de")).toContain("und ich rate nicht");
    // zero regression
    expect(buildUnknownAnswer("sl")).toContain("ugibati pa ne bom");
  });

  test("renderFactsSheet 4-jezično (AI grounding list)", () => {
    const it = generateDeterministicItinerary({ ...baseInput, language: "it", days: 2 });
    const facts = buildPlanFacts(it, { ...baseInput, language: "it" }, "it");
    const sheet = renderFactsSheet(facts, "it");
    expect(sheet).toContain("DATI DEL PIANO");
    expect(sheet).toContain("Per giorno:");
    const de = generateDeterministicItinerary({ ...baseInput, language: "de", days: 2 });
    const factsDe = buildPlanFacts(de, { ...baseInput, language: "de" }, "de");
    expect(renderFactsSheet(factsDe, "de")).toContain("PLANFAKTEN");
    // zero regression SL
    const sl = generateDeterministicItinerary({ ...baseInput, language: "sl", days: 2 });
    const factsSl = buildPlanFacts(sl, baseInput, "sl");
    expect(renderFactsSheet(factsSl, "sl")).toContain("DEJSTVA O NAČRTU");
  });
});

describe("W1-faza-2b-2: PAMETNI PAKIRNI SEZNAM 4-jezično", () => {
  test("kosi + metoda opomba v IT/DE", () => {
    const it = generateDeterministicItinerary({ ...baseInput, language: "it", days: 2 });
    const listIt = buildSmartPackingList({
      itinerary: it,
      input: { ...baseInput, language: "it" },
      lang: "it",
    });
    expect(listIt).not.toBeNull();
    const labels = listIt!.items.map((i) => i.label).join(" | ");
    expect(labels).toContain("Costume"); // Swimwear (Bled poleti)
    expect(labels).not.toMatch(/Kopalke/);
    expect(listIt!.methodNote).toMatch(/previsione|stagionali/);

    const de = generateDeterministicItinerary({ ...baseInput, language: "de", days: 2 });
    const listDe = buildSmartPackingList({
      itinerary: de,
      input: { ...baseInput, language: "de" },
      lang: "de",
    });
    const labelsDe = listDe!.items.map((i) => i.label).join(" | ");
    expect(labelsDe).toContain("Badekleidung");
    expect(listDe!.methodNote).toMatch(/vorhersage|Vorhersage|Saison/i);
  });

  test("razlogi nosijo Giorno/Tag prefixe (dayRef)", () => {
    const it = generateDeterministicItinerary({ ...baseInput, language: "it", days: 2 });
    const list = buildSmartPackingList({
      itinerary: it,
      input: { ...baseInput, language: "it" },
      lang: "it",
    });
    const reasons = list!.items.map((i) => i.reason ?? "").join(" | ");
    expect(reasons).toMatch(/Giorno \d/);
    const de = generateDeterministicItinerary({ ...baseInput, language: "de", days: 2 });
    const listDe = buildSmartPackingList({
      itinerary: de,
      input: { ...baseInput, language: "de" },
      lang: "de",
    });
    expect(listDe!.items.map((i) => i.reason ?? "").join(" | ")).toMatch(/Tag \d/);
  });

  test("zero regression SL/EN", () => {
    const sl = generateDeterministicItinerary({ ...baseInput, language: "sl", days: 2 });
    const list = buildSmartPackingList({
      itinerary: sl,
      input: baseInput,
      lang: "sl",
    });
    expect(list!.items.map((i) => i.label).join(" | ")).toContain("Kopalke");
    const en = generateDeterministicItinerary({ ...baseInput, language: "en", days: 2 });
    const listEn = buildSmartPackingList({
      itinerary: en,
      input: { ...baseInput, language: "en" },
      lang: "en",
    });
    expect(listEn!.items.map((i) => i.label).join(" | ")).toContain("Swimwear");
  });
});

describe("W1-faza-2b-2: UKAZNI PARSER SL+EN+IT+DE", () => {
  test("IT hitre akcije prostega besedila", () => {
    expect(parseRefineCommand("meno guida").kind).toBe("quick-action");
    expect(parseRefineCommand("più natura").kind).toBe("quick-action");
    expect(parseRefineCommand("ritmo più calmo").kind).toBe("quick-action");
    expect(parseRefineCommand("più economico").kind).toBe("quick-action");
    expect(parseRefineCommand("più attivo").kind).toBe("quick-action");
  });

  test("DE hitre akcije prostega besedila", () => {
    expect(parseRefineCommand("weniger Fahrt").kind).toBe("quick-action");
    expect(parseRefineCommand("mehr Natur").kind).toBe("quick-action");
    expect(parseRefineCommand("langsamer").kind).toBe("quick-action");
    expect(parseRefineCommand("günstiger").kind).toBe("quick-action");
    expect(parseRefineCommand("mehr Essen").kind).toBe("quick-action");
  });

  test("IT/DE dodajanje/odstranjevanje destinacij", () => {
    const addIt = parseRefineCommand("aggiungi Piran");
    expect(addIt.kind).toBe("add-place");
    if (addIt.kind === "add-place") expect(addIt.placeName).toBe("Piran");
    const rmDe = parseRefineCommand("entferne Bled");
    expect(rmDe.kind).toBe("remove-place");
    if (rmDe.kind === "remove-place") expect(rmDe.placeName).toBe("Bled");
  });

  test("IT/DE eksplicitni dnevi (giorno 2 / 2. Tag)", () => {
    const it = parseRefineCommand("più natura il giorno 2", { daysCount: 3 });
    expect(it.kind).toBe("quick-action");
    if (it.kind === "quick-action") expect(it.day).toBe(2);
    const de = parseRefineCommand("mehr Natur am 2. Tag", { daysCount: 3 });
    expect(de.kind).toBe("quick-action");
    if (de.kind === "quick-action") expect(de.day).toBe(2);
  });

  test("IT/DE imenovani dnevi (primo/ultimo/erster/letzter + dnevi tedna)", () => {
    const primo = parseRefineCommand("più natura il primo giorno", { daysCount: 3 });
    expect(primo.kind).toBe("quick-action");
    if (primo.kind === "quick-action") expect(primo.day).toBe(1);
    const ultimo = parseRefineCommand("weniger Fahrt ultimo giorno", { daysCount: 3 });
    expect(ultimo.kind).toBe("quick-action");
    if (ultimo.kind === "quick-action") expect(ultimo.day).toBe(3);
    // sabato glede na znani start (2026-10-05 = ponedeljek → sabata = dan 6)
    const sab = parseRefineCommand("più cibo di sabato", {
      tripStartDate: "2026-10-05",
      daysCount: 8,
    });
    expect(sab.kind).toBe("quick-action");
    if (sab.kind === "quick-action") expect(sab.day).toBe(6);
    // Samstag
    const sam = parseRefineCommand("mehr Essen am Samstag", {
      tripStartDate: "2026-10-05",
      daysCount: 8,
    });
    expect(sam.kind).toBe("quick-action");
    if (sam.kind === "quick-action") expect(sam.day).toBe(6);
  });

  test("IT/DE NEPODPRTI nameni ostanejo iskreni (ne tiho)", () => {
    expect(parseRefineCommand("sposta il giorno 2").kind).toBe("unsupported");
    expect(parseRefineCommand("verschiebe den Tag").kind).toBe("unsupported");
    expect(parseRefineCommand("un giorno in più").kind).toBe("unsupported");
  });

  test("zero regression SL/EN vzorci", () => {
    expect(parseRefineCommand("manj vožnje").kind).toBe("quick-action");
    expect(parseRefineCommand("more nature").kind).toBe("quick-action");
    expect(parseRefineCommand("dodaj Bled").kind).toBe("add-place");
  });
});

describe("W1-faza-2b-2: HITRE AKCIJE + IZVOZI 4-jezično", () => {
  test("QUICK_ACTIONS nosijo it/de oznake in navodila", () => {
    const qa = QUICK_ACTIONS.find((q) => q.id === "less_driving")!;
    expect(qa.label.it).toBe("Meno guida");
    expect(qa.label.de).toBe("Weniger Fahrt");
    expect(qa.instruction.it!(2)).toContain("Giorno 2");
    expect(qa.instruction.de!(2)).toContain("Tag 2");
    expect(qa.instruction.sl(2)).toContain("Dan 2"); // zero regression
  });

  test("applyQuickAction izpis v IT (manj vožnje — miren dan)", () => {
    const it = generateDeterministicItinerary({ ...baseInput, language: "it", days: 2 });
    const res = applyQuickAction(it, { ...baseInput, language: "it" }, "slower_pace", 1, "it");
    expect(res.note).toMatch(/Giorno 1|una sola tappa|fascia oraria/);
    expect(res.note).not.toMatch(/[šžč]/);
  });

  test("zvočni povzetek v IT/DE (brskalniški glas)", () => {
    const it = generateDeterministicItinerary({ ...baseInput, language: "it", days: 2 });
    const scriptIt = buildItineraryAudioScript({
      itinerary: it,
      dayKm: { 1: 40, 2: 30 },
      groupSize: 2,
      locale: "it",
    });
    expect(scriptIt).not.toBeNull();
    expect(scriptIt!.text).toContain("viaggio in Slovenia dura");
    expect(scriptIt!.text).toContain("Buon viaggio!");
    const de = generateDeterministicItinerary({ ...baseInput, language: "de", days: 2 });
    const scriptDe = buildItineraryAudioScript({
      itinerary: de,
      dayKm: {},
      groupSize: 2,
      locale: "de",
    });
    expect(scriptDe!.text).toContain("Reise durch Slowenien");
    expect(scriptDe!.text).toContain("Gute Reise!");
  });

  test("ICS izvoz + ime datoteke v IT/DE", () => {
    const it = generateDeterministicItinerary({ ...baseInput, language: "it", days: 2 });
    const icsIt = buildItineraryICS(it, { lang: "it" });
    expect(icsIt).not.toBeNull();
    expect(icsIt!).toContain("Viaggio in Slovenia");
    expect(icsIt!).toMatch(/SUMMARY:Giorno \d/);
    expect(icsFileName(it, "it")).toMatch(/^viaggio-slovenia-/);
    const de = generateDeterministicItinerary({ ...baseInput, language: "de", days: 2 });
    expect(icsFileName(de, "de")).toMatch(/^reise-slowenien-/);
    // zero regression SL/EN
    const sl = generateDeterministicItinerary(baseInput);
    expect(icsFileName(sl, "sl")).toMatch(/^pot-slovenija-/);
    expect(icsFileName(sl, "en")).toMatch(/^trip-slovenia-/);
  });

  test("formatEventDate + DAY_SEGMENT_LABELS 4-jezično", () => {
    expect(formatEventDate("2026-07-15", undefined, "it")).toBe("15 lug 2026");
    expect(formatEventDate("2026-07-15", undefined, "de")).toBe("15. Juli 2026");
    expect(formatEventDate("2026-07-15", undefined, "en")).toBe("15 Jul 2026");
    expect(formatEventDate("2026-07-15", undefined, "sl")).toBe("15. jul 2026");
    expect(DAY_SEGMENT_LABELS.morning.it).toBe("Mattina");
    expect(DAY_SEGMENT_LABELS.evening.de).toBe("Abend");
    expect(DAY_SEGMENT_LABELS.morning.sl).toBe("Jutro"); // zero regression
  });
});

describe("W1-faza-2b-2: ROUTING — /nacrtuj odprt za IT/DE", () => {
  test("ITDE_STATIC_ROUTES vsebuje /nacrtuj (proxy ne 308-a več)", async () => {
    const routing = await import("@/i18n/routing");
    expect(routing.isItDeRoute("/nacrtuj")).toBe(true);
    // okoljske varovalke ostanejo zaprte (P4-8)
    expect(routing.isItDeRoute("/trznica")).toBe(false);
    expect(routing.isItDeRoute("/potovanje")).toBe(false);
    expect(routing.isItDeRoute("/pot")).toBe(false);
    // ISSUE #24 Sklop 7 (1.169.0): Go Mode je odprt za IT/DE (EN dedovanje)
    expect(routing.isItDeRoute("/na-poti")).toBe(true);
    expect(routing.isLocaleRoute("/nacrtuj", "it")).toBe(true);
    expect(routing.isLocaleRoute("/nacrtuj", "de")).toBe(true);
  });
});
