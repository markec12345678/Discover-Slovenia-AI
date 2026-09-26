// ============================================================================
// ISSUE #2 §5 → ISSUE #9 ZERO-AI — REGRESIJSKI TESTI: deterministična
// domenska plast /api/chat (buildDomainAnswer — PRIMARNA pot)
// ============================================================================
// Zahteva: /api/chat NE kliče LLM-ja (Issue #9) — odgovarja iz DEJANSKIH
// Discover podatkov (destinacije, lokalni, izdelki, izkušnje, OSM kraji,
// vreme Open-Meteo), brez izmišljenih podatkov, z "od €X" (FROM_PRICE)
// semantiko, ZUNANJA (nikoli "potrjeno") rezervacijsko semantiko in
// NEZNANO razpoložljivostjo. Odgovor NIKOLI ne trdi udeležbe AI (AI ni
// več pričakovana — predpona "AI trenutno ni dosegljiv" je odstranjena).
//
// Testi pokrivajo 10 tipov vprašanj iz Issue #2 §8 (glasovni klepet):
// destinacija, itinerer, Journey, My Trip, vreme, aktivnost, restavracija,
// cena, razpoložljivost, status rezervacije.
// ============================================================================
import { describe, expect, test } from "bun:test";
import {
  buildDomainAnswer,
  type DomainContext,
  type DomainListing,
  type DomainProduct,
  type DomainExperience,
} from "@/lib/chat-domain-fallback";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { ChatPlace } from "@/lib/geo-intent";
import type { DailyForecast } from "@/lib/weather-utils";

// ─── Fiksni realni kontekst (oblika vrstic, ki jih prinese /api/chat) ─────

const LISTINGS: DomainListing[] = [
  {
    name: "Gostilna Pri Piranu",
    category: "restaurant",
    destinationName: "Piran",
    description: "Ribe in lokalna kuhinja.",
    rating: 4.7,
    priceRange: "€€",
  },
  {
    name: "Bohinj Eco Hotel",
    category: "accommodation",
    destinationName: "Bohinj",
    description: "Trajnostni hotel ob jezeru.",
    rating: 4.5,
    priceRange: "€€€",
  },
];

const PRODUCTS: DomainProduct[] = [
  {
    name: "Piranska sol",
    category: "souvenir",
    destinationName: "Piran",
    price: 9,
    rating: 4.8,
  },
];

const EXPERIENCES: DomainExperience[] = [
  {
    name: "Degustacija v Piranu",
    category: "food",
    destinationName: "Piran",
    pricePerPerson: 45,
    rating: 4.9,
  },
];

const osmPlace = (name: string): ChatPlace => ({
  id: `osm-${name}`,
  name,
  lat: 45.5,
  lng: 13.6,
  category: "food",
  provenance: "osm",
});

const OSM_PLACES: ChatPlace[] = [
  { ...osmPlace("Restavracija Nejc"), detail: "št. 1", lat: 45.51, lng: 13.57 },
  osmPlace("Gostilna Tartini"),
];

const CONTEXT: DomainContext = {
  listings: LISTINGS,
  products: PRODUCTS,
  experiences: EXPERIENCES,
  osmPlaces: OSM_PLACES,
};

const NO_WEATHER = async (): Promise<DailyForecast[] | null> => null;
const REAL_WEATHER: DailyForecast[] = [
  {
    date: "2026-09-23",
    weatherCode: 3,
    tempMax: 21,
    precipitationProbabilityMax: 35,
  },
];

// ─── Testi ─────────────────────────────────────────────────────────────────

describe("chat-domain-fallback — poštenost in izvor", () => {
  test("① odgovor NIKOLI ne trdi udeležbe AI (Issue #9: AI ni več pričakovana — ne prazna obljuba, ne izgovor)", async () => {
    for (const lang of ["sl", "en"] as const) {
      const a = await buildDomainAnswer(
        "Kaj lahko vidim v Piranu?",
        lang,
        CONTEXT,
        { weather: NO_WEATHER }
      );
      // Odstranjena predpona "AI trenutno ni dosegljiv" — AI ni več del
      // poti, zato je kakršna koli omemba AI v odgovoru napačna.
      expect(a.message).not.toContain("AI trenutno ni dosegljiv");
      expect(a.message).not.toContain("AI is currently unavailable");
      expect(a.message).not.toContain("sem AI");
      expect(a.message.length).toBeGreaterThan(0);
    }
  });

  test("② neznano vprašanje → iskren odgovor BREZ ugibanja + realni primeri destinacij", async () => {
    const a = await buildDomainAnswer(
      "Povej mi šalo o programiranju.",
      "sl",
      CONTEXT,
      { weather: NO_WEATHER }
    );
    expect(a.message).toContain("ne ugibam");
    // Realne destinacije (ne izmišljene): vsaj ena dejansko obstaja.
    const anyReal = DESTINATIONS.slice(0, 20).some((d) =>
      a.message.includes(d.name)
    );
    expect(anyReal).toBe(true);
  });
});

