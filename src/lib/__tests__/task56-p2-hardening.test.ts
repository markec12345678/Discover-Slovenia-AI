// ============================================================================
// TASK 56 — P2 DATA INTEGRITY HARDENING (test-first, 1.58.3)
// ============================================================================
// DOKAZOVANE VRZELI (revizija TASK 55, razdelek J — vsaka reproducirana iz
// kode PRED popravkom):
//
//  P2-1  /go/transfers?product={id}: validacija je bila SAMO format
//        (^\d{1,10}$ + >0) — veljavno-formatiran, a NEEXISTIRAJOČ transferId
//        (npr. 999999999) je preusmeril na kiwitaxi.com/en/transfers/999999999
//        (neobstoječ produkt). Kanonski dataset (9614 transfer id-jev) je
//        strežniško na voljo — membership JE poceni/determinističen.
//
//  P2-2  /api/itinerary/save: ran samo sanitizeItinerary (shape guard) —
//        klientova €1 cena / fabrikantrt providerProductId / drug provider
//        so se SHRANILI in prikazali na javni deljeni povezavi /pot/{shareId}.
//        Popravek ponovno uporabi OBSTOJEČO verigo (ista kot refine echo):
//        verifyCurrentStopsAuthority → validateItinerarySupply(selection=[])
//        → recomputeTotalBudget. NOVI verification sistem NI bil ustvarjen.
//
//  P2-3  refine notes: DISPLAY-ONLY (prosto besedilo nikoli ne hrani cene/
//        ID/geo/razpoložljivostne strukture) → dokumentirano kot FOLLOW-UP,
//        brez refactoringa (pravilo taska §5).
//
// DETERMINIZEM: isti vzorec kot task49/task50 — kanoniki se berejo
// DINAMIČNO iz baseline dataseta (brez fixture dvojnikov); skipIf, če
// data/kiwitaxi-routes.json manjka; dataset se v beforeEach/afterEach
// resetira (modulno stanje si delijo vse datoteke v procesu).
// ============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  getKiwitaxiBaseline,
  resetKiwitaxiDataset,
  disableKiwitaxiBaselineForTests,
  kiwitaxiTransferExists,
} from "@/lib/supply/providers/kiwitaxi/dataset";
import { revalidateSavedItinerarySupply } from "@/lib/supply/itinerary-validation";
import type { Itinerary, LocationVisit } from "@/lib/types";
import type { KiwiRoute } from "@/lib/supply/providers/kiwitaxi/types";

const baseline = getKiwitaxiBaseline();
const hasKt = Boolean(baseline);

/** Kanonična ruta z geo (dinamično — brez hardcodanih dvojnikov). */
const ktRoute: KiwiRoute | undefined = baseline?.routes.find(
  (r) => r.fromLat != null && r.fromLng != null && r.classes.length > 0
);
const canonicalPrice = ktRoute?.minPriceEur ?? 77;
const canonicalTitle = ktRoute
  ? `${ktRoute.fromName} → ${ktRoute.toName}`
  : "kanon";
const canonicalRef = ktRoute ? `kiwitaxi:${ktRoute.id}` : "kiwitaxi:411";
const memberTransferId = ktRoute?.cheapestTransferId ?? 1439;
const FABRICATED_TRANSFER_ID = 999999999; // veljaven format, NI v datasetu

// ---------------------------------------------------------------------------
// P2-1 — /go/transfers CANONICAL MEMBERSHIP (route-level)
// ---------------------------------------------------------------------------

