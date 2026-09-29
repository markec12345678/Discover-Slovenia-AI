// 1.140.1 — CLS NA /pot POTEH: regresijska varovalka rezervacije zemljevida.
//
// ODKRITJE (produkcijska Lighthouse diagnostika 28. 9. 2026, 1.140.0):
//   · /pot/[shareId] CLS 0.3393 · /pot/embed/[shareId] CLS 0.3805
//     (prag vrat 0.10; Performance API na živi produkciji — EN sam zamik)
//   · VZROK 1 (glavni): pogoj „routeByDay.length > 0“ je bral Zustand
//     shrambo, ki je med SSR PRAZNA (napolni se šele v useEffect po
//     mount-u) → CELoten odsek zemljevida (naslov + 500/600 px + legenda)
//     se je materializiral šele ob hidrataciji in premaknil vse pod sabo.
//   · VZROK 2: dynamic(ssr:false) ne izriše NIČ (niti loading placeholder)
//     v strežniškem HTML-ju → 500/600 px prostora brez rezervacije.
//   · LCP na obeh poteh je prva Leafletova OSM ploščica (delay ~1.8 s) →
//     preconnect na a/b/c.tile.openstreetmap.org od vznožja SSR.
//
// POPRAVEK: deriveRoute (čista funkcija, izluščena iz setItinerary — en vir
// resnice) se pokliče DIREKTNO na itinerer-ju propu (useMemo) → SSR izriše
// odsek; MapView je ovit v fiksno višino; preconnect <link> v JSX (React 19
// Float dvigne v <head>).
//
// NAMEN: preprečiti TIHO vračanje zamika — če kdorkoli povrne branje
// routeCoords/routeByDay iz shrambe ali odstrani višinsko ovojnico, test
// pade. Dokaz popravka: lokalni E2E 0 zamikov (412px) / 0.026 z periodičnimi
// posodobitvami (375px, pod pragom); produkcija pred: 0.38/0.34.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { deriveRoute, DAY_COLORS } from "@/lib/store";
import type { Itinerary, LocationVisit } from "@/lib/types";

const STORE_SRC = readFileSync(
  new URL("../store.ts", import.meta.url),
  "utf8"
);
const SHARED_TRIP_SRC = readFileSync(
  new URL("../../components/shared-trip.tsx", import.meta.url),
  "utf8"
);
const SCREEN_SRC = readFileSync(
  new URL("../../app/pot/shared-trip-screen.tsx", import.meta.url),
  "utf8"
);

// ── Pomočniki: minimalen veljaven Itinerary ────────────────────────────────
const loc = (over: Partial<LocationVisit>): LocationVisit => ({
  destination_id: "bled",
  destination_name: "Bled",
  time_slot: "jutro",
  duration: 3,
  estimated_cost: 20,
  notes: "",
  ...over,
});

const itineraryOf = (
  days: Itinerary["days"]
): Itinerary => ({
  days,
  total_budget: 100,
  recommendations: [],
  tips: [],
  source: "deterministic",
});

