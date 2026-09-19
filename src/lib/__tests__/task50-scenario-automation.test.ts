// ============================================================================
// TASK 50 (§21) — SCENARIO AUTOMATION: 12 determinističnih testov nad REALNIMA
// API rutama (POST /api/itinerary + POST /api/itinerary/refine).
//
// Kaj je avtomatizirano (§21 obvezni seznam + 2 ekstra):
//   1. basic               7. tampered price (KT €1 → kanon €77)
//   2. budget              8. fake provider (evilcorp + fabrikantrt KT id)
//   3. impossible budget   9. provider unavailable (popolna omrežna izključitev)
//   4. one FIXED          10. SL/EN parity (isti kanonski podatkovni model)
//   5. two FIXED          11. echo tamper (stale current → P0 fix veja)
//   6. refine             12. duplicate FIXED (T4 dedupe)
//
// DETERMINIZEM (brez mock.module — ta pušča čez datoteke; dokazano v repu):
//   - globalThis.fetch zavrnil VSE omrežne klice v beforeEach, obnovljen v
//     afterAll (z-ai-web-dev-sdk + openai paket + OSRM + Open-Meteo +
//     Overpass vsi gredo čez global fetch → AI odpove → DETERMINISTIČNA
//     fallback pot; vreme brez startDate se sploh ne kliče);
//   - KT dataset = LOKALNA datoteka (edinemu priključenemu komercialnemu
//     viru omrežje ni potrebno) → kanonske cene so REALNE iz dataseta;
//   - unikaten x-real-ip na zahtevo → ločena rate-limit vedra (10/10 min);
//   - kanoniki se berejo dinamično iz baseline dataseta (isti vzorec kot
//     task49 — brez fixture dvojnikov); skipIf, če data/ manjka.
//
// Kaj je DOKAZANO: klient NI vir resnice — vsaka klientova cena/ID/geo se
// verificira proti strežniški resnici (kanon / unknown / reject), FIXED
// preživi točno 1× s kanonsko ceno, urnik je izvedljiv po konstrukciji,
// budget je iskren, SL/EN delita isti kanonski model.
// ============================================================================

import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  getKiwitaxiBaseline,
  resetKiwitaxiDataset,
} from "@/lib/supply/providers/kiwitaxi/dataset";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { Itinerary, LocationVisit } from "@/lib/types";

// ---------------------------------------------------------------------------
// OSRM teče prek node:https (NE global fetch) — zato bazo preusmerimo na
// nedosegljiv localhost PRED uvozom modulov, ki ga berejo ob evaluaciji
// (determinizem neodvisen od omrežja; ECONNREFUSED je takojšen,
// fetchOsrmLeg vrne null → poštene hevristične noge "~").
// Overpass v tej poti ni klican (cat/zoom gating → 0 klicev, log
// „degraded=-“); z-ai + openai paket + Open-Meteo gredo čez global fetch.
// ---------------------------------------------------------------------------
process.env.OSRM_BASE_URL = "https://127.0.0.1:9";

const { POST } = await import("@/app/api/itinerary/route");
const { POST: POST_REFINE } = await import("@/app/api/itinerary/refine/route");
const { resetRoadRoutingState } = await import("@/lib/road-routing-server");

// ---------------------------------------------------------------------------
// Kanoniki (dinamično iz PRODUKCIJSKEGA baseline-a — brez fixture dvojnikov)
// ---------------------------------------------------------------------------
const BASELINE = getKiwitaxiBaseline();
const KT_411 = BASELINE?.routes.find((r) => r.id === 411);
const KT_258775 = BASELINE?.routes.find((r) => r.id === 258775);
const hasKt = KT_411 != null && KT_258775 != null;
const KT_411_PRICE = KT_411?.minPriceEur ?? 77;
const KT_258775_PRICE = KT_258775?.minPriceEur ?? 33;

// ---------------------------------------------------------------------------
// Deterministično omrežje: VSI remote klici odpovejo (AI/OSRM/vreme/Overpass)
// ---------------------------------------------------------------------------
const realFetch = globalThis.fetch;
let ipCounter = 0;