describe("chat-domain-fallback — 10 tipov vprašanj (Issue #2 §8)", () => {
  test("③ DESTINACIJA: realni podatki Pirana (tagline/aktivnosti), ne trdo kodirano besedilo", async () => {
    const piran = DESTINATIONS.find((d) => d.name === "Piran");
    expect(piran).toBeTruthy();
    const a = await buildDomainAnswer(
      "Kaj lahko vidim v Piranu?",
      "sl",
      CONTEXT,
      { weather: NO_WEATHER }
    );
    expect(a.message).toContain("Piran");
    expect(a.message).toContain(piran!.tagline);
    // Povezava na realno stran destinacije.
    expect(a.message).toContain(`/destinacija/${piran!.slug}`);
    // T1 pin za mini zemljevid.
    expect(a.places.some((p) => p.provenance === "t1" && p.name === "Piran")).toBe(true);
  });

  test("④ VREME (z destinacijo): realna napoved Open-Meteo se prebere; null → izrecno nedosegljivo", async () => {
    const ok = await buildDomainAnswer(
      "Kakšno bo vreme v Piranu?",
      "sl",
      CONTEXT,
      { weather: async () => REAL_WEATHER }
    );
    expect(ok.message).toContain("Open-Meteo");
    expect(ok.message).toContain("21 °C");
    expect(ok.message).toContain("35%");

    const bad = await buildDomainAnswer(
      "Kakšno bo vreme v Piranu?",
      "sl",
      CONTEXT,
      { weather: NO_WEATHER }
    );
    expect(bad.message).toContain("ni uspelo pridobiti");
    // NIKOLI izmišljena številka ob napaki:
    expect(bad.message).not.toMatch(/\d+ °C/);
  });

  test("⑤ RESTAVRACIJA: realni OSM kraji se naštejo PO IMENU in pridejo na klient (mini zemljevid)", async () => {
    const a = await buildDomainAnswer(
      "Kje lahko jedem v Piranu?",
      "sl",
      CONTEXT,
      { weather: NO_WEATHER }
    );
    expect(a.message).toContain("Restavracija Nejc");
    expect(a.message).toContain("Gostilna Tartini");
    expect(a.message).toContain("skupnostni vir"); // oznaka vira (poštenost)
    expect(a.places.filter((p) => p.provenance === "osm").length).toBeGreaterThanOrEqual(2);
  });

  test("⑥ AKTIVNOSTI: aktivnosti destinacije + realne izkušnje iz konteksta", async () => {
    const a = await buildDomainAnswer(
      "Katere aktivnosti so v Piranu?",
      "sl",
      CONTEXT,
      { weather: NO_WEATHER }
    );
    const piran = DESTINATIONS.find((d) => d.name === "Piran")!;
    expect(a.message).toContain(piran.activities[0]);
    expect(a.message).toContain("Degustacija v Piranu");
    expect(a.message).toContain("od €45/osebo");
  });

  test("⑦ CENA: FROM_PRICE semantika — 'od €X' iz realnih cen, nikoli živa cena", async () => {
    const a = await buildDomainAnswer(
      "Koliko stane obisk Pirana?",
      "sl",
      CONTEXT,
      { weather: NO_WEATHER }
    );
    expect(a.message).toContain("od €");
    // Izkušnja (45) in izdelek (9) — obe realni ceni na voljo.
    expect(a.message).toContain("od €45");
    expect(a.message).toContain("od €9");
    expect(a.message).not.toContain("živa cena");
  });

  test("⑧ ITINERER: usmeritev na načrtovalca z opisom realnih zmožnosti", async () => {
    const a = await buildDomainAnswer(
      "Kako naredim načrt potovanja?",
      "sl",
      CONTEXT,
      { weather: NO_WEATHER }
    );
    expect(a.message).toContain("/nacrtuj");
    expect(a.message).toContain("OSRM");
    expect(a.message).toContain("Open-Meteo");
  });

  test("⑨ JOURNEY/PREVOZ: usmeritev na /potovanje z 'od €X' semantiko prevozov", async () => {
    const a = await buildDomainAnswer(
      "Kako pridem iz Ljubljane na obalo, kakšen prevoz?",
      "sl",
      CONTEXT,
      { weather: NO_WEATHER }
    );
    expect(a.message).toContain("/potovanje");
    expect(a.message).toContain("od €");
  });

  test("⑩ MY TRIP / STATUS REZERVACIJE: ZUNANJA semantika, NIKOLI 'potrjeno'", async () => {
    const a = await buildDomainAnswer(
      "Kakšen je status moje rezervacije?",
      "sl",
      CONTEXT,
      { weather: NO_WEATHER }
    );
    expect(a.message).toContain("ZUNANJA");
    expect(a.message).toContain("NIKOLI");
    expect(a.message).not.toMatch(/(?<!NIKOLI ")potrjeno(?!")/);
    expect(a.message).toContain("ne izmišljujemo");
  });

  test("⑪ RAZPOLOŽLJIVOST: NEZNANO — nikoli izmišljeni prosti termini", async () => {
    const a = await buildDomainAnswer(
      "So termini razpoložljivi?",
      "sl",
      CONTEXT,
      { weather: NO_WEATHER }
    );
    expect(a.message).toContain("NEZNANO");
    expect(a.message).toContain("ne izmišljujemo");
    expect(a.message).not.toContain("prosti termini:");
  });
});

