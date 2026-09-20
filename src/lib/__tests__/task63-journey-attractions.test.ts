// ============================================================================
// TASK 63 — JOURNEY ATTRACTIONS: „STVARI ZA VIDETI" PO 4 DRŽAVAH (1.63.0)
// ============================================================================
// Pokrivajo: novo kategorijo attractions v registru potovalnih kategorij,
// orkestrator (DI adapterji — 0 omrežja): znamenitosti se napolnijo iz
// things-to-do tipov (attraction/museum/viewpoint/natural/religious),
// razvrstitev po razdalji, ISKRENO opombo plasti (brez rezervacije, ur ni
// v viru), selektivno zahtevo (samo attractions), MY TRIP (časovnica s
// timeNote, nikoli izumljen urnik) in handoff (prenos v načrtovalnik).
// ============================================================================

import { describe, expect, test } from "bun:test";

import { JOURNEY_CATEGORY_KEYS } from "@/lib/journey/types";
import { planJourney } from "@/lib/journey/orchestrator";
import { buildMyTrip } from "@/lib/journey/trip-view";
import { journeyProductsToSelection } from "@/lib/journey/handoff";
import { getProvider } from "@/lib/supply/registry";
import type { SupplyAdapter } from "@/lib/supply/adapter";
import type { ProviderProduct } from "@/lib/supply/types";
import { getKiwitaxiBaseline } from "@/lib/supply/providers/kiwitaxi/dataset";

const baseline = getKiwitaxiBaseline();
const hasKt = Boolean(baseline);

const TOD_TYPES = ["attraction", "museum", "viewpoint", "natural", "religious"] as const;

/**
 * Lažni FSQ adapter z DUBROVNIŠKIMI things-to-do produkti (42.65, 18.09) +
 * nastanitvijo/restavracijo (kontrola, da se kategorije NE pomešajo).
 */
function fakeFsqAdapter(): SupplyAdapter {
  const entry = getProvider("fsq")!;
  let i = 0;
  const mk = (
    p: Partial<ProviderProduct> & Pick<ProviderProduct, "id" | "title" | "type">
  ): ProviderProduct => ({
    provider: "fsq",
    providerProductId: p.id.replace("fsq:", ""),
    // Deterministični položaji okoli Dubrovnika (brez Math.random).
    lat: 42.6507 + ((i++ % 5) - 2) * 0.004,
    lng: 18.0944 + ((i % 3) - 1) * 0.004,
    geoPrecision: "exact",
    bookingMode: "info_only",
    lastUpdated: new Date().toISOString(),
    ...p,
  });
  const products: ProviderProduct[] = [
    mk({ id: "fsq:a1", title: "Grad Lovrijenac", type: "attraction", subcategory: "Castle" }),
    mk({ id: "fsq:a2", title: "Muzej Dubrovnik", type: "museum", subcategory: "History Museum" }),
    mk({ id: "fsq:a3", title: "Plaža Banje", type: "natural", subcategory: "Beach" }),
    mk({ id: "fsq:a4", title: "Razgledna točka Srđ", type: "viewpoint", subcategory: "Scenic Lookout" }),
    mk({ id: "fsq:a5", title: "Samostan Male braće", type: "religious", subcategory: "Monastery" }),
    // Kontrola: drugačen tip NE sme priti v attractions kategorijo.
    mk({ id: "fsq:h1", title: "Apartma Stari grad", type: "accommodation", subcategory: "Hotel" }),
    mk({ id: "fsq:r1", title: "Konoba Stradun", type: "restaurant", subcategory: "Restaurant" }),
  ];
  return {
    entry,
    async search() {
      return products;
    },
    lastRunCached: () => false,
  };
}

// ---------------------------------------------------------------------------
// 1 — REGISTER KATEGORIJ
// ---------------------------------------------------------------------------

describe("TASK 63: register kategorij potovanja", () => {
  test("① attractions je 3. kategorija (7 skupaj, vrstni red verige)", () => {
    expect(JOURNEY_CATEGORY_KEYS).toHaveLength(7);
    expect(JOURNEY_CATEGORY_KEYS[2]).toBe("attractions");
    expect(JOURNEY_CATEGORY_KEYS).toContain("transfer");
    expect(JOURNEY_CATEGORY_KEYS).toContain("rental");
  });
});