beforeEach(() => {
  globalThis.fetch = (() =>
    Promise.reject(new Error("task50: network disabled (deterministic test)"))) as unknown as typeof fetch;
  resetKiwitaxiDataset();
  resetRoadRoutingState();
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

// ---------------------------------------------------------------------------
// Pomočniki (klientovi payloadi, kot jih pošilja pravi browser)
// ---------------------------------------------------------------------------
function jsonPost(url: string, body: unknown): Request {
  ipCounter += 1;
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": `10.50.10.${(ipCounter % 250) + 1}`,
    },
    body: JSON.stringify(body),
  });
}

function genPayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    budget: 500,
    days: 3,
    interests: ["narava", "mesta"],
    season: "summer",
    groupSize: 2,
    language: "sl",
    ...over,
  };
}

/** Klientova KT izbira — cena v njej je ZAUPANJA NEVREDEN claim. */
function ktSelection(id: string, priceEur: number): Record<string, unknown> {
  return {
    provider: "kiwitaxi",
    providerProductId: id,
    type: "transfer",
    title: `Transfer ${id} (klientova trditev)`,
    lat: 46.3,
    lng: 14.1,
    price: { amount: priceEur, currency: "EUR", unit: "per_transfer" },
    source: "supply-map",
    selectionState: "fixed",
  };
}

const SLOT_RE = /(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/;

function parseSlot(s: unknown): { start: number; end: number } | null {
  if (typeof s !== "string") return null;
  const m = s.match(SLOT_RE);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  if (end <= start) return null;
  return { start, end };
}

function allStops(it: Itinerary): LocationVisit[] {
  return (it.days ?? []).flatMap((d) => d.locations ?? []);
}

/** BudgetValidation z eksplicitnim preverjanjem prisotnosti (tsc čistost). */
function budgetOf(it: Itinerary): NonNullable<Itinerary["budgetValidation"]> {
  expect(it.budgetValidation).toBeDefined();
  return it.budgetValidation as NonNullable<Itinerary["budgetValidation"]>;
}

function supplyOf(it: Itinerary): NonNullable<Itinerary["supplyValidation"]> {
  expect(it.supplyValidation).toBeDefined();
  return it.supplyValidation as NonNullable<Itinerary["supplyValidation"]>;
}

function stopsWith(it: Itinerary, id: string): LocationVisit[] {
  return allStops(it).filter((l) => l.destination_id === id);
}

/** T1 postanek → kanonska cena (costPerPerson × groupSize); supply → null. */
function expectedCanonicalCost(
  stop: LocationVisit,
  groupSize: number
): number | null {
  if (/^(kiwitaxi|viator|getyourguide|osm):/.test(stop.destination_id ?? "")) {
    if (stop.destination_id === "kiwitaxi:411") return KT_411_PRICE;
    if (stop.destination_id === "kiwitaxi:258775") return KT_258775_PRICE;
    return null; // supply brez strežne resnice → unknown
  }
  const d = DESTINATIONS.find((x) => x.id === stop.destination_id);
  return d ? Math.round(d.costPerPerson * groupSize) : null;
}

/**
 * Skupne realističnostne invariante (§14/§17 — H3 gostota, H4 urnik):
 * fallback pot je izvedljiva PO KONSTRUKCIJI (drive-aware sloti + repair).
 */
function assertRealism(it: Itinerary): void {
  expect(it.days.length).toBeGreaterThanOrEqual(1);
  for (const day of it.days) {
    const locs = day.locations ?? [];
    expect(locs.length).toBeLessThanOrEqual(8); // H4: gostota ≤ 8 postankov/dan
    const slots = locs.map((l) => parseSlot(l.time_slot));
    for (const s of slots) expect(s).not.toBeNull(); // H3: parsable termini
    const parsed = slots.filter(Boolean) as { start: number; end: number }[];
    const sorted = [...parsed].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].end); // brez prekrivanj
    }
  }
  expect(it.geoValidation).toBeDefined();
  expect(it.budgetValidation).toBeDefined();
  expect(it.supplyValidation).toBeDefined();
}

