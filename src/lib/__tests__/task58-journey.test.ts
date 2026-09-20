// ============================================================================
// TASK 58 — FULL PROVIDER JOURNEY: TESTI (1.59.0)
// ============================================================================
// Pokrivajo: KT iskanje po ruti (Brnik→Maribor), bencin taksonomijo,
// matriks zmožnosti (izpeljan iz registra), invariante toka rezervacije
// (EXTERNAL ≠ CONFIRMED), statusne barve pinov (nikoli lažna rezervacija),
// skupno ceno (unknown ≠ 0) in ORKESTRATOR (zgled naročnika §6–§12 s
// dependency injection — 0 omrežja v testih).
// ============================================================================

import { beforeEach, describe, expect, test } from "bun:test";
import {
  getKiwitaxiBaseline,
  resetKiwitaxiDataset,
  disableKiwitaxiBaselineForTests,
  searchKiwitaxiRoutes,
} from "@/lib/supply/providers/kiwitaxi/dataset";
import { kiwitaxiTransferExists } from "@/lib/supply/providers/kiwitaxi/dataset";
import { TAXONOMY, isProductType } from "@/lib/supply/taxonomy";
import { osmTagsToProductType } from "@/lib/supply/osm-adapter";
import { getProvider, PROVIDER_REGISTRY } from "@/lib/supply/registry";
import type { SupplyAdapter } from "@/lib/supply/adapter";
import type { ProviderProduct } from "@/lib/supply/types";
import { planJourney, haversineKm } from "@/lib/journey/orchestrator";
import {
  journeyCapabilityMatrix,
  journeyProviderCapabilities,
} from "@/lib/journey/capabilities";
import {
  bookingCapabilityOf,
  isValidStatusTransition,
  isProviderConfirmed,
  validateConfirmationRecord,
  mapStatusReachable,
  impliesReservation,
  defaultMapStatus,
} from "@/lib/journey/booking";
import { computeJourneyTotals, describeTotals } from "@/lib/journey/totals";
import type { JourneyProduct } from "@/lib/journey/types";

const baseline = getKiwitaxiBaseline();
const hasKt = Boolean(baseline);

beforeEach(() => {
  resetKiwitaxiDataset();
});
// afterEach ekvivalent: povrni baseline po testih, ki ga izključijo.
import { afterEach } from "bun:test";

afterEach(() => {
  disableKiwitaxiBaselineForTests(false);
});

// ---------------------------------------------------------------------------
// 1 — KT ISKANJE PO RUTI (from → to; task §7 zgled: Brnik → Maribor)
// ---------------------------------------------------------------------------

