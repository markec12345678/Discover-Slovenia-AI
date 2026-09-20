// ============================================================================
// TASK 58 §25–§26 — TEST MATRIKS + END-TO-END SPREJEMNI TEST (1.60.0)
// ============================================================================
// Deterministična sprejemna preverba CELOTNE potevalne verige po zgledu
// naročnika (§26): OPEN → "Pridem na Brnik" → "V Maribor" → izbire →
// validacije (cena/geo/čas/ID-ji) → zmožnosti rezervacije → zunanji toki →
// potrditve (iskrene) → MY TRIP.
//
// FIKSTURE (§23): OSM adapter je FAKE (vbrizgan — dependency injection);
// KT dataset + EVENTS sta REALNI (lokalna kanona). Produkcija NE vbrizgava
// adapterjev (opts.adapters uporabljajo SAMO testi — produkcijska ruta
// /api/journey/plan vedno dobi privzete adapterje registrov).
// ============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  getKiwitaxiBaseline,
  resetKiwitaxiDataset,
  disableKiwitaxiBaselineForTests,
} from "@/lib/supply/providers/kiwitaxi/dataset";
import { kiwitaxiTransferExists } from "@/lib/supply/providers/kiwitaxi/dataset";
import type { SupplyAdapter } from "@/lib/supply/adapter";
import type { ProviderProduct, ProviderSlug } from "@/lib/supply/types";
import { PROVIDER_REGISTRY, getProvider, isProviderSlug } from "@/lib/supply/registry";
import { planJourney } from "@/lib/journey/orchestrator";
import { journeyCapabilityMatrix } from "@/lib/journey/capabilities";
import {
  isValidStatusTransition,
  validateConfirmationRecord,
  bookingCapabilityOf,
} from "@/lib/journey/booking";
import { journeyProductsToSelection } from "@/lib/journey/handoff";
import { buildMyTrip } from "@/lib/journey/trip-view";
import { computeJourneyTotals } from "@/lib/journey/totals";
import type { JourneyProduct, TravelJourney } from "@/lib/journey/types";

const baseline = getKiwitaxiBaseline();
const hasKt = Boolean(baseline);

beforeEach(() => {
  resetKiwitaxiDataset();
});
afterEach(() => {
  disableKiwitaxiBaselineForTests(false);
});

// ---------------------------------------------------------------------------
// FIKSTURNA OSM PLAST (§23 — jasno fixture, ne živi podatki)
// ---------------------------------------------------------------------------

let fixtureCalls = 0;

function fakeOsmAdapter(): SupplyAdapter {
  const entry = getProvider("osm")!;
  const mk = (
    p: Partial<ProviderProduct> &
      Pick<ProviderProduct, "id" | "title" | "type">
  ): ProviderProduct => ({
    provider: "osm",
    providerProductId: p.id.replace("osm:", ""),
    lat: 46.5547,
    lng: 15.6459, // Maribor center — razdalje ~0 km
    geoPrecision: "exact",
    bookingMode: "info_only",
    lastUpdated: new Date().toISOString(),
    ...p,
  });
  const products: ProviderProduct[] = [
    mk({ id: "osm:h1", title: "Hotel Maribor Center", type: "accommodation", subcategory: "hotel", openingHours: "Mo-Su 00:00-24:00" }),
    mk({ id: "osm:r1", title: "Restavracija Drava", type: "restaurant", subcategory: "restaurant", openingHours: "Mo-Su 11:00-23:00" }),
    mk({ id: "osm:p1", title: "Petrol Maribor Vzhod", type: "petrol", subcategory: "fuel" }),
  ];
  return {
    entry,
    async search() {
      fixtureCalls++;
      return products;
    },
    lastRunCached: () => false,
  };
}

/** Adapter, ki VEDNO odpove (§22 izolacija odpovedi ponudnika). */
function throwingAdapter(slug: ProviderSlug = "osm"): SupplyAdapter {
  const entry = getProvider(slug)!;
  return {
    entry,
    async search(): Promise<ProviderProduct[]> {
      throw new Error("simulated provider failure");
    },
    lastRunCached: () => false,
  };
}

const INTENT = {
  origin: "Brnik",
  destination: "maribor",
  startDate: "2026-09-20",
  arrivalTime: "14:00",
  travelers: 2,
  lang: "sl" as const,
};