async function generate(over: Record<string, unknown> = {}): Promise<Itinerary> {
  const res = await POST(jsonPost("/api/itinerary", genPayload(over)));
  expect(res.status).toBe(200);
  const it = (await res.json()) as Itinerary;
  expect(it?.days?.length).toBeGreaterThan(0);
  return it;
}

// ---------------------------------------------------------------------------
// SCENARIJI
// ---------------------------------------------------------------------------
describe.skipIf(!hasKt)("TASK 50 §21: scenario automation (deterministično, realni API poti)", () => {

  test("S1 basic — generacija vrne veljaven izvedljiv načrt (fallback, SL)", async () => {
    const it = await generate();
    expect(it.source).toBe("fallback"); // AI določno odpovedal → iskrena oznaka
    expect(it.days.length).toBe(3);
    assertRealism(it);
    // Vsi postanki so REALNI T1 ID-ji (brez izmišljenih)
    for (const s of allStops(it)) {
      expect(DESTINATIONS.some((d) => d.id === s.destination_id)).toBe(true);
    }
    // noge: hevristika POŠTENO razkrita (omrežje je v testu izklopljeno)
    for (const leg of Object.values(it.legs ?? {})) {
      expect(leg.source).toBe("heuristic");
    }
  });

  test("S2 budget — status proračuna je matematično dosleden (H5)", async () => {
    const it = await generate({ budget: 500 });
    const bv = budgetOf(it);
    expect(bv.status).toBeOneOf(["within", "uncertain", "exceeded"]);
    // Neodvisna rekonstrukcija kanonskega znanega stroška
    let known = 0;
    for (const s of allStops(it)) {
      const c = expectedCanonicalCost(s, 2);
      if (c != null) known += c;
    }
    expect(bv.knownTotal).toBe(known);
    // "within" ZAHTEVA: vse cene znane, ni "od" cen, prikaz znotraj proračuna
    if (bv.status === "within") {
      expect(bv.unknownCostStops).toBe(0);
      expect(bv.fromPriceCount).toBe(0);
      expect(bv.stopsTotal).toBeLessThanOrEqual(500);
      expect(bv.knownTotal).toBeLessThanOrEqual(500);
    }
    if (bv.status === "exceeded") {
      expect(bv.knownTotal).toBeGreaterThan(500);
    }
  });

  test("S3 impossible budget — 20 € / 7 dni: exceeded, BREZ izmišljenih cen", async () => {
    const it = await generate({ budget: 20, days: 7 });
    const bv = budgetOf(it);
    expect(bv.status).toBe("exceeded"); // kanonska spodnja meja je čez 20 €
    expect(bv.knownTotal).toBeGreaterThan(20);
    // NIČEN postanek nima izmišljene "cenovno ugodne" cene:
    // vsak T1 postanek = uredniški kanon (costPerPerson × groupSize),
    // vsak supply postanek = kanonska cena iz dataseta ALI unknown (null).
    for (const s of allStops(it)) {
      const canon = expectedCanonicalCost(s, 2);
      if (canon != null) {
        expect(Number.isFinite(s.estimated_cost)).toBe(true);
        expect(s.estimated_cost).toBe(canon);
      } else {
        // unknown → NaN serializiran kot null (NI 0, NI klientova cifra)
        expect(Number.isFinite(s.estimated_cost)).toBe(false);
      }
    }
    assertRealism(it);
  });

  test("S4 one FIXED — KT 411 točno 1× s kanonsko ceno (per_transfer, NE ×2)", async () => {
    const it = await generate({
      selectedProviderProducts: [ktSelection("411", KT_411_PRICE)],
    });
    const stops = stopsWith(it, "kiwitaxi:411");
    expect(stops.length).toBe(1); // neničljiv, enkraten
    expect(stops[0].estimated_cost).toBe(KT_411_PRICE); // 77, ne 154 (2 osebi)
    expect(supplyOf(it).validated).toBeGreaterThanOrEqual(1);
    expect(budgetOf(it).knownTotal).toBeGreaterThanOrEqual(KT_411_PRICE);
    assertRealism(it);
  });

  test("S5 two FIXED — oba transferja točno 1× z lastnima kanonskima cenama", async () => {
    const it = await generate({
      selectedProviderProducts: [
        ktSelection("411", KT_411_PRICE),
        ktSelection("258775", KT_258775_PRICE),
      ],
    });
    const a = stopsWith(it, "kiwitaxi:411");
    const b = stopsWith(it, "kiwitaxi:258775");
    expect(a.length).toBe(1);
    expect(b.length).toBe(1);
    expect(a[0].estimated_cost).toBe(KT_411_PRICE);
    expect(b[0].estimated_cost).toBe(KT_258775_PRICE);
    expect(budgetOf(it).knownTotal).toBeGreaterThanOrEqual(
      KT_411_PRICE + KT_258775_PRICE
    );
    assertRealism(it);
  });

  test("S6 refine — hitra akcija ohrani FIXED s kanonsko ceno", async () => {
    const selection = [ktSelection("411", KT_411_PRICE)];
    const current = await generate({
      selectedProviderProducts: selection,
    });
    expect(stopsWith(current, "kiwitaxi:411").length).toBe(1);

    const res = await POST_REFINE(
      jsonPost("/api/itinerary/refine", {
        itinerary: current,
        instruction: "Manj vožnje prosim",
        action: "less_driving",
        day: 1,
        formData: {
          budget: 500,
          days: 3,
          interests: ["narava", "mesta"],
          season: "summer",
          groupSize: 2,
          language: "sl",
          selectedProviderProducts: selection,
        },
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      itinerary: Itinerary;
      source: string;
      applied?: boolean;
    };
    expect(body.applied).toBe(true); // deterministična hitra akcija se je izvedla
    const stops = stopsWith(body.itinerary, "kiwitaxi:411");
    expect(stops.length).toBe(1); // FIXED preživi refinement
    expect(stops[0].estimated_cost).toBe(KT_411_PRICE); // kanon preživi
    assertRealism(body.itinerary);
  });

  test("S7 tampered price — klientova KT €1 se NIKOLI ne prikaže (kanon €77)", async () => {
    const it = await generate({
      selectedProviderProducts: [ktSelection("411", 1)], // napad: 1 € namesto 77
    });
    const stops = stopsWith(it, "kiwitaxi:411");
    expect(stops.length).toBe(1);
    expect(stops[0].estimated_cost).toBe(KT_411_PRICE); // strežni dataset zmaga
    expect(budgetOf(it).knownTotal).toBeGreaterThanOrEqual(KT_411_PRICE);
    // klientova cena ni vplačala v prikazani seštevek kot 1 €
    const tampered = allStops(it).filter(
      (s) => s.destination_id === "kiwitaxi:411" && s.estimated_cost === 1
    );
    expect(tampered.length).toBe(0);
  });

  test("S8 fake provider — evilcorp zavrnjen, fabrikantrt KT id zavrnjen", async () => {
    const it = await generate({
      selectedProviderProducts: [
        {
          provider: "evilcorp",
          providerProductId: "123",
          type: "tour",
          title: "Evil Corp Fake Tour",
          lat: 46.0,
          lng: 14.5,
          price: { amount: 5, currency: "EUR", unit: "per_person" },
          source: "supply-map",
          selectionState: "fixed",
        },
        ktSelection("424242", 99), // KT id, ki GA NI v datasetu (fail-closed)
      ],
    });
    // whitelist providerjev: evilcorp ni niti sanitiziran skozi
    expect(stopsWith(it, "evilcorp:123").length).toBe(0);
    // KT dataset = popoln inventar: 424242 ne obstaja → ZAVRŽEN
    expect(stopsWith(it, "kiwitaxi:424242").length).toBe(0);
    // nič od napada ni v kanonskem strošku
    for (const s of allStops(it)) {
      expect(s.estimated_cost).not.toBe(5);
      expect(s.estimated_cost).not.toBe(99);
    }
    // oba napada sta padla ŽE na strežniški plasti (sanitize/verify) →
    // v načrtu ni NOGEGA supply postanka (0 izmišljenih, 0 unknown ostankov)
    expect(supplyOf(it).supplyStops).toBe(0);
  });

  test("S9 provider unavailable — popolna omrežna izključitev: brez fake podatkov", async () => {
    // VSI remote providerji so padli (AI, OSRM, Open-Meteo, Overpass — fetch
    // zavrača). Lokalni KT dataset + T1 ostajata funkcionalna.
    const it = await generate({
      selectedProviderProducts: [ktSelection("411", KT_411_PRICE)],
    });
    expect(it.source).toBe("fallback"); // iskrena oznaka, ne lažni "ai"
    // KT (lokalni dataset) še vedno kanonsko deluje:
    const stops = stopsWith(it, "kiwitaxi:411");
    expect(stops.length).toBe(1);
    expect(stops[0].estimated_cost).toBe(KT_411_PRICE);
    // NIČEN OSM/viator/gyg postanek ni nastal iz padlega vira:
    const fabricated = allStops(it).filter((s) =>
      /^(osm|viator|getyourguide):/.test(s.destination_id ?? "")
    );
    expect(fabricated.length).toBe(0);
    // OSRM padel → noge so hevristika, POŠTENO razkrita (vir "heuristic")
    for (const leg of Object.values(it.legs ?? {})) {
      expect(leg.source).toBe("heuristic");
    }
    assertRealism(it); // načrt je kljub izpadiom izvedljiv in validiran
  });

  test("S10 SL/EN parity — isti kanonski podatkovni model v obeh jezikih", async () => {
    const shared = {
      budget: 500,
      days: 3,
      interests: ["narava", "mesta"],
      season: "summer",
      groupSize: 2,
      selectedProviderProducts: [ktSelection("411", KT_411_PRICE)],
    };
    const sl = await generate({ ...shared, language: "sl" });
    const en = await generate({ ...shared, language: "en" });
    expect(sl.days.length).toBe(en.days.length);
    // ISTA izbira postankov (ID-ji, vrstni red) v obeh jezikih
    const ids = (it: Itinerary) =>
      allStops(it).map((s) => s.destination_id).join("|");
    expect(ids(sl)).toBe(ids(en));
    // ISTE cene (kanon je jezikovno neodvisen)
    const costs = (it: Itinerary) =>
      allStops(it).map((s) => s.estimated_cost).join("|");
    expect(costs(sl)).toBe(costs(en));
    // ISTA validacija (supply/budget števci — neodvisni od jezika)
    expect(sl.supplyValidation).toEqual(en.supplyValidation);
    expect(sl.budgetValidation).toEqual(en.budgetValidation);
    // JEZIK se dejansko razlikuje (prevodi so realni, ne SL pod EN masko)
    expect(sl.rationale).not.toBe(en.rationale);
    expect(JSON.stringify(sl.packingList)).not.toBe(
      JSON.stringify(en.packingList)
    );
  });

  test("S11 echo tamper — zastarel klientov načrt se strežniško očisti (P0 fix)", async () => {
    // 1) pravi načrt s FIXED KT 411
    const selection = [ktSelection("411", KT_411_PRICE)];
    const current = await generate({
      selectedProviderProducts: selection,
    });
    // 2) klient POSEGA v shranjeni načrt (napad T10/H1/V1 v enem):
    const day1 = current.days[0];
    day1.locations = [
      ...(day1.locations ?? []).map((l) =>
        l.destination_id === "kiwitaxi:411"
          ? { ...l, estimated_cost: 1 } // €1 namesto kanon €77
          : l
      ),
      {
        destination_id: "viator:99999", // fabrikantrt provider id
        destination_name: "Fake Viator Tour",
        time_slot: "12:00-16:00", // prekriva se z 09:00-13:00 postankom
        duration: 2,
        estimated_cost: 500, // klientova izmišljena cena
        notes: "fabricated",
      },
      {
        destination_id: "kiwitaxi:424242", // KT id, ki ga NI v datasetu
        destination_name: "Fabricated KT",
        time_slot: "19:00-20:00",
        duration: 1,
        estimated_cost: 99,
        notes: "fabricated",
      },
    ];
    // 3) refine BREZ hitre akcije + AI odpoved (fetch izklopljen) → ECHO veja
    const res = await POST_REFINE(
      jsonPost("/api/itinerary/refine", {
        itinerary: current,
        instruction: "Izboljšaj načrt",
        formData: {
          budget: 500,
          days: 3,
          interests: ["narava", "mesta"],
          season: "summer",
          groupSize: 2,
          language: "sl",
          selectedProviderProducts: selection,
        },
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { itinerary: Itinerary; source: string };
    expect(body.source).toBe("fallback"); // iskrena oznaka echo poti
    const out = body.itinerary;
    // KT €1 → kanon €77 (currentStops avtoriteta = dataset)
    const kt = stopsWith(out, "kiwitaxi:411");
    expect(kt.length).toBe(1);
    expect(kt[0].estimated_cost).toBe(KT_411_PRICE);
    // fabrikantrt KT id → ODSTRANJEN (dataset = popoln inventar, fail-closed)
    expect(stopsWith(out, "kiwitaxi:424242").length).toBe(0);
    // viator:99999 → obstoj je uporabnikova želja, cena pa NI klientova:
    const via = stopsWith(out, "viator:99999");
    expect(via.length).toBe(1); // Task 48 invarianta: ne brišemo uporabnikovih postankov
    expect(Number.isFinite(via[0].estimated_cost)).toBe(false); // unknown ≠ 500
    // budget: 500 € in 99 € se NISTA prištevala; 77 € JE
    expect(budgetOf(out).knownTotal).toBeGreaterThanOrEqual(KT_411_PRICE);
    const stopCosts = allStops(out)
      .map((s) => s.estimated_cost)
      .filter((c) => Number.isFinite(c)) as number[];
    expect(stopCosts.includes(500)).toBe(false);
    expect(stopCosts.includes(99)).toBe(false);
    // prekrivanje 12:00-16:00 po 09:00-13:00 → repair poravna (brez prekrivanj)
    for (const day of out.days) {
      const parsed = (day.locations ?? [])
        .map((l) => parseSlot(l.time_slot))
        .filter(Boolean) as { start: number; end: number }[];
      const sorted = [...parsed].sort((a, b) => a.start - b.start);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].end);
      }
    }
    // sveža geo validacija (ne klientova zastarela)
    expect(out.geoValidation).toBeDefined();
    expect((out.geoValidation as NonNullable<Itinerary["geoValidation"]>).worst).toBeOneOf(["ok", "warn", "error"]);
  });

  test("S12 duplicate FIXED — isti produkt dvakrat v izbiri → dedupe na 1", async () => {
    const it = await generate({
      selectedProviderProducts: [
        ktSelection("411", KT_411_PRICE),
        ktSelection("411", KT_411_PRICE), // poskus podvojitve
      ],
    });
    const stops = stopsWith(it, "kiwitaxi:411");
    expect(stops.length).toBe(1); // natanko 1× (T4 dedupe)
    expect(stops[0].estimated_cost).toBe(KT_411_PRICE); // in ne 2× kanon
    // EXAKTNA neodvisna rekonstrukcija: kanon prispeva TOČNO 1× (ne 2×)
    let known = 0;
    for (const s of allStops(it)) {
      const c = expectedCanonicalCost(s, 2);
      if (c != null) known += c;
    }
    expect(budgetOf(it).knownTotal).toBe(known);
    expect(known).toBeLessThan(KT_411_PRICE * 2 + 300); // sanity: nima dvojnega prispevka
  });
});