describe("TASK 56 P2-1: /go/transfers membership (kanonski dataset)", () => {
  // UVOZ route handlerja NEPOSREDNO (isti vzorec kot task44 §13).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GET } = require("../../app/go/[provider]/route") as {
    GET: (
      req: Request,
      ctx: { params: Promise<{ provider: string }> }
    ) => Promise<Response>;
  };

  beforeEach(() => {
    resetKiwitaxiDataset();
  });
  afterEach(() => {
    disableKiwitaxiBaselineForTests(false);
  });

  const call = (qs: string) =>
    GET(new Request(`http://localhost/go/transfers${qs}`), {
      params: Promise.resolve({ provider: "transfers" }),
    });

  test.skipIf(!hasKt || !ktRoute)(
    "① ČLAN transferId → 302 (veljaven tok NEPOREZEN — regresija)",
    async () => {
      const res = await call(
        `?product=${memberTransferId}&from=Ljubljana&dest=Bled`
      );
      expect(res.status).toBe(302);
      const loc = res.headers.get("location")!;
      expect(loc).toBe(
        `https://kiwitaxi.com/en/transfers/${memberTransferId}`
      );
    }
  );

  test.skipIf(!hasKt)(
    "② P2-1 DOKAZ: veljaven FORMAT, a NI član dataseta → 404 + BREZ preusmeritve (prej: 302 na neobstoječ produkt)",
    async () => {
      const res = await call(
        `?product=${FABRICATED_TRANSFER_ID}&from=Ljubljana&dest=Bled`
      );
      expect(res.status).toBe(404);
      expect(res.headers.get("location")).toBeNull(); // NIKAMOR ne preusmeri
    }
  );

  test(
    "③ malformiran product (injekcija/predolg/ničel) → 400 (regresija nespremenjena)",
    async () => {
      for (const bad of [
        "?product=javascript:alert(1)",
        "?product=../../evil",
        "?product=0",
        "?product=-5",
        "?product=1441.5",
        "?product=" + "1".repeat(11),
      ]) {
        const res = await call(bad);
        expect(res.status).toBe(400);
        expect(res.headers.get("location")).toBeNull();
      }
    }
  );

  test.skipIf(!hasKt)(
    "④ dataset MANJKA (okoljska odpoved) → 302 kot prej (NE kaznujemo — članstva ni mogoče dokazati)",
    async () => {
      resetKiwitaxiDataset();
      disableKiwitaxiBaselineForTests(true);
      const res = await call(
        `?product=${FABRICATED_TRANSFER_ID}&from=Ljubljana&dest=Bled`
      );
      expect(res.status).toBe(302); // fail-open SAMO ob okoljski odpovedi
      expect(res.headers.get("location")).toContain(
        `/transfers/${FABRICATED_TRANSFER_ID}`
      );
    }
  );

  test.skipIf(!hasKt || !ktRoute)(
    "⑤ helper kiwitaxiTransferExists: član=true, fabricated=false, manjkajoč dataset=null",
    () => {
      expect(kiwitaxiTransferExists(memberTransferId)).toBe(true);
      expect(kiwitaxiTransferExists(FABRICATED_TRANSFER_ID)).toBe(false);
      expect(kiwitaxiTransferExists(0)).toBe(false); // nemogoč id
      resetKiwitaxiDataset();
      disableKiwitaxiBaselineForTests(true);
      expect(kiwitaxiTransferExists(memberTransferId)).toBe(null);
    }
  );

  test.skipIf(!hasKt)(
    "⑥ neznan provider ostaja 404 (regresija allowlista)",
    async () => {
      const res = await GET(
        new Request("http://localhost/go/evilprovider?product=1"),
        { params: Promise.resolve({ provider: "evilprovider" }) }
      );
      expect(res.status).toBe(404);
    }
  );
});

// ---------------------------------------------------------------------------
// P2-2 — SAVE-MEJA KANONSKA REVALIDACIJA (ista veriga kot refine echo)
// ---------------------------------------------------------------------------