describe("chat-domain-fallback — enrichment in dvojezičnost", () => {
  test("⑫ enricher: vrstice destinacije iz baze se dodajo pred featured", async () => {
    const enrichedListing: DomainListing = {
      name: "Piranska konoba",
      category: "restaurant",
      destinationName: "Piran",
      description: "Konoba v pristanišču.",
      rating: 4.6,
      priceRange: "€€",
    };
    const a = await buildDomainAnswer(
      "Kje lahko jedem v Piranu?",
      "sl",
      { ...CONTEXT, osmPlaces: [] }, // brez OSM → pride do baze
      {
        weather: NO_WEATHER,
        enrich: async (name) => {
          expect(name).toBe("Piran");
          return {
            listings: [enrichedListing],
            products: [],
            experiences: [],
          };
        },
      }
    );
    expect(a.message).toContain("Piranska konoba");
    expect(a.message).toContain("Gostilna Pri Piranu"); // featured tudi ostane
  });

  test("⑬ enricher napaka (baza pada) NE podre odgovora", async () => {
    const a = await buildDomainAnswer("Kaj videti v Piranu?", "sl", CONTEXT, {
      weather: NO_WEATHER,
      enrich: async () => {
        throw new Error("db down");
      },
    });
    expect(a.message).toContain("Piran"); // osnovni podatki destinacije kljub temu
  });

  test("⑭ EN jezik: angleški odgovor z enakimi realnimi podatki (brez omembe AI)", async () => {
    const a = await buildDomainAnswer(
      "Where can I eat in Piran?",
      "en",
      CONTEXT,
      { weather: NO_WEATHER }
    );
    expect(a.message).toContain("Restavracija Nejc");
    expect(a.message).toContain("community data");
    expect(a.message).not.toContain("AI");
  });

  test("⑮ pozdrav: kratek pozdrav z realnimi primeri vprašanj (38 destinacij)", async () => {
    const a = await buildDomainAnswer("Pozdravljen!", "sl", CONTEXT, {
      weather: NO_WEATHER,
    });
    expect(a.message).toContain("Pozdravljen");
    expect(a.message).toContain(`${DESTINATIONS.length}`);
    expect(a.message).toContain("Ljubljani");
  });
});

describe("chat-domain-fallback — OSM napaka (zunanja storitev down)", () => {
  test("⑯ kraj je bil IMENOVAN, OSM pa prazno → izrecno 'ni uspelo pridobiti' (NE sprašuje po kraju, ki ga uporabnik ravno povedal)", async () => {
    const a = await buildDomainAnswer(
      "Kje lahko jedem v Piranu?",
      "sl",
      { ...CONTEXT, osmPlaces: [] },
      { weather: NO_WEATHER }
    );
    expect(a.message).toContain("ni uspelo pridobiti");
    expect(a.message).toContain("OpenStreetMap");
    expect(a.message).not.toContain("Povej mi, kateri kraj te zanima");
    // Realni podatki destinacije kljub temu ostanejo.
    expect(a.message).toContain("Piran");
  });
});