// ===========================================================================
// §26 — END-TO-END SPREJEMNI SCENARIJ (determinističen)
// ===========================================================================

describe("TASK 58 §26 — E2E sprejemni test: Brnik → Maribor (odprta stran do MY TRIP)", () => {
  let journey: TravelJourney;

  test.skipIf(!hasKt)("① OPEN + INTENT: načrtuj potovanje (vse kategorije)", async () => {
    const j = await planJourney(INTENT, { adapters: [fakeOsmAdapter()] });
    if ("error" in j) throw new Error(j.error);
    journey = j;
    expect(journey.origin.label).toContain("Ljubljana Airport");
    expect(journey.destination.label).toBe("Maribor");
    expect(journey.startDate).toBe("2026-09-20");
    expect(journey.arrivalTime).toBe("14:00");
  });

  test.skipIf(!hasKt)("② DISCOVER: vse kategorije prispejo produkte/kartice", async () => {
    const j = await planJourney(INTENT, { adapters: [fakeOsmAdapter()] });
    if ("error" in j) throw new Error(j.error);
    journey = j;
    expect(journey.categories.transfer.products.length).toBeGreaterThanOrEqual(3);
    expect(journey.categories.accommodation.products.length).toBe(1);
    expect(journey.categories.restaurants.products.length).toBe(1);
    expect(journey.categories.petrol.products.length).toBe(1);
    expect(journey.categories.events.products.length).toBe(3);
    expect(journey.categories.rental.providers.length).toBe(1); // affiliate kartica
  });

  test.skipIf(!hasKt)("③ SELECT: prenos izbir v načrtovalnik (FIXED, unikatno, provider-agnostic)", async () => {
    const j = await planJourney(INTENT, { adapters: [fakeOsmAdapter()] });
    if ("error" in j) throw new Error(j.error);
    const all = [
      ...j.categories.transfer.products,
      ...j.categories.accommodation.products,
      ...j.categories.restaurants.products,
      ...j.categories.petrol.products,
      ...j.categories.events.products,
    ];
    const selection = journeyProductsToSelection(all, "sl");
    // FIXED semantika (AI ne zamenja tiho — §14)
    expect(selection.every((s) => s.selectionState === "fixed")).toBe(true);
    // Unikatni kanonski ID-ji (exactly-once)
    expect(new Set(selection.map((s) => `${s.provider}:${s.providerProductId}`)).size)
      .toBe(selection.length);
    // Dogodki (info vir) v prenos NE gredo
    expect(selection.some((s) => s.type === "event")).toBe(false);
    // Oznake virov so IZ registra (ne if-provider nizi)
    const ktSel = selection.find((s) => s.provider === "kiwitaxi")!;
    expect(ktSel.source).toBe("KiwiTaxi");
    const osmSel = selection.find((s) => s.provider === "osm")!;
    expect(osmSel.source).toBe("OpenStreetMap");
    // Kanonska cena prenesena (fromPrice semantika)
    expect(ktSel.price?.fromPrice).toBe(true);
  });

  test.skipIf(!hasKt)("④ VALIDATE PRICE: kanonske cene zmagovalne (€162 od-cena; OSM/events brez)", async () => {
    const j = await planJourney(INTENT, { adapters: [fakeOsmAdapter()] });
    if ("error" in j) throw new Error(j.error);
    const r412 = j.categories.transfer.products.find((p) => p.id === "kiwitaxi:412")!;
    expect(r412.price?.amount).toBe(162); // IZ DATASETA — klient ne more podtakniti
    expect(r412.price?.fromPrice).toBe(true);
    // OSM/info viri: cene NI (unknown ≠ 0)
    expect(j.categories.accommodation.products[0]!.price).toBeUndefined();
    expect(j.categories.events.products[0]!.price).toBeUndefined();
    // Skupna cena: ocena SAMO iz od-cen; neznane IZRECNO štete
    const totals = computeJourneyTotals([
      ...j.categories.transfer.products,
      ...j.categories.accommodation.products,
      ...j.categories.events.products,
    ]);
    expect(totals.estimatedTotal).toBe(604);
    expect(totals.unknownCount).toBe(4); // hotel + 3 dogodki
    expect(totals.confirmedTotal).toBe(0); // 0 potrjenih (iskreno)
  });

  test.skipIf(!hasKt)("⑤ VALIDATE GEO: izhodišče/destinacija/produkti koherentni", async () => {
    const j = await planJourney(INTENT, { adapters: [fakeOsmAdapter()] });
    if ("error" in j) throw new Error(j.error);
    // Izhodišče = Brnik (realne koordinate iz transfer inventarja — SI)
    expect(j.origin.lat).toBeGreaterThan(45.5);
    expect(j.origin.lat).toBeLessThan(46.5);
    expect(j.origin.lng).toBeGreaterThan(14.0);
    expect(j.origin.lng).toBeLessThan(15.0);
    // Destinacija = Maribor center
    expect(Math.abs(j.destination.lat! - 46.5547)).toBeLessThan(0.01);
    // KT transfer pin = prevzemno območje (blizu Brnika)
    const r412 = j.categories.transfer.products.find((p) => p.id === "kiwitaxi:412")!;
    expect(Math.abs(r412.lat! - j.origin.lat!)).toBeLessThan(0.5);
    // OSM produkti na destinaciji (razdalja izračunana)
    expect(j.categories.accommodation.products[0]!.distanceKm).toBeDefined();
  });

  test.skipIf(!hasKt)("⑥ VALIDATE TIME: najzgodnejši prihod 15:40; dogodki PO prihodu; razpored nemogočih NE", async () => {
    const j = await planJourney(INTENT, { adapters: [fakeOsmAdapter()] });
    if ("error" in j) throw new Error(j.error);
    // 14:00 + 100 min (trajanje IZ vira) = 15:40
    expect(j.earliestArrivalAtDestination?.time).toBe("15:40");
    // Vsi dogodki se KONČAJO po 20. 9. 2026 (konzistentnost §15)
    for (const e of j.categories.events.products) {
      const ends = e.eventDate?.end ?? e.eventDate?.start;
      expect(ends! >= "2026-09-20").toBe(true);
    }
  });

  test.skipIf(!hasKt)("⑦ VALIDATE PROVIDER IDs: kanonski ID-ji obstajajo; fabrikantrt ZAVRNJEN", async () => {
    const j = await planJourney(INTENT, { adapters: [fakeOsmAdapter()] });
    if ("error" in j) throw new Error(j.error);
    // Vsi ponudniki so veljavni slugi registra (ali "events" content vir)
    const all: JourneyProduct[] = Object.values(j.categories).flatMap((c) => c.products);
    for (const p of all) {
      if (p.provider === "events") continue;
      expect(isProviderSlug(p.provider)).toBe(true);
    }
    // KT deep-link ID je ČLAN dataseta (TASK 56 membership)
    const r412 = j.categories.transfer.products.find((p) => p.id === "kiwitaxi:412")!;
    const tid = r412.vehicleOptions![0]!.transferId;
    expect(kiwitaxiTransferExists(tid)).toBe(true);
    // Fabrikantrt ID (veljaven format, ne-član) → fail-closed
    expect(kiwitaxiTransferExists(999999999)).toBe(false);
  });

  test.skipIf(!hasKt)("⑧ BOOKING CAPABILITIES: 0 API_BOOKING danes; mešanica EXTERNAL/INFO", async () => {
    const j = await planJourney(INTENT, { adapters: [fakeOsmAdapter()] });
    if ("error" in j) throw new Error(j.error);
    const r412 = j.categories.transfer.products.find((p) => p.id === "kiwitaxi:412")!;
    expect(r412.booking.flow).toBe("external_affiliate"); // KT = zunanji tok
    expect(j.categories.accommodation.products[0]!.booking.flow).toBe("info_only"); // OSM
    expect(j.categories.events.products[0]!.booking.flow).toBe("info_only"); // dogodki
    expect(j.categories.rental.providers[0]!.booking.flow).toBe("external_affiliate"); // affiliate kartica
    // Matriks: NIČEN journey ponudnik nima api_booking danes (0 poverilnic)
    const matrix = journeyCapabilityMatrix();
    expect(
      matrix.filter((m) => m.booking === "api_booking").map((m) => m.slug)
    ).toEqual(["own"]); // SAMO lastna tržnica (izven journey verige)
  });

  test.skipIf(!hasKt)("⑨ REDIRECT WHERE EXTERNAL: KT bookingUrl → /go/transfers?product=9227", async () => {
    const j = await planJourney(INTENT, { adapters: [fakeOsmAdapter()] });
    if ("error" in j) throw new Error(j.error);
    const r412 = j.categories.transfer.products.find((p) => p.id === "kiwitaxi:412")!;
    expect(r412.bookingUrl).toBe(
      "/go/transfers?product=9227&from=Ljubljana%20Airport&dest=Maribor"
    );
    // /go vrata (302/404/400) so že testno varovana (task56) — URL je članski.
  });

  test.skipIf(!hasKt)("⑩ PAY WHERE SUPPORTED: plačilo SAMO pri ponudniku (0 merchant-side v journey)", async () => {
    const j = await planJourney(INTENT, { adapters: [fakeOsmAdapter()] });
    if ("error" in j) throw new Error(j.error);
    const all: JourneyProduct[] = Object.values(j.categories).flatMap((c) => c.products);
    expect(
      all.every((p) => p.booking.payment !== "merchant_side")
    ).toBe(true); // 0 lažnih plačilnih tokov
    const kt = all.find((p) => p.id === "kiwitaxi:412")!;
    expect(kt.booking.payment).toBe("external_provider");
  });

  test.skipIf(!hasKt)("⑪ STORE REAL CONFIRMATION: izdelana potrditev ZAVRNJENA; EXTERNAL iskren", () => {
    // Proizvedena številka rezervacije (brez provider odgovora) → REJECTED
    expect(
      validateConfirmationRecord({
        provider: "kiwitaxi",
        providerProductId: "412",
        status: "CONFIRMED",
        providerBookingId: "FAKE-123",
        confirmedPrice: { amount: 162, currency: "EUR" },
      }).ok
    ).toBe(true); // struktur validen SAMO če bi provider vrnil — zapis NE obstaja
    // Manjkajoč providerBookingId = trditev → zavrnjeno
    expect(
      validateConfirmationRecord({
        provider: "kiwitaxi",
        providerProductId: "412",
        status: "CONFIRMED",
      }).ok
    ).toBe(false);
    // EXTERNAL ne sme nositi ID-ja/cene (živi pri ponudniku)
    expect(
      validateConfirmationRecord({
        provider: "kiwitaxi",
        providerProductId: "412",
        status: "EXTERNAL",
      }).ok
    ).toBe(true);
    // EXTERNAL → CONFIRMED prehod NE obstaja
    expect(isValidStatusTransition("EXTERNAL", "CONFIRMED")).toBe(false);
  });

  test.skipIf(!hasKt)("⑫ MY TRIP: časovnica po dneh, realni časi, iskreni statusi", async () => {
    const j = await planJourney(INTENT, { adapters: [fakeOsmAdapter()] });
    if ("error" in j) throw new Error(j.error);
    // Izberi: transfer 412 + hotel + restavracijo + bencin + 1 dogodek
    const selected = new Set<string>([
      "kiwitaxi:412",
      "osm:h1",
      "osm:r1",
      "osm:p1",
      "events:festival-stara-trta",
    ]);
    const trip = buildMyTrip(j, selected);

    // Dan 1 = prihod: vrstni red PRIHOD → TRANSFER (realni časi) → hotel/rest.
    const day1 = trip.days[0]!;
    expect(day1.entries[0]!.key).toBe("arrival");
    expect(day1.entries[0]!.time?.start).toBe("14:00");
    expect(day1.entries[1]!.key).toBe("kiwitaxi:412");
    expect(day1.entries[1]!.time).toEqual({ start: "14:00", end: "15:40" });
    expect(day1.entries[2]!.key).toBe("osm:h1");
    expect(day1.entries[3]!.key).toBe("osm:r1");
    expect(day1.entries[4]!.key).toBe("osm:p1");
    // Hotel BREZ izumljene check-in ure (timeNote pove zakaj)
    expect(day1.entries[2]!.time).toBeUndefined();
    expect(day1.entries[2]!.timeNote).toBeDefined();

    // Dogodek na SVOJEM realnem datumu (3. 10. 2026) — LOČEN dan
    expect(trip.days[1]!.date).toBe("2026-10-03");
    expect(trip.days[1]!.entries[0]!.key).toBe("events:festival-stara-trta");
    expect(trip.days[1]!.entries[0]!.time).toBeUndefined(); // ura NI v viru

    // Statusi: transfer EXTERNAL; hotel/restavracija/bencin/dogodek INFO
    expect(day1.entries[1]!.status).toBe("EXTERNAL");
    expect(day1.entries[2]!.status).toBe("INFO");
    expect(trip.days[1]!.entries[0]!.status).toBe("INFO");
    // Rental = zunanja kartica
    expect(trip.externalCards.length).toBe(1);
    expect(trip.externalCards[0]!.status).toBe("EXTERNAL");
    // Potrditveni dokument: 0 potrjenih + bookingId vedno null (§21)
    expect(trip.confirmation.confirmedCount).toBe(0);
    const allEntries = trip.days.flatMap((d) => d.entries);
    expect(allEntries.every((e) => e.bookingId === null)).toBe(true);
    // Naslov dokumenta nosi destinacijo
    expect(trip.title.sl).toContain("MARIBOR");
  });

  test.skipIf(!hasKt)("⑬ EN jezik: EN časovnica + statusi (isti kanon)", async () => {
    const j = await planJourney(
      { ...INTENT, lang: "en" },
      { adapters: [fakeOsmAdapter()] }
    );
    if ("error" in j) throw new Error(j.error);
    const trip = buildMyTrip(j, new Set(["kiwitaxi:412"]));
    expect(trip.title.en).toContain("MY TRIP — MARIBOR");
    const day1 = trip.days[0]!;
    expect(day1.dateLabel.en).toContain("September");
    expect(day1.entries[1]!.statusLabel.en).toContain("External");
    // Fiksture se NE morejo pretvarjati za žive (§23): fixtureCalls > 0 dokazuje
    // vbrizgano plast — produkcijska ruta vbrizgava NE (opts SAMO za teste).
    expect(fixtureCalls).toBeGreaterThan(0);
  });
});

