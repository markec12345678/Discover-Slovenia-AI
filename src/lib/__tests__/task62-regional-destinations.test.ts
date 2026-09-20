// ============================================================================
// TASK 62 — REGIONALNA POKRITOST (SI+HR+ME+AL): TESTI (1.62.0)
// ============================================================================
// Pokrivajo: integriteto destinacijskega registra (38 = 22 SI + 8 HR +
// 4 ME + 4 AL), koherence regija↔država↔FSQ bbox, EN overlay pariteto,
// obstoj slik, izvoriščni fallback KT geo (Brnik tudi za Dubrovnik) in
// ORKESTRATOR regionalnih potovanj (Dubrovnik/Zagreb s DI adapterji —
// 0 omrežja v testih; iskrene opombe: 0 transfer rut ≠ napaka).
// ============================================================================

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  DESTINATIONS,
  REGIONS,
  COUNTRIES,
  COUNTRY_OF_REGION,
  getDestinationById,
  getDestinationsByCountry,
  getDestinationsByRegion,
  getFeaturedDestinations,
} from "@/lib/slovenia-data";
import {
  DESTINATIONS_EN,
  REGIONS_EN,
  COUNTRIES_EN,
  getEnDestination,
} from "@/lib/slovenia-data-en";
import { SUPPORTED_COUNTRY_BBOXES } from "@/lib/supply/providers/fsq/dataset";
import { searchKiwitaxiOriginGeo } from "@/lib/supply/providers/kiwitaxi/dataset";
import { getKiwitaxiBaseline } from "@/lib/supply/providers/kiwitaxi/dataset";
import { getProvider } from "@/lib/supply/registry";
import type { SupplyAdapter } from "@/lib/supply/adapter";
import type { ProviderProduct } from "@/lib/supply/types";
import { planJourney } from "@/lib/journey/orchestrator";

const baseline = getKiwitaxiBaseline();
const hasKt = Boolean(baseline);

/** Id-ji 16 novih regionalnih destinacij (TASK 62). */
const NEW_IDS = [
  "zagreb",
  "plitvicka-jezera",
  "rijeka",
  "pula",
  "zadar",
  "split",
  "hvar",
  "dubrovnik",
  "kotor",
  "budva",
  "podgorica",
  "durmitor",
  "tirana",
  "berat",
  "gjirokaster",
  "saranda",
] as const;

// ---------------------------------------------------------------------------
// 1 — INTEGRITETA REGISTRA (števci, unikatnost, koherence)
// ---------------------------------------------------------------------------

describe("TASK 62: register — 39 destinacij (22 SI + 8 HR + 4 ME + 4 AL)", () => {
  test("① števci po državah so točno 23/8/4/4", () => {
    expect(DESTINATIONS).toHaveLength(38);
    expect(getDestinationsByCountry("SI")).toHaveLength(22);
    expect(getDestinationsByCountry("HR")).toHaveLength(8);
    expect(getDestinationsByCountry("ME")).toHaveLength(4);
    expect(getDestinationsByCountry("AL")).toHaveLength(4);
  });

  test("② unikatni id-ji in slugi (identiteta brez podvajanj)", () => {
    const ids = new Set(DESTINATIONS.map((d) => d.id));
    const slugs = new Set(DESTINATIONS.map((d) => d.slug));
    expect(ids.size).toBe(38);
    expect(slugs.size).toBe(38);
  });

  test("③ vsaka država je v COUNTRIES; vsaka regija je v REGIONS", () => {
    const countryValues = new Set(COUNTRIES.map((c) => c.value));
    const regionValues = new Set(REGIONS.map((r) => r.value));
    for (const d of DESTINATIONS) {
      expect(countryValues.has(d.country)).toBe(true);
      expect(regionValues.has(d.region)).toBe(true);
    }
  });

  test("④ koherenco regija↔država (COUNTRY_OF_REGION brez laži)", () => {
    for (const d of DESTINATIONS) {
      expect(COUNTRY_OF_REGION[d.region]).toBe(d.country);
    }
    // Popolna preslikka: VSA regija iz REGIONS ima državo.
    for (const r of REGIONS) {
      expect(COUNTRY_OF_REGION[r.value]).toBeDefined();
    }
  });

  test(
    "⑤ koordinate znotraj FSQ SUPPORTED_COUNTRY_BBOXES lastne države",
    () => {
      for (const d of DESTINATIONS) {
        const b = SUPPORTED_COUNTRY_BBOXES[d.country];
        expect(b).toBeDefined();
        expect(d.coords.lat).toBeGreaterThanOrEqual(b.latMin);
        expect(d.coords.lat).toBeLessThanOrEqual(b.latMax);
        expect(d.coords.lng).toBeGreaterThanOrEqual(b.lngMin);
        expect(d.coords.lng).toBeLessThanOrEqual(b.lngMax);
      }
    }
  );

  test("⑥ homepage stabilnost: featured ostane 6, VSE iz SI", () => {
    const featured = getFeaturedDestinations();
    expect(featured).toHaveLength(6);
    for (const d of featured) expect(d.country).toBe("SI");
  });

  test("⑦ slike vseh 16 novih destinacij OBSTAJAJO na disku", () => {
    for (const id of NEW_IDS) {
      const d = getDestinationById(id)!;
      expect(d).toBeDefined();
      expect(d.image.startsWith("/content/")).toBe(true);
      expect(d.image.endsWith(".jpg")).toBe(true);
      expect(existsSync(join(process.cwd(), "public", d.image))).toBe(true);
    }
  });

  test("⑧ Dalmacija = 4 destinacije (Zadar, Split, Hvar, Dubrovnik)", () => {
    const dal = getDestinationsByRegion("dalmacija");
    expect(dal.map((d) => d.id).sort()).toEqual(
      ["dubrovnik", "hvar", "split", "zadar"].sort()
    );
  });
});