// ── FUNKCIONALNO: deriveRoute (čista izpeljava — ista logika kot prej
//    znotraj setItinerary, zdaj EN vir resnice, ki jo pokliče tudi SSR) ────
describe("1.140.1 deriveRoute: funkcionalna izpeljava poti", () => {
  test("dataset destinacija (lat/lng polji lokacije neveljavno 0/0) se razreši iz DESTINATIONS", () => {
    // Točno primer lokalne preizkusne poti: location lat/lng = 0/0 (neveljavno
    // polje), a destination_id "bled" ŽIVI v T1 datasetu → pin + dan obstaneta.
    const { routeCoords, routeByDay } = deriveRoute(
      itineraryOf([
        {
          day: 1,
          locations: [loc({ destination_id: "bled", lat: 0, lng: 0 })],
          weather: { condition: "sončno", temp: 20 },
        },
      ])
    );
    expect(routeCoords).toHaveLength(1);
    // koordinate prihajajo iz dataseta, ne iz (neveljavnih) polj lokacije
    expect(routeCoords[0]!.lat).not.toBe(0);
    expect(routeCoords[0]!.lng).not.toBe(0);
    expect(routeCoords[0]!.name).toBe("Bled");
    expect(routeByDay).toHaveLength(1);
    expect(routeByDay[0]!.day).toBe(1);
  });

  test("OSM kraj (neznan id + lastne koordinate) živi na zemljevidu (1.42)", () => {
    const { routeCoords } = deriveRoute(
      itineraryOf([
        {
          day: 1,
          locations: [
            loc({
              destination_id: "osm-node-999",
              destination_name: "Zavetišče",
              lat: 46.1234,
              lng: 13.9876,
            }),
          ],
          weather: { condition: "", temp: 0 },
        },
      ])
    );
    expect(routeCoords).toHaveLength(1);
    expect(routeCoords[0]!.lat).toBeCloseTo(46.1234);
    expect(routeCoords[0]!.lng).toBeCloseTo(13.9876);
  });

  test("null island (0,0) varovalo: AI halucinirana koordinata NE risa pina (TASK 50 §14 GEO)", () => {
    const { routeCoords, routeByDay } = deriveRoute(
      itineraryOf([
        {
          day: 1,
          locations: [
            loc({ destination_id: "socca-avnica", lat: 0, lng: 0 }),
          ],
          weather: { condition: "", temp: 0 },
        },
      ])
    );
    expect(routeCoords).toHaveLength(0);
    expect(routeByDay).toHaveLength(0);
  });

  test("dan brez ene veljavne koordinate izpada iz byDay (a ostali dnevi ostanejo)", () => {
    const { routeByDay } = deriveRoute(
      itineraryOf([
        {
          day: 1,
          locations: [loc({ destination_id: "ne-obstaja", lat: 0, lng: 0 })],
          weather: { condition: "", temp: 0 },
        },
        {
          day: 2,
          locations: [loc({ destination_id: "bled" })],
          weather: { condition: "", temp: 0 },
        },
      ])
    );
    expect(routeByDay).toHaveLength(1);
    expect(routeByDay[0]!.day).toBe(2);
  });

  test("barve dni zaporedno iz DAY_COLORS + OSRM geometry passthrough", () => {
    const geometry: [number, number][] = [
      [46.1, 14.1],
      [46.2, 14.2],
    ];
    const { routeByDay } = deriveRoute(
      itineraryOf([
        {
          day: 1,
          locations: [loc({ destination_id: "bled" })],
          weather: { condition: "", temp: 0 },
        },
        {
          day: 2,
          locations: [loc({ destination_id: "bled" })],
          weather: { condition: "", temp: 0 },
          routeGeometry: geometry,
        },
      ])
    );
    expect(routeByDay).toHaveLength(2);
    expect(routeByDay[0]!.color).toBe(DAY_COLORS[0]);
    expect(routeByDay[1]!.color).toBe(DAY_COLORS[1]);
    expect(routeByDay[1]!.geometry).toBe(geometry);
    expect(routeByDay[0]!.geometry).toBeUndefined();
  });

  test("prazna lokacije dneva → prazna izpeljava (SSR pogoj ostane negativen, brez odseka)", () => {
    const { routeCoords, routeByDay } = deriveRoute(
      itineraryOf([
        {
          day: 1,
          locations: [],
          weather: { condition: "", temp: 0 },
        },
      ])
    );
    expect(routeCoords).toHaveLength(0);
    expect(routeByDay).toHaveLength(0);
  });
});

// ── SOURCE-CONTRACT: SSR rezervacija (glavni vzrok CLS) ───────────────────
describe("1.140.1 source-contract: odsek zemljevida v SSR", () => {
  test("SharedTrip izpeljuje pot iz PROPA (deriveRoute + useMemo), NE iz shrambe", () => {
    // Glavni vzrok CLS: branje routeCoords/routeByDay iz Zustand shrambe
    // (med SSR prazna) je naredilo pogoj odseka lažno negativen v strežniškem
    // HTML-ju. Vračanje teh selektorjev = vračanje zamika 0.38 → test pade.
    expect(SHARED_TRIP_SRC).toContain("deriveRoute(itinerary)");
    expect(SHARED_TRIP_SRC).toContain(
      'import { useAppStore, DAY_COLORS, deriveRoute } from "@/lib/store"'
    );
    expect(SHARED_TRIP_SRC).not.toContain(
      "useAppStore((s) => s.routeCoords)"
    );
    expect(SHARED_TRIP_SRC).not.toContain("useAppStore((s) => s.routeByDay)");
  });

  test("MapView je ovit v fiksno višino (SSR prostor za dynamic ssr:false)", () => {
    // dynamic(ssr:false) ne izriše NIČ v strežniškem HTML-ju — višino mora
    // rezervirati navaden SSR-div (500/600 se ujema s placeholderjem IN z
    // MapView lastno višino → ni zamika ob zamenjavi).
    expect(SHARED_TRIP_SRC).toContain(
      '<div className="h-[500px] w-full sm:h-[600px]">'
    );
    expect(SHARED_TRIP_SRC).toContain(
      "<MapView routeCoords={routeCoords} routeByDay={routeByDay} />"
    );
  });

  test("store: setItinerary kliče deriveRoute (en vir resnice, brez duplikacije)", () => {
    // Izvleček v skupno funkcijo sme ostati SAMO enkrat — setItinerary
    // pokliče isto funkcijo kot SSR, sicer bi vedenje zaidilo narazen.
    expect(STORE_SRC).toContain("export function deriveRoute(");
    expect(STORE_SRC).toContain("const { routeCoords, routeByDay } = deriveRoute(it);");
    // stara inline izpeljava (duplicate) ne sme ostati znotraj setItinerary
    const setItineraryBody = STORE_SRC.slice(
      STORE_SRC.indexOf("setItinerary: (it) =>"),
      STORE_SRC.indexOf("}));", STORE_SRC.indexOf("setItinerary: (it) =>"))
    );
    expect(setItineraryBody).not.toContain("DESTINATIONS.find");
  });
});