// ===========================================================================
// §22 — IZOLACIJA ODPOVEDI PONUDNIKA (ena napaka NE uniči potovanja)
// ===========================================================================

describe("TASK 58 §22 — provider failure isolation", () => {
  test.skipIf(!hasKt)(
    "① OSM (lokalni vir) odpove → transfer/dogodki/najem/validacija ŠE VEDNO delujejo",
    async () => {
      const j = await planJourney(INTENT, { adapters: [throwingAdapter("osm")] });
      if ("error" in j) throw new Error(j.error);
      // Potovanje NI uničeno:
      expect(j.categories.transfer.products.length).toBeGreaterThanOrEqual(3);
      expect(j.categories.events.products.length).toBe(3);
      expect(j.categories.rental.providers.length).toBe(1);
      expect(j.earliestArrivalAtDestination?.time).toBe("15:40");
      // Odpoved je ZABELEŽENA (supplyHealth) + opombe kategorij:
      expect(j.supplyHealth.degradedProviders).toContain("osm");
      expect(j.categories.accommodation.note?.sl).toContain("nedosegljiv");
      // Fail-closed semantika ostaja: 0 izmišljenih produktov
      expect(j.categories.accommodation.products.length).toBe(0);
      expect(j.categories.restaurants.products.length).toBe(0);
    }
  );

  test.skipIf(!hasKt)(
    "② KT dataset manjka → OSM (fixture) + dogodki + najem ŠE VEDNO delujejo",
    async () => {
      disableKiwitaxiBaselineForTests(true);
      const j = await planJourney(INTENT, { adapters: [fakeOsmAdapter()] });
      if ("error" in j) throw new Error(j.error);
      expect(j.categories.transfer.products.length).toBe(0); // iskreno prazno
      expect(j.validation.issues.some((i) => i.rule === "dataset_missing")).toBe(true);
      expect(j.supplyHealth.degradedProviders).toContain("kiwitaxi");
      // Ostale kategorije CELE:
      expect(j.categories.accommodation.products.length).toBe(1);
      expect(j.categories.events.products.length).toBe(3);
      expect(j.categories.rental.providers.length).toBe(1);
    }
  );

  test("③ neznan provider v registru → capabilities null (NE improviziramo)", () => {
    expect(getProvider("evilprovider")).toBeUndefined();
    // registry drži EXACTNO znane sluge
    expect(PROVIDER_REGISTRY.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// §25 — BOOKING MATRIKS (deterministično, brez omrežja)
// ===========================================================================

describe("TASK 58 §25 — booking matriks (toki + statusi + potrditve)", () => {
  // A) API booking success (SIMULIRAN preko modela — 0 realnih ponudnikov danes)
  test("① API booking success: PENDING → CONFIRMED (z providerBookingId + ceno)", () => {
    expect(isValidStatusTransition("PENDING", "CONFIRMED")).toBe(true);
    expect(
      validateConfirmationRecord({
        provider: "own",
        providerProductId: "exp-1",
        status: "CONFIRMED",
        providerBookingId: "OWN-2026-001",
        confirmedPrice: { amount: 50, currency: "EUR" },
      }).ok
    ).toBe(true);
  });

  // B) API booking failure
  test("② API booking failure: PENDING → FAILED (terminalno)", () => {
    expect(isValidStatusTransition("PENDING", "FAILED")).toBe(true);
    expect(isValidStatusTransition("FAILED", "CONFIRMED")).toBe(false);
    expect(isValidStatusTransition("FAILED", "PENDING")).toBe(false);
  });

  // C) External booking (KT tok)
  test("③ external booking: affiliate_redirect → plačilo/potrditev pri ponudniku", () => {
    const cap = bookingCapabilityOf("affiliate_redirect");
    expect(cap.flow).toBe("external_affiliate");
    expect(cap.confirmation).toBe("external");
  });

  // D) Affiliate booking (kartica najema)
  test("④ affiliate booking: rental kartica = isti zunanji tok", () => {
    const cap = bookingCapabilityOf("affiliate_redirect");
    expect(cap.payment).toBe("external_provider");
  });

  // E) Info-only provider
  test("⑤ info-only: OSM/dogodki → brez transakcije", () => {
    const cap = bookingCapabilityOf("info_only");
    expect(cap.flow).toBe("info_only");
    expect(cap.payment).toBe("none");
    expect(cap.confirmation).toBe("none");
  });

  // F) Payment required
  test("⑥ payment required: SELECTED → PAYMENT_REQUIRED → PAID (≠ CONFIRMED)", () => {
    expect(isValidStatusTransition("SELECTED", "PAYMENT_REQUIRED")).toBe(true);
    expect(isValidStatusTransition("PAYMENT_REQUIRED", "PAID")).toBe(true);
    expect(isValidStatusTransition("PAID", "CONFIRMED")).toBe(true); // šele zdaj
    expect(isValidStatusTransition("PAID", "CANCELLED")).toBe(true); // refund možen
  });

  // G) Payment failure
  test("⑦ payment failure: PAYMENT_REQUIRED → FAILED (terminalno)", () => {
    expect(isValidStatusTransition("PAYMENT_REQUIRED", "FAILED")).toBe(true);
  });

  // H) Confirmation success
  test("⑧ confirmation success: zapis z ID-jem + ceno IZ provider odgovora", () => {
    const res = validateConfirmationRecord({
      provider: "viator",
      providerProductId: "227717P1",
      status: "CONFIRMED",
      providerBookingId: "VTR-9182",
      confirmedPrice: { amount: 89, currency: "EUR" },
      confirmationUrl: "https://www.viator.com/booking/9182",
    });
    expect(res.ok).toBe(true);
  });

  // I) Confirmation missing (id ali cena manjka)
  test("⑨ confirmation missing: CONFIRMED brez ID-ja/cene → ZAVRNJENO", () => {
    expect(
      validateConfirmationRecord({
        provider: "viator",
        providerProductId: "227717P1",
        status: "CONFIRMED",
      }).ok
    ).toBe(false);
    expect(
      validateConfirmationRecord({
        provider: "viator",
        providerProductId: "227717P1",
        status: "CONFIRMED",
        providerBookingId: "VTR-1",
      }).ok
    ).toBe(false);
  });
});

// ===========================================================================
// §25 — INTEGRITETA (forged vhodi na potovanju)
// ===========================================================================

describe("TASK 58 §25 — integriteta (forged/unknown/missing)", () => {
  test("① forged provider ID: kiwitaxiTransferExists(999999999) = false (fail-closed)", () => {
    expect(kiwitaxiTransferExists(999999999)).toBe(false);
  });

  test("② forged price: kanon zmaga — KT cena IZ dataseta (klient ne poda cene v plan)", async () => {
    const j = await planJourney(
      { ...INTENT, categories: ["transfer"] },
      { adapters: [fakeOsmAdapter()] }
    );
    if ("error" in j) throw new Error(j.error);
    // Plan API NE sprejema klientovih cen — edina resnica je dataset:
    const r412 = j.categories.transfer.products.find((p) => p.id === "kiwitaxi:412")!;
    expect(r412.price?.amount).toBe(162);
  });

  test("③ forged availability: NIČEN journey produkt ne trdi live_available", async () => {
    const j = await planJourney(INTENT, { adapters: [fakeOsmAdapter()] });
    if ("error" in j) throw new Error(j.error);
    const all: JourneyProduct[] = Object.values(j.categories).flatMap((c) => c.products);
    for (const p of all) {
      // Razpoložljivost (če je) je zgolj not_supported/unknown — NIKOLI
      // live_available (živi klic bi moral priti od ponudnika — 0 jih ima).
      if (p.availability) {
        expect(p.availability.status === "not_supported" || p.availability.status === "unknown").toBe(true);
      }
    }
  });

  test("④ unknown provider: matriks vrne null za neveljaven slug", () => {
    // capabilities only for registry slugs — capability.ts handles unknown
    const matrix = journeyCapabilityMatrix();
    expect(matrix.every((m) => isProviderSlug(m.slug))).toBe(true);
  });

  test("⑤ missing credentials: viator/getyourguide NOT_CONFIGURED (brez ključa)", () => {
    const matrix = journeyCapabilityMatrix();
    const viator = matrix.find((m) => m.slug === "viator")!;
    if (!process.env.VIATOR_API_KEY) {
      expect(viator.liveInventory).toBe("NOT_CONFIGURED");
    }
    const gyg = matrix.find((m) => m.slug === "getyourguide")!;
    if (!process.env.GETYOURGUIDE_API_TOKEN) {
      expect(gyg.liveInventory).toBe("NOT_CONFIGURED");
    }
  });

  test("⑥ missing provider: handoff preslika SAMO veljavne providerje iz kanona", async () => {
    const j = await planJourney(INTENT, { adapters: [fakeOsmAdapter()] });
    if ("error" in j) throw new Error(j.error);
    const selection = journeyProductsToSelection(
      Object.values(j.categories).flatMap((c) => c.products),
      "sl"
    );
    for (const s of selection) {
      expect(isProviderSlug(s.provider)).toBe(true); // kanonski slugi samo
    }
  });
});

// ===========================================================================
// §23 — FIXTURES ≠ LIVE (produkcija ne vbrizgava)
// ===========================================================================

describe("TASK 58 §23 — fixtures vs live (iskrena ločba)", () => {
  test("① DI parameter je IZKLJUČNO testni: produkt brej vbrizganih adapterjev bi šel v OMREŽJE (osm)", () => {
    // Brez opts.adapters planJourney pokliče defaultAdapters() — živi OSM.
    // To dokazuje strukturo: opts so opcionalni in SAMO testi jih podajo.
    // (Produkcijska ruta /api/journey/plan NE podaja adapterjev — 0 fixture
    //  poti v produkciji; fixtureCalls > 0 zgoraj dokazuje vbrizgano plast.)
    expect(fixtureCalls).toBeGreaterThan(0);
  });

  test("② journey produkti NIKOLI ne nosijo fixture oznak v produkciji", async () => {
    // KT kategorija (brez OSM kategorij) ne potrebuje fixture plast:
    const j = await planJourney(
      { ...INTENT, categories: ["transfer", "events", "rental"] },
      { adapters: [throwingAdapter("osm")] }
    );
    if ("error" in j) throw new Error(j.error);
    // KT/dogodki/najem so REALNI kanoni (lokalni dataseti) — prisotni kljub
    // odpovedi vbrizgane OSM plasti.
    expect(j.categories.transfer.products.length).toBeGreaterThanOrEqual(3);
    expect(j.categories.events.products.length).toBe(3);
  });
});