describe("TASK 56 P2-2: revalidateSavedItinerarySupply (save meja)", () => {
  beforeEach(() => {
    resetKiwitaxiDataset();
  });
  afterEach(() => {
    disableKiwitaxiBaselineForTests(false);
  });

  const stop = (over: Partial<LocationVisit> = {}): LocationVisit => ({
    destination_id: canonicalRef,
    destination_name: canonicalTitle,
    time_slot: "09:00-10:00",
    duration: 60,
    estimated_cost: canonicalPrice,
    notes: "kanonska opomba",
    ...over,
  });

  const itin = (
    locations: LocationVisit[],
    total_budget = canonicalPrice
  ): Itinerary => ({
    days: [
      {
        day: 1,
        locations,
        weather: { condition: "sončno", temp: 20 },
      },
    ],
    total_budget,
    recommendations: [],
    tips: [],
    source: "ai",
  });

  test.skipIf(!hasKt || !ktRoute)(
    "① SCENARIJ 1 (cena): klient pošlje €1 + realen KT ref → KANONSKA cena zmaga (price_mismatch popravljen)",
    () => {
      const { itinerary, report } = revalidateSavedItinerarySupply(
        itin([stop({ estimated_cost: 1 })], 1),
        "sl"
      );
      const s = itinerary.days[0]!.locations[0]!;
      expect(s.estimated_cost).toBe(canonicalPrice); // NE klientovih €1
      expect(report.priceCorrections).toBe(1);
      expect(itinerary.total_budget).toBe(canonicalPrice); // preračunano
    }
  );

  test.skipIf(!hasKt || !ktRoute)(
    "①b SCENARIJ 1 (naslov): podtaknjen naslov → kanonski naslov obnovljen",
    () => {
      const { itinerary } = revalidateSavedItinerarySupply(
        itin([stop({ destination_name: "Fake LUXURY transfer €1" })]),
        "sl"
      );
      expect(itinerary.days[0]!.locations[0]!.destination_name).toBe(
        canonicalTitle
      );
    }
  );

  test.skipIf(!hasKt || !ktRoute)(
    "①c SCENARIJ 1 (geo): podtaknjene koordinate → kanonske obnovljene",
    () => {
      const { itinerary } = revalidateSavedItinerarySupply(
        itin([stop({ lat: 1, lng: 1 })]),
        "sl"
      );
      const s = itinerary.days[0]!.locations[0]!;
      expect(s.lat).toBe(ktRoute!.fromLat);
      expect(s.lng).toBe(ktRoute!.fromLng);
    }
  );

  test.skipIf(!hasKt)(
    "② SCENARIJ 2 (ID): veljaven FORMAT ref, a NI v datasetu → postanek ODSTRANJEN (fake_supply_ref, fail-closed)",
    () => {
      const { itinerary, report } = revalidateSavedItinerarySupply(
        itin([stop({ destination_id: "kiwitaxi:99999999", estimated_cost: 500 })]),
        "sl"
      );
      expect(itinerary.days[0]!.locations).toHaveLength(0); // ODSTRANJEN
      expect(report.rejected).toBe(1);
      expect(report.issues.some((i) => i.rule === "fake_supply_ref")).toBe(true);
    }
  );

  test.skipIf(!hasKt || !ktRoute)(
    "③ SCENARIJ 3 (provider): drug provider (viator:99999) s klientovo €500 → obstoj ohranjen, cena UNKNOWN (NaN + poštena opomba) — ISTA semantika kot refine echo (TASK 50)",
    () => {
      const { itinerary } = revalidateSavedItinerarySupply(
        itin([
          stop({
            destination_id: "viator:99999",
            destination_name: "Fake tour",
            estimated_cost: 500,
          }),
        ]),
        "sl"
      );
      const s = itinerary.days[0]!.locations[0]!;
      expect(Number.isNaN(s.estimated_cost)).toBe(true); // NE klientovih €500
      expect(s.notes).toMatch(/Cena ni preverjena/);
    }
  );

  test.skipIf(!hasKt)(
    "④ OSM s klientovo trditvijo €5 → unknown (NaN); OSM €0 ostane €0 (info_only semantika)",
    () => {
      const a = revalidateSavedItinerarySupply(
        itin([stop({ destination_id: "osm:node-123", estimated_cost: 5 })]),
        "sl"
      );
      expect(Number.isNaN(a.itinerary.days[0]!.locations[0]!.estimated_cost)).toBe(
        true
      );
      const b = revalidateSavedItinerarySupply(
        itin([stop({ destination_id: "osm:node-123", estimated_cost: 0 })]),
        "sl"
      );
      expect(b.itinerary.days[0]!.locations[0]!.estimated_cost).toBe(0);
    }
  );

  test.skipIf(!hasKt || !ktRoute)(
    "⑤ duplikat istega KT refa v načrtu → TOČNO 1× (dedupe — exactly once)",
    () => {
      const { itinerary, report } = revalidateSavedItinerarySupply(
        itin([stop(), stop({ time_slot: "11:00-12:00" })]),
        "sl"
      );
      expect(itinerary.days[0]!.locations).toHaveLength(1);
      expect(report.deduped).toBe(1);
    }
  );

  test.skipIf(!hasKt || !ktRoute)(
    "⑥ total_budget je PRERAČUNAN iz dejanskih postankov (klientova številka NI resnica — isti princip kot P0.2 recenzija)",
    () => {
      const { itinerary } = revalidateSavedItinerarySupply(
        itin([stop()], 1), // klient trdi skupno €1
        "sl"
      );
      expect(itinerary.total_budget).toBe(canonicalPrice);
    }
  );

  test.skipIf(!hasKt || !ktRoute)(
    "⑦ KT dataset MANJKA (okoljska odpoved) → postanek ostane, cena unknown (NE kaznujemo — isto kot refine/task49)",
    () => {
      resetKiwitaxiDataset();
      disableKiwitaxiBaselineForTests(true);
      const { itinerary } = revalidateSavedItinerarySupply(
        itin([stop({ estimated_cost: 123 })]),
        "sl"
      );
      const s = itinerary.days[0]!.locations[0]!;
      expect(s.destination_id).toBe(canonicalRef); // obstaja
      expect(Number.isNaN(s.estimated_cost)).toBe(true); // cena unknown
    }
  );

  test.skipIf(!hasKt || !ktRoute)(
    "⑧ T1 postanki (destinacija BREZ dvopičja) ostanejo NEDOTIKNJENI",
    () => {
      const { itinerary, report } = revalidateSavedItinerarySupply(
        itin([stop({ destination_id: "bled", destination_name: "Bled" })]),
        "sl"
      );
      expect(itinerary.days[0]!.locations[0]!.destination_id).toBe("bled");
      expect(report.supplyStops).toBe(0); // ni supply sklica → plast se ne meša
    }
  );

  test.skipIf(!hasKt || !ktRoute)(
    "⑨ LEGITIMEN načrt (kanonske vrednosti) → nespremenjen (regresija: 0 popravkov)",
    () => {
      const legit = itin([stop()]);
      const { itinerary, report } = revalidateSavedItinerarySupply(legit, "sl");
      expect(itinerary.days[0]!.locations).toHaveLength(1);
      expect(report.priceCorrections).toBe(0);
      expect(report.rejected).toBe(0);
      expect(report.deduped).toBe(0);
      expect(itinerary.days[0]!.locations[0]!.estimated_cost).toBe(
        canonicalPrice
      );
      expect(itinerary.total_budget).toBe(canonicalPrice);
    }
  );

  test.skipIf(!hasKt || !ktRoute)(
    "⑩ EN jezik → price_unverified opomba v angleščini",
    () => {
      const { itinerary } = revalidateSavedItinerarySupply(
        itin([
          stop({
            destination_id: "viator:99999",
            destination_name: "Fake tour",
            estimated_cost: 500,
          }),
        ]),
        "en"
      );
      expect(itinerary.days[0]!.locations[0]!.notes).toMatch(
        /Price not verified/
      );
    }
  );
});