// ---------------------------------------------------------------------------
// 2 — ORKESTRATOR: ZNAMENITOSTI IZ FSQ SLOJA (DI = 0 omrežja)
// ---------------------------------------------------------------------------

describe("TASK 63: orkestrator — attractions (Dubrovnik, DI)", () => {
  test.skipIf(!hasKt)(
    "① privzete kategorije → znamenitosti napolnjene, tipi ⊆ things-to-do",
    async () => {
      const j = await planJourney(
        {
          origin: "Brnik",
          destination: "dubrovnik",
          startDate: "2026-10-10",
          arrivalTime: "12:00",
          travelers: 2,
          lang: "sl",
        },
        { adapters: [fakeFsqAdapter()] }
      );
      if ("error" in j) throw new Error(j.error);
      const cat = j.categories.attractions;
      expect(cat.key).toBe("attractions");
      expect(cat.products.length).toBe(5);
      for (const p of cat.products) {
        expect((TOD_TYPES as readonly string[]).includes(p.type)).toBe(true);
        // Kanonska kategorija na produktu (sledljivost §5).
        expect(p.category).toBe("attractions");
        // Vsak produkt ima razdaljo od središča destinacije (sort ključ).
        expect(p.distanceKm).toBeDefined();
      }
      // Kontrola: nastanitve/restavracije so v SVOJIH kategorijah.
      expect(j.categories.accommodation.products.map((p) => p.id)).toContain("fsq:h1");
      expect(j.categories.restaurants.products.map((p) => p.id)).toContain("fsq:r1");
      expect(
        j.categories.attractions.products.map((p) => p.id)
      ).not.toContain("fsq:h1");
    }
  );

  test.skipIf(!hasKt)(
    "② iskrena opomba plasti: odprti viri, brez rezervacije, ur ni v viru",
    async () => {
      const j = await planJourney(
        {
          origin: "Brnik",
          destination: "dubrovnik",
          travelers: 2,
          lang: "sl",
          categories: ["attractions"],
        },
        { adapters: [fakeFsqAdapter()] }
      );
      if ("error" in j) throw new Error(j.error);
      expect(j.categories.attractions.note?.sl).toContain("FSQ OS Places");
      expect(j.categories.attractions.note?.sl).toContain("brez rezervacije");
      // EN variant iste opombe.
      const jEn = await planJourney(
        {
          origin: "Brnik",
          destination: "dubrovnik",
          travelers: 2,
          lang: "en",
          categories: ["attractions"],
        },
        { adapters: [fakeFsqAdapter()] }
      );
      if ("error" in jEn) throw new Error(jEn.error);
      expect(jEn.categories.attractions.note?.en).toContain("no booking");
    }
  );

  test.skipIf(!hasKt)(
    "③ selektivna zahteva: SAMO attractions → ostale kategorije prazne",
    async () => {
      const j = await planJourney(
        {
          origin: "Brnik",
          destination: "dubrovnik",
          travelers: 2,
          lang: "sl",
          categories: ["attractions"],
        },
        { adapters: [fakeFsqAdapter()] }
      );
      if ("error" in j) throw new Error(j.error);
      expect(j.categories.attractions.products).toHaveLength(5);
      expect(j.categories.accommodation.products).toHaveLength(0);
      expect(j.categories.restaurants.products).toHaveLength(0);
      expect(j.categories.petrol.products).toHaveLength(0);
      // Totals: znamenitosti brez cene → neznane cene (nikoli 0 € laž).
      expect(j.totals.unknownCount).toBeGreaterThanOrEqual(5);
    }
  );

  test.skipIf(!hasKt)(
    "④ slovenska destinacija (Bled) — ista plast deluje za SI",
    async () => {
      const j = await planJourney(
        {
          origin: "Brnik",
          destination: "bled",
          travelers: 2,
          lang: "sl",
          categories: ["attractions"],
        },
        { adapters: [fakeFsqAdapter()] }
      );
      if ("error" in j) throw new Error(j.error);
      // Fake adapter vrne dubrovniške koordinate — BLED je ~330 km stran,
      // plast je še vedno napolnjena (adapter ne filtrira po geo v DI),
      // razdalje pa POŠTENO velike (sort po razdalji deluje).
      expect(j.categories.attractions.products.length).toBe(5);
      for (const p of j.categories.attractions.products) {
        expect(p.distanceKm as number).toBeGreaterThan(300);
      }
    }
  );

  test.skipIf(!hasKt)(
    "⑤ razvrstitev po razdalji (najbližji prvi)",
    async () => {
      const j = await planJourney(
        {
          origin: "Brnik",
          destination: "dubrovnik",
          travelers: 2,
          lang: "sl",
          categories: ["attractions"],
        },
        { adapters: [fakeFsqAdapter()] }
      );
      if ("error" in j) throw new Error(j.error);
      const d = j.categories.attractions.products.map((p) => p.distanceKm ?? 999);
      for (let k = 1; k < d.length; k++) {
        expect(d[k]).toBeGreaterThanOrEqual(d[k - 1]);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// 3 — MY TRIP: znamenitosti v časovnici (iskreni timeNote)
// ---------------------------------------------------------------------------

describe("TASK 63: MY TRIP — izbrane znamenitosti", () => {
  test.skipIf(!hasKt)(
    "① izbrana znamenitost je v dnevu 1 s statusom INFO in timeNote (brez izumljene ure)",
    async () => {
      const j = await planJourney(
        {
          origin: "Brnik",
          destination: "dubrovnik",
          startDate: "2026-10-10",
          arrivalTime: "12:00",
          travelers: 2,
          lang: "sl",
          categories: ["attractions"],
        },
        { adapters: [fakeFsqAdapter()] }
      );
      if ("error" in j) throw new Error(j.error);
      const first = j.categories.attractions.products[0];
      const trip = buildMyTrip(j, new Set([first.id]));
      const day1 = trip.days.find((d) => d.date === "2026-10-10");
      expect(day1).toBeDefined();
      const entry = day1!.entries.find((e) => e.key === first.id);
      expect(entry).toBeDefined();
      // Status: info_only → SAMO INFORMACIJA (nikoli EXTERNAL/CONFIRMED).
      expect(entry!.status).toBe("INFO");
      // Čas NI izumljen — timeNote pove zakaj (FSQ ne objavlja ur).
      expect(entry!.time).toBeUndefined();
      expect(entry!.timeNote?.sl).toContain("Odpiralni časi niso objavljeni");
      // Kategorija za ikono/vrsto.
      expect(entry!.category).toBe("attractions");
    }
  );

  test.skipIf(!hasKt)(
    "② neizbrane znamenitosti niso v časovnici (izbor = uporabnikov)",
    async () => {
      const j = await planJourney(
        {
          origin: "Brnik",
          destination: "dubrovnik",
          startDate: "2026-10-10",
          travelers: 2,
          lang: "sl",
          categories: ["attractions"],
        },
        { adapters: [fakeFsqAdapter()] }
      );
      if ("error" in j) throw new Error(j.error);
      const trip = buildMyTrip(j, new Set());
      const allKeys = trip.days.flatMap((d) => d.entries.map((e) => e.key));
      for (const p of j.categories.attractions.products) {
        expect(allKeys).not.toContain(p.id);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// 4 — HANDOFF: prenos izbranih znamenitosti v načrtovalnik
// ---------------------------------------------------------------------------

describe("TASK 63: handoff — znamenitosti v izbiro načrtovalnika", () => {
  test.skipIf(!hasKt)(
    "① izbrana znamenitost se prenese kot FIXED izbira (tip ohranjen)",
    async () => {
      const j = await planJourney(
        {
          origin: "Brnik",
          destination: "dubrovnik",
          travelers: 2,
          lang: "sl",
          categories: ["attractions"],
        },
        { adapters: [fakeFsqAdapter()] }
      );
      if ("error" in j) throw new Error(j.error);
      const first = j.categories.attractions.products[0];
      const sel = journeyProductsToSelection([first], "sl");
      expect(sel).toHaveLength(1);
      expect(sel[0].providerProductId).toBe(first.providerProductId);
      expect(sel[0].type).toBe(first.type);
      expect(sel[0].selectionState).toBe("fixed");
    }
  );
});