// ── SOURCE-CONTRACT: preconnect na OSM ploščice (LCP) ─────────────────────
describe("1.140.1 source-contract: preconnect na OSM ploščice", () => {
  test("screen izstreli <link rel=preconnect> za VSE tri poddomene (a/b/c)", () => {
    // LCP na obeh /pot poteh je prva Leafletova ploščica; Leafletov URL
    // predloga je https://{s}.tile.openstreetmap.org s privzetimi a/b/c.
    for (const sub of ["a", "b", "c"]) {
      expect(SCREEN_SRC).toContain(
        `<link rel="preconnect" href="https://${sub}.tile.openstreetmap.org" />`
      );
    }
  });

  test("NE uvaža preconnect() iz react-dom (v RSC namiga ne izstreli)", () => {
    // Iskrena lekcija iz 1.140.1: klic preconnect() v strežniški komponenti
    // v tem okolju NI izstrelil <link> v <head> (izmerjeno v dev SSR).
    // React 19 Float dvigne <link> iz JSX — to pot uporabljamo. Vračanje
    // uvoza iz react-dom (ki bi tiho ne delal) → test pade.
    expect(SCREEN_SRC).not.toContain('from "react-dom"');
  });
});

// ── SOURCE-CONTRACT: zgodnji zagon Leaflet uvoza (LCP, 1.140.2) ───────────
//
// ODKRITJE (produkcija 1.140.1, topla funkcija, Performance API časovnica):
//   · Leaflet chunk se je naložil ŠELE ob prvi izrisu dynamic komponente
//     MED hidratacijo (zagon ~1445 ms ≈ 445 ms ZA začetkom hidratacije)
//     → serijsko ZA njo; prva OSM ploščica (LCP) šele 1971 ms.
// POPRAVEK: obljuba uvoza se začne ob EVALUACIJI MODULA (vzporedno s
//   hidratacijo); dynamic() prejme že začeto obljubo.
describe("1.140.2 source-contract: zgodnji zagon Leaflet uvoza (LCP)", () => {
  test("uvoz se začne ob evaluaciji modula Z window varovalko (SSR/bun-test varno)", () => {
    // Leaflet dostopa do window OB UVOZU (zato ssr:false) — modul se
    // evaluira tudi na strežniku (SSR client komponent) in v bun testih,
    // zato MORA biti zagon pogojen z typeof window. Odstranitev varovalke
    // = sesutje SSR → test pade.
    expect(SHARED_TRIP_SRC).toContain("typeof window === \"undefined\"");
    expect(SHARED_TRIP_SRC).toContain("const mapViewModule =");
    expect(SHARED_TRIP_SRC).toContain(
      'import("@/components/sections/map-view").then((m) => m.MapView);'
    );
  });

  test("dynamic() prejme ŽE ZAČETO obljubo (ne čakanje na prvi izris)", () => {
    // dynamic loader vrača mapViewModule (obljuba, začeta ob evaluaciji
    // modula v brskalniku) z ?? varovalko za robne runtime. Vračanje na
    // golo () => import(…) (serijsko za hidratacijo) = vračanje LCP
    // zamika ~450 ms → test pade.
    expect(SHARED_TRIP_SRC).toContain(
      "() => mapViewModule ?? import(\"@/components/sections/map-view\").then((m) => m.MapView)"
    );
  });

  test("map-section.tsx NIMA zgodnjega zagona (popravek je NAMERNO samo /pot)", () => {
    // Zgodnji zagon Leafleta je smiseln SAMO na straneh, kjer je LCP
    // element ploščica (obe /pot poti). Drugod (npr. hero slika na /) bi
    // prednalaganje ~450 KB tekmovalo za pasovno širino NJIHOVEGA LCP.
    // Razširitev vzorca na map-section = zavrta izboljšava tu → test pade.
    const MAP_SECTION_SRC = readFileSync(
      new URL("../../components/sections/map-section.tsx", import.meta.url),
      "utf8"
    );
    expect(MAP_SECTION_SRC).not.toContain("const mapViewModule =");
    expect(MAP_SECTION_SRC).not.toContain("typeof window === \"undefined\"");
  });
});
