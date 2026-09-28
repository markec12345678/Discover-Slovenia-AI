import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  matchEventsForItinerary,
  matchEventsOutsideTrip,
} from "@/lib/events-match";
import { EVENTS } from "@/lib/events-data";
import { EVENTS_EN } from "@/lib/events-data-en";

/**
 * W6 (Issue #15, 1.136.0): BRSKALNI PAS "Kaj se dogaja izven tvojih datumov".
 *
 * Verifikacijska merila iz benchmarka (docs/UX-WORKFLOW-BENCHMARK-2026-09-27.md §3 W6):
 *  (1) obstoječo Dogodke sekcijo na /nacrtuj dopolni brskalni pas → SOURCE
 *      CONTRACT: API izračuna outsideEvents (generiranje + refine), planner
 *      izrisuje pas pod glavno mrežo.
 *  (2) vstopnični CTA po ISTI G6 poti (affiliate/partner) → SOURCE CONTRACT:
 *      ticketsHref = goHref("tickets", dest) prek /go redirecta; telemetrija
 *      listing_click (obstoječi funnel korak, NIČ novih imen) + strežniški
 *      redirect tracking.
 *  (3) varovalo: datumsko ujemanje ostane PRIMARNO → UNIT: komplement
 *      (dogodki, ki se prekrivajo z okvirjem, v pas NE pridejo; glavni
 *      match ohranja tier -1 prednost prekrivanja).
 *
 * Testni podatki so RESNIČNI (EVENTS dataset — bled ima 5 dogodkov;
 * bled-days-kremsnita 2027-06-13). Iskrena meja testa: "prihajajoči" filter
 * teče proti realnemu času — invariantne trditve (brez prekrivanja, brez
 * izključenih, isti nabor, limit) veljajo za KARKOLI vrne funkcija.
 */

// __tests/ → src/lib/__tests/; koren projekta je TRI ravni višje
const ROOT = new URL("../../../", import.meta.url);
const read = (p: string) =>
  readFileSync(new URL(p, ROOT), "utf-8") as string;

const ROUTE_SRC = read("src/app/api/itinerary/route.ts");
const REFINE_SRC = read("src/app/api/itinerary/refine/route.ts");
const TYPES_SRC = read("src/lib/types.ts");
const EVENTS_COMPONENT_SRC = read("src/components/itinerary-events.tsx");
const PLANNER_SRC = read("src/components/sections/itinerary-planner.tsx");

/** Dnevi z eno destinacijo (ista minimalna oblika kot API uporablja). */
const daysFor = (destId: string) => [
  { locations: [{ destination_id: destId }] },
];

/** Okvir okrog znanega bled-dogodka (2027-06-13) — lokalna polnoč ISO. */
const JUNE_WINDOW = {
  startMs: new Date(2027, 5, 10).getTime(),
  endMs: new Date(2027, 5, 16).getTime(),
};

// ---------------------------------------------------------------------------
// 1. matchEventsOutsideTrip — komplement okvirja (unit, deterministično)
// ---------------------------------------------------------------------------