describe("TASK 58: searchKiwitaxiRoutes (iskanje po imenih, lokalno)", () => {
  test.skipIf(!hasKt)(
    "① Brnik → Maribor: 3 rute (airport, train station, bus station)",
    () => {
      const routes = searchKiwitaxiRoutes("Brnik", "Maribor")!;
      expect(routes.length).toBeGreaterThanOrEqual(3);
      expect(routes.some((r) => r.fromName === "Ljubljana Airport")).toBe(true);
      expect(routes.every((r) => r.toName.includes("Maribor"))).toBe(true);
    }
  );

  test.skipIf(!hasKt)(
    "② kanonična ruta 412 (Ljubljana Airport → Maribor): €162, 100 min, 7 razredov",
    () => {
      const routes = searchKiwitaxiRoutes("Brnik", "Maribor")!;
      const r412 = routes.find((r) => r.id === 412);
      expect(r412).toBeDefined();
      expect(r412!.minPriceEur).toBe(162);
      expect(r412!.durationMin).toBe(100);
      expect(r412!.classes.length).toBe(7);
      expect(r412!.cheapestTransferId).toBe(9227);
      expect(kiwitaxiTransferExists(9227)).toBe(true); // deep-link član
    }
  );

  test.skipIf(!hasKt)(
    "③ letališče ≠ mesto: „Ljubljana Airport“ NE ujame mesta Ljubljana in obratno",
    () => {
      // „brnik“ → alias „Ljubljana Airport“ — STROGO (ne mesto).
      const fromAirport = searchKiwitaxiRoutes("Brnik", "Maribor")!;
      expect(fromAirport.every((r) => r.fromName === "Ljubljana Airport")).toBe(true);
      // „ljubljana“ (mesto) ujame izhodišča, ki vsebujejo Ljubljana — a NE
      // smevračati „Ljubljana Airport“ kot edino izbiro (mesto je širše).
      const fromCity = searchKiwitaxiRoutes("Ljubljana", "Maribor")!;
      expect(fromCity.length).toBeGreaterThan(fromAirport.length);
    }
  );

  test.skipIf(!hasKt)(
    "④ napačna smer (Maribor → Brnik iz KWIZA): obratna relacija je LOČENA",
    () => {
      const reverse = searchKiwitaxiRoutes("Maribor", "Ljubljana Airport")!;
      // dataset ima obratne rute (Maribor → Ljubljana Airport obstaja kot
      // lastna relacija) — iskanje ne sme mešati smeri.
      expect(reverse.every((r) => r.fromName.includes("Maribor"))).toBe(true);
      expect(reverse.every((r) => r.toName === "Ljubljana Airport")).toBe(true);
    }
  );

  test.skipIf(!hasKt)("⑤ neobstoječa relacija → [] (ne null)", () => {
    expect(searchKiwitaxiRoutes("Nepsretna Vas Xyz", "Maribor")).toEqual([]);
  });

  test.skipIf(!hasKt)("⑥ dataset MANJKA → null (ne [] — klicalnik loči odpoved)", () => {
    disableKiwitaxiBaselineForTests(true);
    expect(searchKiwitaxiRoutes("Brnik", "Maribor")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2 — BENCIN: taksonomija + OSM mapiranje + register (task §11)
// ---------------------------------------------------------------------------

describe("TASK 58: bencinske postaje (razširitev OBSTOJEČEGA lokalnega vira)", () => {
  test("① tip „petrol“ je kanonski produkt s filterjem amenity=fuel", () => {
    expect(isProductType("petrol")).toBe(true);
    expect(TAXONOMY.petrol.osmFilters).toContain("nwr[amenity=fuel]");
    expect(TAXONOMY.petrol.minZoom).toBeGreaterThanOrEqual(12); // gostota
  });

  test("② OSM tag amenity=fuel → tip petrol (adapter preslikava)", () => {
    expect(osmTagsToProductType({ amenity: "fuel", name: "Petrol Maribor" })).toEqual({
      type: "petrol",
      subcategory: "fuel",
    });
  });

  test("③ register osm vključuje petrol (sloj zemljevida deluje brez novega ponudnika)", () => {
    const osm = getProvider("osm");
    expect(osm?.types).toContain("petrol");
    expect(osm?.group).toBe("local"); // NI nov komercialni provider
  });
});

// ---------------------------------------------------------------------------
// 3 — MATRIKS ZMOŽNOSTI (§1/§2 — izpeljan iz registra, brez ročnega duplikata)
// ---------------------------------------------------------------------------

describe("TASK 58: matriks zmožnosti ponudnikov (iz registra)", () => {
  test("① 16 ponudnikov v matriksu (usklajeno s registrom)", () => {
    const matrix = journeyCapabilityMatrix();
    expect(matrix.length).toBe(PROVIDER_REGISTRY.length);
    expect(new Set(matrix.map((m) => m.slug)).size).toBe(matrix.length);
  });

  test("② kiwitaxi: discovery STATIC_CONTENT, booking external_affiliate, plačilo pri ponudniku", () => {
    const kt = journeyProviderCapabilities("kiwitaxi");
    expect(kt?.discovery).toBe("STATIC_CONTENT");
    expect(kt?.booking).toBe("external_affiliate");
    expect(kt?.payment).toBe("external_provider");
    expect(kt?.confirmation).toBe("external");
    expect(kt?.affiliate).toBe(true);
  });

  test("③ osm: discovery LIVE (živi Overpass), booking NONE, plačilo NONE", () => {
    const osm = journeyProviderCapabilities("osm");
    expect(osm?.discovery).toBe("LIVE");
    expect(osm?.booking).toBe("none");
    expect(osm?.payment).toBe("none");
  });

  test("④ discovercars: AFFILIATE_ONLY (affiliate ≠ inventar)", () => {
    const dc = journeyProviderCapabilities("discovercars");
    expect(dc?.discovery).toBe("AFFILIATE_ONLY");
    expect(dc?.liveInventory).toBe("NOT_CONFIGURED");
    expect(dc?.booking).toBe("external_affiliate");
  });

  test("⑤ viator: NOT_CONFIGURED brez ključa (adapter ≠ LIVE — iskrenost)", () => {
    const vi = journeyProviderCapabilities("viator");
    expect(vi).toBeDefined();
    if (!vi) return;
    // V tem okolju NI ključa → živi inventar ni dosegljiv.
    expect(["NOT_CONFIGURED", "CODE_READY"]).toContain(vi.liveInventory);
    if (!process.env.VIATOR_API_KEY) {
      expect(vi.liveInventory).toBe("NOT_CONFIGURED");
    }
  });
});

// ---------------------------------------------------------------------------
// 4 — TOK REZERVACIJE + INVARIANTE POTRDITVE (§17–§19)
// ---------------------------------------------------------------------------

describe("TASK 58: tok rezervacije (bookingMode → potovalni tok)", () => {
  test("① affiliate_redirect → zunanji tok (plačilo/potrditev pri ponudniku)", () => {
    const cap = bookingCapabilityOf("affiliate_redirect");
    expect(cap.flow).toBe("external_affiliate");
    expect(cap.payment).toBe("external_provider");
    expect(cap.confirmation).toBe("external");
  });

  test("② info_only → brez transakcije (NIKOLI fake checkout)", () => {
    const cap = bookingCapabilityOf("info_only");
    expect(cap.flow).toBe("info_only");
    expect(cap.payment).toBe("none");
    expect(cap.confirmation).toBe("none");
  });

  test("③ api_bookable → API tok (arhitektura; 0 ponudnikov danes)", () => {
    const cap = bookingCapabilityOf("api_bookable");
    expect(cap.flow).toBe("api_booking");
    expect(cap.confirmation).toBe("provider_api");
  });
});

describe("TASK 58: invariante potrditve (EXTERNAL NIKOLI ≠ CONFIRMED)", () => {
  test("① EXTERNAL → CONFIRMED je PREPOVEDAN prehod", () => {
    expect(isValidStatusTransition("EXTERNAL", "CONFIRMED")).toBe(false);
    expect(isValidStatusTransition("EXTERNAL", "PAID")).toBe(false);
  });

  test("② EXTERNAL ostaja EXTERNAL/CANCELLED/UNKNOWN (absorptivno stanje)", () => {
    expect(isValidStatusTransition("EXTERNAL", "EXTERNAL")).toBe(true);
    expect(isValidStatusTransition("EXTERNAL", "CANCELLED")).toBe(true);
    expect(isValidStatusTransition("EXTERNAL", "UNKNOWN")).toBe(true);
  });

  test("③ CONFIRMED zahteva providerBookingId + ceno iz providerjevega odgovora", () => {
    expect(
      validateConfirmationRecord({
        provider: "kiwitaxi",
        providerProductId: "412",
        status: "CONFIRMED",
      }).ok
    ).toBe(false); // brez ID-ja = trditev, ne potrditev
    expect(
      validateConfirmationRecord({
        provider: "kiwitaxi",
        providerProductId: "412",
        status: "CONFIRMED",
        providerBookingId: "KT-12345",
        confirmedPrice: { amount: 162, currency: "EUR" },
      }).ok
    ).toBe(true);
  });

  test("④ EXTERNAL zapis NE sme nositi providerBookingId/cene (živi pri ponudniku)", () => {
    expect(
      validateConfirmationRecord({
        provider: "kiwitaxi",
        providerProductId: "412",
        status: "EXTERNAL",
        providerBookingId: "KT-12345",
      }).ok
    ).toBe(false);
    expect(
      validateConfirmationRecord({
        provider: "kiwitaxi",
        providerProductId: "412",
        status: "EXTERNAL",
        confirmedPrice: { amount: 162, currency: "EUR" },
      }).ok
    ).toBe(false);
    expect(
      validateConfirmationRecord({
        provider: "kiwitaxi",
        providerProductId: "412",
        status: "EXTERNAL",
      }).ok
    ).toBe(true);
  });

  test("⑤ isProviderConfirmed: SAMO CONFIRMED/PAID (ne EXTERNAL/SELECTED)", () => {
    expect(isProviderConfirmed("CONFIRMED")).toBe(true);
    expect(isProviderConfirmed("PAID")).toBe(true);
    expect(isProviderConfirmed("EXTERNAL")).toBe(false);
    expect(isProviderConfirmed("SELECTED")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5 — STATUSI PINOV (§13 — barva NIKOLI ne laže o rezervaciji)
// ---------------------------------------------------------------------------

describe("TASK 58: statusi pinov na zemljevidu potovanja", () => {
  test("① booked/pending/failed NISO dosegljivi v zunanjem (affiliate) toku", () => {
    expect(mapStatusReachable("booked", "external_affiliate")).toBe(false);
    expect(mapStatusReachable("pending", "external_affiliate")).toBe(false);
    expect(mapStatusReachable("failed", "external_affiliate")).toBe(false);
    expect(mapStatusReachable("booked", "info_only")).toBe(false);
  });

  test("② booked/pending/failed dosegljivi SAMO v API_BOOKING toku", () => {
    expect(mapStatusReachable("booked", "api_booking")).toBe(true);
  });

  test("③ privzeti status: recommended/info — NIKOLI „booked“", () => {
    expect(defaultMapStatus("external_affiliate")).toBe("recommended");
    expect(defaultMapStatus("info_only")).toBe("informational");
    expect(impliesReservation(defaultMapStatus("external_affiliate"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6 — SKUPNA CENA POTOVANJA (§16 — unknown NIKOLI kot 0)
// ---------------------------------------------------------------------------

const jp = (over: Partial<JourneyProduct>): JourneyProduct => ({
  id: "kiwitaxi:412",
  provider: "kiwitaxi",
  providerProductId: "412",
  type: "transfer",
  title: "Ljubljana Airport → Maribor",
  bookingMode: "affiliate_redirect",
  category: "transfer",
  mapStatus: "recommended",
  booking: bookingCapabilityOf("affiliate_redirect"),
  ...over,
});

describe("TASK 58: skupna cena potovanja (semantika §16)", () => {
  test("① fromPrice gre SAMO v estimatedTotal (spodnja meja, NE obljuba)", () => {
    const t = computeJourneyTotals([
      jp({
        id: "kiwitaxi:412",
        price: { amount: 162, currency: "EUR", unit: "per_transfer", fromPrice: true },
      }),
    ]);
    expect(t.estimatedTotal).toBe(162);
    expect(t.knownTotal).toBe(0);
    expect(t.fromPriceCount).toBe(1);
  });

  test("② unknown NI prištet kot 0 — štet izrecno", () => {
    const t = computeJourneyTotals([jp({ id: "osm:1", price: undefined })]);
    expect(t.unknownCount).toBe(1);
    expect(t.estimatedTotal).toBe(0);
    expect(t.knownTotal).toBe(0);
  });

  test("③ kanonska znana cena gre v knownTotal", () => {
    const t = computeJourneyTotals([
      jp({ id: "own:1", price: { amount: 50, currency: "EUR", unit: "total" } }),
    ]);
    expect(t.knownTotal).toBe(50);
    expect(t.estimatedTotal).toBe(0);
  });

  test("④ confirmedTotal je 0, dokler ni plačanih rezervacij (danes: 0 poverilnic)", () => {
    const t = computeJourneyTotals([
      jp({ price: { amount: 162, currency: "EUR", unit: "per_transfer", fromPrice: true } }),
    ]);
    expect(t.confirmedTotal).toBe(0);
  });

  test("⑤ describeTotals razloži, kaj številka PREDSTAVLJA (neznane ≠ brezplačno)", () => {
    const desc = describeTotals(
      computeJourneyTotals([
        jp({ price: { amount: 162, currency: "EUR", unit: "per_transfer", fromPrice: true } }),
        jp({ id: "osm:1", price: undefined }),
      ]),
      "sl"
    );
    expect(desc).toContain("od");
    expect(desc).toContain("ne štejejo kot brezplačno");
  });
});

// ---------------------------------------------------------------------------
// 7 — ORKESTRATOR (zgled naročnika §6–§12; DI adapterji = 0 omrežja)
// ---------------------------------------------------------------------------

/** Lažni OSM adapter (vrne kanonske produkte vse tri tipe). */
function fakeOsmAdapter(): SupplyAdapter {
  const entry = getProvider("osm")!;
  const mk = (
    p: Partial<ProviderProduct> & Pick<ProviderProduct, "id" | "title" | "type">
  ): ProviderProduct => ({
    provider: "osm",
    providerProductId: p.id.replace("osm:", ""),
    lat: 46.5547 + (Math.random() - 0.5) * 0.02,
    lng: 15.6459 + (Math.random() - 0.5) * 0.02,
    geoPrecision: "exact",
    bookingMode: "info_only",
    lastUpdated: new Date().toISOString(),
    ...p,
  });
  const products: ProviderProduct[] = [
    mk({ id: "osm:h1", title: "Hotel Maribor Center", type: "accommodation", subcategory: "hotel", openingHours: "Mo-Su 00:00-24:00" }),
    mk({ id: "osm:r1", title: "Restavracija Drava", type: "restaurant", subcategory: "restaurant" }),
    mk({ id: "osm:r2", title: "Gostilna Štajerska", type: "restaurant", subcategory: "restaurant" }),
    mk({ id: "osm:p1", title: "Petrol Maribor Vzhod", type: "petrol", subcategory: "fuel" }),
  ];
  return {
    entry,
    async search() {
      return products;
    },
    lastRunCached: () => false,
  };
}

describe("TASK 58: orkestrator — ZGLED POTOVANJA Brnik → Maribor (§6–§12)", () => {
  test.skipIf(!hasKt)(
    "① §6 PRIHOD: izhodišče Brnik se razreši iz KT dataseta (realne koordinate)",
    async () => {
      const j = await planJourney(
        {
          origin: "Brnik",
          destination: "maribor",
          startDate: "2026-09-20",
          arrivalTime: "14:00",
          travelers: 2,
          lang: "sl",
          categories: ["transfer", "events", "rental"],
        },
        { adapters: [fakeOsmAdapter()] }
      );
      if ("error" in j) throw new Error(j.error);
      expect(j.origin.label).toContain("Ljubljana Airport");
      expect(j.origin.source).toBe("kiwitaxi-dataset");
      expect(j.origin.lat).toBeGreaterThan(45); // realne koordinate SI
      expect(j.destination.label).toBe("Maribor");
      expect(j.destination.source).toBe("destinations");
      expect(j.startDate).toBe("2026-09-20");
      expect(j.arrivalTime).toBe("14:00");
    }
  );

  test.skipIf(!hasKt)(
    "② §7 TRANSFER: 3 rute, kanonska cena (od €162), razredi vozil, EXTERNA rezervacija, FIXED sposoben",
    async () => {
      const j = await planJourney({
        origin: "Brnik",
        destination: "maribor",
        travelers: 2,
        lang: "sl",
        categories: ["transfer"],
      });
      if ("error" in j) throw new Error(j.error);
      const cat = j.categories.transfer;
      expect(cat.products.length).toBeGreaterThanOrEqual(3);
      const r412 = cat.products.find((p) => p.id === "kiwitaxi:412")!;
      expect(r412).toBeDefined();
      // KANONSKA cena s semantiko (od-cena, per_transfer, poštena opomba)
      expect(r412.price?.fromPrice).toBe(true);
      expect(r412.price?.amount).toBe(162);
      expect(r412.price?.unit).toBe("per_transfer");
      expect(r412.price?.note).toContain("objavljena cena");
      // RAZREDI VOZIL (realni iz dataseta — §7 „Vehicle")
      expect(r412.vehicleOptions?.length).toBe(7);
      expect(r412.vehicleOptions?.[0]?.transferId).toBeGreaterThan(0);
      // REZERVACIJA: pri ponudniku (EXTERNAL) — ne „opravljena"
      expect(r412.booking.flow).toBe("external_affiliate");
      expect(r412.booking.payment).toBe("external_provider");
      expect(r412.bookingUrl).toContain("/go/transfers?product=9227");
      expect(r412.durationMin).toBe(100);
      // Razpoložljivost: iskrena (vir je nima)
      expect(r412.availability?.status).toBe("not_supported");
      // Pin: priporočilo (NIKOLI „booked")
      expect(r412.mapStatus).toBe("recommended");
    }
  );

  test.skipIf(!hasKt)(
    "③ §15 ČASOVNA KONSISTENCA: najzgodnejši prihod = 14:00 + 100 min = 15:40",
    async () => {
      const j = await planJourney({
        origin: "Brnik",
        destination: "maribor",
        arrivalTime: "14:00",
        travelers: 2,
        lang: "sl",
        categories: ["transfer"],
      });
      if ("error" in j) throw new Error(j.error);
      expect(j.earliestArrivalAtDestination?.time).toBe("15:40");
      expect(j.earliestArrivalAtDestination?.via).toContain("Maribor");
    }
  );

  test.skipIf(!hasKt)(
    "④ §9 DOGDKI: 3 mariborski dogodki (lokalni dataset), INFO_ONLY brez fake vstopnic",
    async () => {
      const j = await planJourney({
        origin: "Brnik",
        destination: "maribor",
        startDate: "2026-09-20",
        travelers: 2,
        lang: "sl",
        categories: ["events"],
      });
      if ("error" in j) throw new Error(j.error);
      const cat = j.categories.events;
      expect(cat.products.length).toBe(3);
      const fest = cat.products.find((p) => p.id === "events:festival-stara-trta")!;
      expect(fest).toBeDefined();
      expect(fest.eventDate?.start).toBe("2026-10-03");
      expect(fest.eventDate?.end).toBe("2026-10-12");
      expect(fest.booking.flow).toBe("info_only"); // NE „BOOKED"
      expect(fest.price).toBeUndefined(); // priceRange je oznaka, ne številka
      expect(fest.mapStatus).toBe("informational");
    }
  );

  test.skipIf(!hasKt)(
    "⑤ §12 NAJEM: DiscoverCars affiliate kartica ( affiliate ≠ inventar — 0 produktov)",
    async () => {
      const j = await planJourney({
        origin: "Brnik",
        destination: "maribor",
        travelers: 2,
        lang: "sl",
        categories: ["rental"],
      });
      if ("error" in j) throw new Error(j.error);
      const cat = j.categories.rental;
      expect(cat.products.length).toBe(0); // NIKOLI ProviderProduct iz affiliate
      expect(cat.providers.length).toBe(1);
      const dc = cat.providers[0]!;
      expect(dc.provider).toBe("discovercars");
      expect(dc.url).toContain("/go/cars?dest=");
      expect(dc.booking.flow).toBe("external_affiliate");
      expect(dc.status).toBe("affiliate");
    }
  );

  test.skipIf(!hasKt)(
    "⑥ §8/§10/§11 LOKALNE KATEGORIJE: nastanitve/restavracije/bencin iz OSM (DI adapter) z razdaljo",
    async () => {
      const j = await planJourney(
        {
          origin: "Brnik",
          destination: "maribor",
          travelers: 2,
          lang: "sl",
          categories: ["accommodation", "restaurants", "petrol"],
        },
        { adapters: [fakeOsmAdapter()] }
      );
      if ("error" in j) throw new Error(j.error);
      expect(j.categories.accommodation.products.length).toBe(1);
      expect(j.categories.accommodation.products[0]!.title).toBe("Hotel Maribor Center");
      expect(j.categories.restaurants.products.length).toBe(2);
      expect(j.categories.petrol.products.length).toBe(1);
      // Razdalja od središča destinacije + info_only tok brez cene
      const hotel = j.categories.accommodation.products[0]!;
      expect(hotel.distanceKm).toBeGreaterThanOrEqual(0);
      expect(hotel.booking.flow).toBe("info_only");
      expect(hotel.price).toBeUndefined(); // OSM nima cen — iskreno
      expect(hotel.mapStatus).toBe("informational");
    }
  );

  test.skipIf(!hasKt)(
    "⑦ §16 SKUPNA CENA: fromPrice transferjev v oceni; OSM/dogodki v neznanem (NE kot 0)",
    async () => {
      const j = await planJourney({
        origin: "Brnik",
        destination: "maribor",
        travelers: 2,
        lang: "sl",
        categories: ["transfer", "events"],
      });
      if ("error" in j) throw new Error(j.error);
      expect(j.totals.estimatedTotal).toBe(162 + 216 + 226); // vse 3 rute so „od"
      expect(j.totals.fromPriceCount).toBe(3);
      expect(j.totals.unknownCount).toBe(3); // dogodki brez cene
      expect(j.totals.confirmedTotal).toBe(0); // 0 potrjenih rezervacij
      expect(j.totals.knownTotal).toBe(0);
    }
  );

  test.skipIf(!hasKt)(
    "⑧ EN jezik: naslovi/napis EN (lokalni viri ostanejo v izvirniku — KT name_en)",
    async () => {
      const j = await planJourney({
        origin: "Brnik",
        destination: "maribor",
        travelers: 2,
        lang: "en",
        categories: ["transfer", "events"],
      });
      if ("error" in j) throw new Error(j.error);
      expect(j.lang).toBe("en");
      const r412 = j.categories.transfer.products.find((p) => p.id === "kiwitaxi:412")!;
      expect(r412.price?.note).toContain("published price");
      const fest = j.categories.events.products.find(
        (p) => p.id === "events:festival-stara-trta"
      )!;
      expect(fest.note?.en).toContain("ticket purchase");
    }
  );

  test.skipIf(!hasKt)("⑨ neznana destinacija → napaka (400-class)", async () => {
    const j = await planJourney({
      origin: "Brnik",
      destination: "atlantis",
      travelers: 2,
      lang: "sl",
    });
    expect("error" in j).toBe(true);
  });

  test.skipIf(!hasKt)("⑩ neveljaven datum → napaka", async () => {
    const j = await planJourney({
      origin: "Brnik",
      destination: "maribor",
      startDate: "20.09.2026",
      travelers: 2,
      lang: "sl",
    });
    expect("error" in j).toBe(true);
  });

  test.skipIf(!hasKt)(
    "⑪ nerešeno izhodišče → iskrena opozorila (origin_unresolved + no_transfer_route)",
    async () => {
      const j = await planJourney({
        origin: "Xyzabc Qq",
        destination: "maribor",
        travelers: 2,
        lang: "sl",
        categories: ["transfer"],
      });
      if ("error" in j) throw new Error(j.error);
      expect(j.origin.source).toBe("unresolved");
      expect(j.origin.lat).toBeUndefined();
      expect(
        j.validation.issues.some((i) => i.rule === "origin_unresolved")
      ).toBe(true);
      expect(
        j.validation.issues.some((i) => i.rule === "no_transfer_route")
      ).toBe(true);
    }
  );

  test.skipIf(!hasKt)(
    "⑫ dataset MANJKA: transfer izostane z opombo (okoljska odpoved — NE kaznuj)",
    async () => {
      disableKiwitaxiBaselineForTests(true);
      const j = await planJourney({
        origin: "Brnik",
        destination: "maribor",
        travelers: 2,
        lang: "sl",
        categories: ["transfer"],
      });
      if ("error" in j) throw new Error(j.error);
      expect(j.categories.transfer.products.length).toBe(0);
      expect(
        j.validation.issues.some((i) => i.rule === "dataset_missing")
      ).toBe(true);
      expect(j.earliestArrivalAtDestination).toBeUndefined();
    }
  );

  test.skipIf(!hasKt)(
    "⑬ travelers clamp 1–20 + privzeta ura 12:00 (missing arrivalTime)",
    async () => {
      const j = await planJourney({
        origin: "Brnik",
        destination: "maribor",
        travelers: 99,
        lang: "sl",
        categories: ["transfer"],
      });
      if ("error" in j) throw new Error(j.error);
      expect(j.travelers).toBe(20);
      expect(j.arrivalTime).toBe("12:00");
      // 12:00 + 100 min = 13:40
      expect(j.earliestArrivalAtDestination?.time).toBe("13:40");
    }
  );
});

// ---------------------------------------------------------------------------
// 8 — Haversine (geo konsistenca §15 — razdalje)
// ---------------------------------------------------------------------------

describe("TASK 58: haversineKm (razdalje za §15)", () => {
  test("① Brnik → Maribor ~ 130 km (KT distanceKm je 130 — sanity ±30 %)", () => {
    const brnik = { lat: 46.2236, lng: 14.4575 }; // dataset geo območja
    const maribor = { lat: 46.5547, lng: 15.6459 };
    const km = haversineKm(brnik, maribor);
    expect(km).toBeGreaterThan(90);
    expect(km).toBeLessThan(170);
  });

  test("② ista točka = 0", () => {
    expect(haversineKm({ lat: 46.5, lng: 15.6 }, { lat: 46.5, lng: 15.6 })).toBe(0);
  });
});