// ---------------------------------------------------------------------------
// 2 — EN OVERLAY (pariteta dolžin + popolna pokritost novih)
// ---------------------------------------------------------------------------

describe("TASK 62: EN overlay — 16 novih destinacij", () => {
  test("① vseh 16 novih id-jev ima EN overlay", () => {
    for (const id of NEW_IDS) {
      expect(getEnDestination(id)).toBeDefined();
      expect(DESTINATIONS_EN[id]).toBeDefined();
    }
  });

  test("② pariteta highlights/activities (dolžine se ujemajo s SL)", () => {
    for (const id of NEW_IDS) {
      const sl = getDestinationById(id)!;
      const en = getEnDestination(id)!;
      expect(en.highlights).toHaveLength(sl.highlights.length);
      expect(en.activities).toHaveLength(sl.activities.length);
      expect(en.duration.length).toBeGreaterThan(3);
    }
  });

  test("③ REGIONS_EN/COUNTRIES_EN pokrivajo vse regije/države", () => {
    for (const r of REGIONS) expect(REGIONS_EN[r.value]).toBeDefined();
    for (const c of COUNTRIES) expect(COUNTRIES_EN[c.value]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3 — KT IZVORIŠČNI FALLBACK (geo BREZ odvisnosti od destinacije)
// ---------------------------------------------------------------------------

describe("TASK 62: searchKiwitaxiOriginGeo (izvorišče iz partnerjevih geo)", () => {
  test.skipIf(!hasKt)(
    "① Brnik → Ljubljana Airport geo (tudi kadar destinacija nima rut)",
    () => {
      const geo = searchKiwitaxiOriginGeo("Brnik");
      expect(geo).not.toBeNull();
      expect(geo!.label).toContain("Ljubljana Airport");
      expect(geo!.lat).toBeGreaterThan(46.0); // Brnik ~46.22
      expect(geo!.lat).toBeLessThan(46.5);
      expect(geo!.lng).toBeGreaterThan(14.2);
      expect(geo!.lng).toBeLessThan(14.7);
    }
  );

  test.skipIf(!hasKt)(
    "② neznani kraj → null (iskreno NE ugibamo)",
    () => {
      expect(searchKiwitaxiOriginGeo("Nefamoski izmišljeni kraj xyz")).toBeNull();
    }
  );

  test.skipIf(!hasKt)(
    "③ Zagreb Airport je znan izvoriščni kraj (regija HR)",
    () => {
      const geo = searchKiwitaxiOriginGeo("Zagreb Airport");
      expect(geo).not.toBeNull();
      expect(geo!.label).toContain("Zagreb");
    }
  );
});

// ---------------------------------------------------------------------------
// 4 — ORKESTRATOR: REGIONALNA POTOVANJA (DI adapterji = 0 omrežja)
// ---------------------------------------------------------------------------

/** Lažni FSQ adapter z DUBROVNIŠKIMI produkti (42.65, 18.09). */
function fakeFsqAdapter(): SupplyAdapter {
  const entry = getProvider("fsq")!;
  const mk = (
    p: Partial<ProviderProduct> & Pick<ProviderProduct, "id" | "title" | "type">
  ): ProviderProduct => ({
    provider: "fsq",
    providerProductId: p.id.replace("fsq:", ""),
    lat: 42.6507 + (Math.random() - 0.5) * 0.01,
    lng: 18.0944 + (Math.random() - 0.5) * 0.01,
    geoPrecision: "exact",
    bookingMode: "info_only",
    lastUpdated: new Date().toISOString(),
    ...p,
  });
  const products: ProviderProduct[] = [
    mk({ id: "fsq:h1", title: "Apartment Dubrovnik Old Town", type: "accommodation", subcategory: "Hotel" }),
    mk({ id: "fsq:h2", title: "Villa Adriatic", type: "accommodation", subcategory: "Vacation Rental" }),
    mk({ id: "fsq:r1", title: "Konoba Stradun", type: "restaurant", subcategory: "Restaurant" }),
    mk({ id: "fsq:r2", title: "Pizzeria Pile", type: "restaurant", subcategory: "Pizzeria" }),
  ];
  return {
    entry,
    async search() {
      return products;
    },
    lastRunCached: () => false,
  };
}

describe("TASK 62: orkestrator — DUBROVNIK (regionalno potovanje)", () => {
  test.skipIf(!hasKt)(
    "① destinacija se razreši iz registra; produkti prisotni; transfer iskreno prazen",
    async () => {
      const j = await planJourney(
        {
          origin: "Brnik",
          destination: "dubrovnik",
          startDate: "2026-10-10",
          arrivalTime: "12:00",
          travelers: 2,
          lang: "sl",
          categories: ["transfer", "accommodation", "restaurants", "events"],
        },
        { adapters: [fakeFsqAdapter()] }
      );
      if ("error" in j) throw new Error(j.error);
      // Destinacija: registrirana (ne napaka „neznana destinacija").
      expect(j.destination.label).toBe("Dubrovnik");
      expect(j.destination.source).toBe("destinations");
      expect(j.destination.lat).toBeCloseTo(42.6507, 3);
      // FSQ sloj: nastanitve + restavracije (fake adapter = dokaz pretoka).
      expect(j.categories.accommodation.products.length).toBe(2);
      expect(j.categories.restaurants.products.length).toBe(2);
      // TRANSFER: 0 rut v objavljenem inventarju — ISKRENA opomba + warn,
      // ne napaka (odpoved ene kategorije NE podre potovanja — §22).
      expect(j.categories.transfer.products).toHaveLength(0);
      expect(j.categories.transfer.note?.sl).toContain("Ni rute");
      const rules = j.validation.issues.map((i) => i.rule);
      expect(rules).toContain("no_transfer_route");
      // Dogodki: SI koledar za Dubrovnik iskreno prazen.
      expect(j.categories.events.products).toHaveLength(0);
    }
  );

  test.skipIf(!hasKt)(
    "② izvorišče Brnik se razreši IZ KT geo tudi za Dubrovnik (fallback)",
    async () => {
      const j = await planJourney(
        {
          origin: "Brnik",
          destination: "dubrovnik",
          travelers: 2,
          lang: "sl",
          categories: ["accommodation"],
        },
        { adapters: [fakeFsqAdapter()] }
      );
      if ("error" in j) throw new Error(j.error);
      expect(j.origin.label).toContain("Ljubljana Airport");
      expect(j.origin.source).toBe("transfer-inventory");
      // origin_unresolved NE sme biti med opombami (geo je iz partnerja).
      const rules = j.validation.issues.map((i) => i.rule);
      expect(rules).not.toContain("origin_unresolved");
    }
  );

  test("③ neznana destinacija → napaka s številom 38 podprtih", async () => {
    const j = await planJourney({
      origin: "Brnik",
      destination: "izmišljenikraj",
      travelers: 2,
      lang: "sl",
    });
    expect("error" in j).toBe(true);
    if ("error" in j) expect(j.error).toContain("38");
  });
});

describe("TASK 62: orkestrator — ZAGREB (transferji obstajajo)", () => {
  test.skipIf(!hasKt)(
    "① Brnik → Zagreb: realne KT rute s kanonsko ceno",
    async () => {
      const j = await planJourney({
        origin: "Brnik",
        destination: "zagreb",
        travelers: 2,
        lang: "sl",
        categories: ["transfer"],
      });
      if ("error" in j) throw new Error(j.error);
      const tr = j.categories.transfer.products;
      expect(tr.length).toBeGreaterThanOrEqual(1);
      expect(tr[0].title).toContain("Zagreb");
      expect(tr[0].price?.fromPrice).toBe(true);
      // Iskrena opomba o „od" ceni (ne živi citat).
      expect(j.categories.transfer.note?.sl).toContain("od");
    }
  );

  test.skipIf(!hasKt)(
    "② po IMENU (ne id): „Dubrovnik“ se razreši prek imena",
    async () => {
      const j = await planJourney(
        {
          origin: "Zagreb",
          destination: "Dubrovnik",
          travelers: 2,
          lang: "en",
          categories: ["accommodation"],
        },
        { adapters: [fakeFsqAdapter()] }
      );
      if ("error" in j) throw new Error(j.error);
      expect(j.destination.label).toBe("Dubrovnik");
    }
  );
});