describe("W6: matchEventsOutsideTrip — komplement okvirja potovanja", () => {
  test("iskrena meja: brez okvirja potovanja NI »izven datumov« → praznina", () => {
    expect(matchEventsOutsideTrip(daysFor("bled"), [], null)).toEqual([]);
    expect(matchEventsOutsideTrip(daysFor("bled"), [], undefined)).toEqual([]);
  });

  test("brez dni ni kandidatov → praznina", () => {
    expect(matchEventsOutsideTrip([], [], JUNE_WINDOW)).toEqual([]);
    expect(matchEventsOutsideTrip(null, [], JUNE_WINDOW)).toEqual([]);
  });

  test("KOMPLEMENT: noben vrnjeni dogodek se ne prekriva z okvirjem (varovalo: datumsko ujemanje ostane primarno)", () => {
    const result = matchEventsOutsideTrip(
      daysFor("bled"),
      [],
      JUNE_WINDOW,
      6,
      "sl"
    );
    // invarianta velja za karkoli vrne (tudi prazno)
    for (const ev of result) {
      const startMs = new Date(ev.date).getTime();
      const endMs = ev.endDate
        ? new Date(ev.endDate).getTime()
        : startMs;
      const overlaps =
        startMs <= JUNE_WINDOW.endMs && endMs >= JUNE_WINDOW.startMs;
      expect(overlaps, `dogodek ${ev.id} se prekriva z okvirjem`).toBe(false);
    }
    // konkretno: bled-days-kremsnita (2027-06-13) se z junijskim okvirjem
    // prekriva → NE sme biti v pasu (to je definicija komplementa)
    expect(result.map((e) => e.id)).not.toContain("bled-days-kremsnita");
  });

  test("glavni match ima prednost prekrivanja (tier -1) — bled-days-kremsnita je PRVI v glavni sekciji", () => {
    const main = matchEventsForItinerary(daysFor("bled"), 6, JUNE_WINDOW, "sl");
    expect(main.length).toBeGreaterThan(0);
    expect(main[0].id).toBe("bled-days-kremsnita");
  });

  test("izključeni ID-ji (že prikazani) ne pridejo v pas", () => {
    const all = matchEventsOutsideTrip(daysFor("bled"), [], JUNE_WINDOW, 6, "sl");
    if (all.length > 0) {
      const excluded = all[0].id;
      const rest = matchEventsOutsideTrip(
        daysFor("bled"),
        [excluded],
        JUNE_WINDOW,
        6,
        "sl"
      );
      expect(rest.map((e) => e.id)).not.toContain(excluded);
      expect(rest.length).toBe(all.length - 1);
    }
  });

  test("isti nabor destinacij: vsi vrnjeni dogodki so BLEDSKI (direktni zadetki)", () => {
    const result = matchEventsOutsideTrip(
      daysFor("bled"),
      [],
      JUNE_WINDOW,
      6,
      "sl"
    );
    const bledEventIds = new Set(
      EVENTS.filter((e) => e.destinationId === "bled").map((e) => e.id)
    );
    for (const ev of result) {
      expect(bledEventIds.has(ev.id), `dogodek ${ev.id} ni bledski`).toBe(true);
    }
    // bled ima 5 dogodkov v datasetu (1 v okvirju → največ 4 izven)
    expect(result.length).toBeLessThanOrEqual(4);
  });

  test("limit se spoštuje", () => {
    const result = matchEventsOutsideTrip(
      daysFor("bled"),
      [],
      JUNE_WINDOW,
      2,
      "sl"
    );
    expect(result.length).toBeLessThanOrEqual(2);
  });

  test("jezikovna plast: EN vrne ISTE ID-je (overlay spreminja samo ime/opis)", () => {
    const sl = matchEventsOutsideTrip(daysFor("bled"), [], JUNE_WINDOW, 6, "sl");
    const en = matchEventsOutsideTrip(daysFor("bled"), [], JUNE_WINDOW, 6, "en");
    expect(en.map((e) => e.id)).toEqual(sl.map((e) => e.id));
    // overlay res obstaja za te dogodke (EN plast ima vnose)
    const overlayCount = sl.filter((e) => EVENTS_EN[e.id]).length;
    expect(overlayCount).toBe(sl.length);
  });

  test("razvrstitev: featured prvi, znotraj skupine datum naraščajoče", () => {
    const result = matchEventsOutsideTrip(
      daysFor("bled"),
      [],
      JUNE_WINDOW,
      6,
      "sl"
    );
    if (result.length >= 2) {
      const byId = new Map(EVENTS.map((e) => [e.id, e]));
      for (let i = 1; i < result.length; i++) {
        const prev = byId.get(result[i - 1].id)!;
        const curr = byId.get(result[i].id)!;
        if (prev.featured === curr.featured) {
          expect(
            new Date(curr.date).getTime(),
            `vrstni red ${i - 1}→${i} (datum naraščajoče znotraj skupine)`
          ).toBeGreaterThanOrEqual(new Date(prev.date).getTime());
        } else {
          expect(prev.featured).toBe(true); // featured vedno pred ne-featured
          expect(curr.featured).toBe(false);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. SOURCE CONTRACT: API izračuna + planner izrisuje (G6 pot)
// ---------------------------------------------------------------------------

describe("W6: API + planner — source contract", () => {
  test("tip načrta ima opcijsko polje outsideEvents (nazaj kompatibilno)", () => {
    expect(TYPES_SRC).toMatch(/outsideEvents\?: ItineraryEvent\[\]/);
  });

  test("generacijska rura izračuna outsideEvents z izključenimi ŽE prikazanimi", () => {
    expect(ROUTE_SRC).toContain("plan.outsideEvents = matchEventsOutsideTrip(");
    expect(ROUTE_SRC).toContain("plan.events.map((e) => e.id)");
    // glavni match ostaja primaren (VAROVALO — nespremenjen klic)
    expect(ROUTE_SRC).toContain(
      "plan.events = matchEventsForItinerary(plan.days, 6, tripWindow, lang)"
    );
  });

  test("refine rura preračuna pas skupaj z glavnimi dogodki", () => {
    expect(REFINE_SRC).toContain(
      "mutated.outsideEvents = matchEventsOutsideTrip("
    );
    expect(REFINE_SRC).toContain("mutated.events.map((e) => e.id)");
  });

  test("planner poda outsideEvents + ticketsHref prek goHref ISTA G6 pot (/go/tickets)", () => {
    expect(PLANNER_SRC).toContain("outsideEvents={itinerary.outsideEvents}");
    expect(PLANNER_SRC).toMatch(
      /goHref\(\s*"tickets",\s*itinerary\.days\[0\]\.locations\[0\]\.destination_name/
    );
    // dest je deterministično izveden iz prvega postanka načrta
    expect(PLANNER_SRC).toContain(
      "itinerary.days[0]?.locations[0]?.destination_name"
    );
  });
});

// ---------------------------------------------------------------------------
// 3. SOURCE CONTRACT: komponenta — pas + vstopnični CTA + iskrenost
// ---------------------------------------------------------------------------

describe("W6: ItineraryEventsSection — brskalni pas + vstopnični CTA (source contract)", () => {
  test("nizi pasu obstajajo v VSEH 4 jezikih (naslov, namig, CTA, nota)", () => {
    for (const title of [
      '"Kaj se dogaja izven tvojih datumov"',
      '"What\'s on outside your dates"',
      '"Cosa succede fuori dalle tue date"',
      '"Was außerhalb deiner Termine los ist"',
    ]) {
      expect(EVENTS_COMPONENT_SRC).toContain(title);
    }
    for (const cta of [
      '"Išči vstopnice"',
      '"Search for tickets"',
      '"Cerca biglietti"',
      '"Tickets suchen"',
    ]) {
      expect(EVENTS_COMPONENT_SRC).toContain(cta);
    }
  });

  test("vstopnični CTA: ISTA G6 pot — trackFunnel listing_click (NIČ novih imen dogodkov)", () => {
    // telemetrija klikov na partnerja = obstoječi funnel korak listing_click
    expect(EVENTS_COMPONENT_SRC).toContain(
      'trackFunnel("listing_click", ticketsHref)'
    );
    // CTA se izriše SAMO, če je ticketsHref podan (planner kontekst)
    expect(EVENTS_COMPONENT_SRC).toContain("ticketsHref &&");
    // iskrena partnerska nota (zunanja rezervacija — ne notranja obljuba)
    expect(EVENTS_COMPONENT_SRC).toMatch(
      /ticketsNote[\s\S]{0,80}(zunanja rezervacija|external booking)/
    );
  });

  test("ISKRENOST: brskalne kartice NIMAJU »Dodaj v mojo pot« (izven datumov = ne lažemo z razporejanjem)", () => {
    // EventBrowseChip blok (med definicijo in ItineraryEventsSectionProps)
    const chipStart = EVENTS_COMPONENT_SRC.indexOf("function EventBrowseChip");
    const chipEnd = EVENTS_COMPONENT_SRC.indexOf(
      "interface ItineraryEventsSectionProps"
    );
    expect(chipStart).toBeGreaterThan(-1);
    const chipSrc = EVENTS_COMPONENT_SRC.slice(chipStart, chipEnd);
    expect(chipSrc).not.toContain("addMyTripItem");
    expect(chipSrc).not.toContain("onToggle");
    // glavna kartica DODATEV ohranja (write-through kanon)
    expect(EVENTS_COMPONENT_SRC.indexOf("addMyTripItem")).toBeGreaterThan(-1);
  });

  test("varovala: pas je DODATEN — glavni naslov/badge/dodatev ostajajo nespremenjeni", () => {
    expect(EVENTS_COMPONENT_SRC).toContain(
      '"Kaj se dogaja med tvojim obiskom"'
    );
    expect(EVENTS_COMPONENT_SRC).toContain('"Med tvojim obiskom"');
    expect(EVENTS_COMPONENT_SRC).toContain('"Dodaj v mojo pot"');
    // pas se ne izriše brez podatkov (praznina = ni pasu)
    expect(EVENTS_COMPONENT_SRC).toContain("safeOutside.length > 0");
    // varnostna meja max 6 (enaka glavni sekciji)
    expect(EVENTS_COMPONENT_SRC).toContain(
      "(outsideEvents ?? []).slice(0, 6)"
    );
  });

  test("/pot stran ostaja NESPREMENJENA za pas (brez propov se ne izrise — zero feature loss)", () => {
    // preberimo /pot page — NE sme podajati outsideEvents/ticketsHref
    const POT_SRC = read("src/app/pot/[shareId]/page.tsx");
    expect(POT_SRC).not.toContain("outsideEvents");
    expect(POT_SRC).not.toContain("ticketsHref");
    // shared-trip prav tako (ista sekcija na /pot)
    const SHARED_SRC = read("src/components/shared-trip.tsx");
    expect(SHARED_SRC).not.toContain("outsideEvents");
    expect(SHARED_SRC).not.toContain("ticketsHref");
  });
});
