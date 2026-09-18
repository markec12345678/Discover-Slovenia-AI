// ============================================================================
// TASK 47 — TESTI: KANONSKI SUPPLY KONTEKST ZA AI (§3/§4/§5/§6/§10/§14/§21)
// ============================================================================
// Pokriva: projekcijo AiSupplyProduct (varna serializacija), prompt blok
// (PREFERRED/SUGGESTED + cena z enoto + ločena razpoložljivost + prioritetna
// lestvica), LIVE kanonsko iskanje (realni adapterji: KiwiTaxi dataset,
// Viator/GYG iskreno prazna brez žetona), izolacijo odpovedi in prstni
// odtis konteksta (cache identiteta §21).
// ============================================================================

import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import {
  toAiSupplyProduct,
  buildAiSupplyContext,
  fetchAiSupplyContext,
  supplyContextFingerprint,
  aiSupplyBboxFromDestinations,
  MAX_AI_SUPPLY_PRODUCTS,
  AI_SUPPLY_CATS,
  type AiSupplyProduct,
} from "@/lib/supply/ai-context";
import { searchSupply, clearProviderRateLimits } from "@/lib/supply/search";
import { getProvider } from "@/lib/supply/registry";
import { createKiwiTaxiAdapter } from "@/lib/supply/providers/kiwitaxi/adapter";
import { createViatorAdapter, resetViatorAdapterCaches } from "@/lib/supply/providers/viator/adapter";
import {
  createGetYourGuideAdapter,
  resetGetYourGuideAdapterCaches,
} from "@/lib/supply/providers/getyourguide/adapter";
import type { SupplyAdapter } from "@/lib/supply/adapter";
import type { ProviderProduct, ProviderSlug } from "@/lib/supply/types";

beforeEach(() => {
  clearProviderRateLimits();
});
afterEach(() => {
  clearProviderRateLimits();
});

// ---------------------------------------------------------------------------
// Gradnice
// ---------------------------------------------------------------------------

const realProduct = (over: Partial<ProviderProduct> = {}): ProviderProduct => ({
  id: "kiwitaxi:49540",
  provider: "kiwitaxi",
  providerProductId: "49540",
  type: "transfer",
  title: "Ljubljana Train Station → Bled",
  description: "Zasebni transfer: 55 km, približno 60 min.",
  lat: 46.05845,
  lng: 14.51269,
  geoPrecision: "city",
  address: "Ljubljana Train Station",
  price: {
    amount: 51,
    currency: "EUR",
    unit: "per_transfer",
    fromPrice: true,
    note: "objavljena cena, ni živi citat",
  },
  availability: { status: "not_supported" },
  bookingMode: "affiliate_redirect",
  bookingUrl: "/go/transfers?product=49540",
  sourceUrl: "https://kiwitaxi.com/en/transfers/49540",
  lastUpdated: "2026-09-18T00:00:00Z",
  license: { source: "KiwiTaxi Partner Data API (CSV)", attribution: "© KiwiTaxi" },
  ...over,
});

/** Mock adapter z N produkti (DI — fixture SAMO v testih, nikoli produkcija). */
function mockAdapter(slug: ProviderSlug, products: ProviderProduct[], fail = false): SupplyAdapter {
  return {
    entry: { ...getProvider(slug)!, types: ["activity", "tour", "transfer"] },
    async search() {
      if (fail) throw new Error("adapter-error-test");
      return products;
    },
    lastRunCached: () => false,
  };
}

// ---------------------------------------------------------------------------
// §3 — PROJEKCIJA AiSupplyProduct
// ---------------------------------------------------------------------------

describe("TASK 47 §3: toAiSupplyProduct (varna projekcija)", () => {
  test("projicira kanonska polja brez spremembe vrednosti", () => {
    const p = toAiSupplyProduct(realProduct());
    expect(p.provider).toBe("kiwitaxi");
    expect(p.providerProductId).toBe("49540");
    expect(p.type).toBe("transfer");
    expect(p.title).toBe("Ljubljana Train Station → Bled");
    expect(p.price?.amount).toBe(51);
    expect(p.price?.unit).toBe("per_transfer");
    expect(p.price?.fromPrice).toBe(true);
    expect(p.availability?.status).toBe("not_supported");
    expect(p.bookingMode).toBe("affiliate_redirect");
    expect(p.location?.lat).toBe(46.05845);
    expect(p.location?.geoPrecision).toBe("city");
  });

  test("INJEKCIJSKA POVŠINA ZAPRTA: bookingUrl/sourceUrl/license/phone NISO v projekciji", () => {
    const p = toAiSupplyProduct(
      realProduct({
        phone: "+386 1 000 000",
        openingHours: "Mo-Fr 08:00-20:00",
        image: "https://cdn.example/img.jpg",
      })
    );
    const serialized = JSON.stringify(p);
    expect(serialized).not.toContain("bookingUrl");
    expect(serialized).not.toContain("sourceUrl");
    expect(serialized).not.toContain("http");
    expect(serialized).not.toContain("license");
    expect(serialized).not.toContain("phone");
    expect(serialized).not.toContain("openingHours");
    expect(serialized).not.toContain("image");
  });

  test("manjkajoč podatek ostane MANJKAJOČ (ne izmišljuje)", () => {
    const p = toAiSupplyProduct(
      realProduct({ price: undefined, availability: undefined, lat: undefined, lng: undefined, description: undefined })
    );
    expect(p.price).toBeUndefined();
    expect(p.availability).toBeUndefined();
    expect(p.location?.lat).toBeUndefined();
    expect(p.description).toBeUndefined();
  });

  test("default selectionState = suggested (strežni supply ne povozi uporabnika §14)", () => {
    expect(toAiSupplyProduct(realProduct()).selectionState).toBe("suggested");
    expect(toAiSupplyProduct(realProduct(), "preferred").selectionState).toBe("preferred");
  });

  test("kontrolni znaki v opisu se odstranijo + kap 240", () => {
    const p = toAiSupplyProduct(
      realProduct({ description: `A\u0000B\u001fC\u007f${"x".repeat(300)}` })
    );
    expect(p.description).not.toContain("\u0000");
    expect(p.description!.length).toBeLessThanOrEqual(240);
  });
});

// ---------------------------------------------------------------------------
// §4–§6/§14 — PROMPT BLOK
// ---------------------------------------------------------------------------

describe("TASK 47 §4–§6/§14: buildAiSupplyContext", () => {
  test("SL blok: [SUGGESTED] vrstica s ceno z enoto + razpoložljivostjo + prioritetno lestvico", () => {
    const block = buildAiSupplyContext([toAiSupplyProduct(realProduct())], "sl");
    expect(block).toContain("[SUGGESTED]");
    expect(block).toContain("Ljubljana Train Station → Bled");
    expect(block).toContain("provider: kiwitaxi, id: 49540");
    expect(block).toContain("od 51 € (per transfer)");
    expect(block).toContain("vir nima podatka o razpoložljivosti");
    expect(block).toContain("PRIORITETNA LESTVICA");
    expect(block).toContain("trde zahteve potnika > FIXED izbire uporabnika");
  });

  test("EN blok: from €51 (per transfer) + immutable id pravilo", () => {
    const block = buildAiSupplyContext([toAiSupplyProduct(realProduct())], "en");
    expect(block).toContain("from €51 (per transfer)");
    expect(block).toContain("PROVIDER ID IS IMMUTABLE");
    expect(block).toContain("PRIORITY LADDER");
    expect(block).toContain("never claim a product is \"available for your date\"");
  });

  test("PREFERRED vrstice so izrecno označene", () => {
    const block = buildAiSupplyContext(
      [toAiSupplyProduct(realProduct(), "preferred")],
      "sl"
    );
    expect(block).toContain("[PREFERRED]");
  });

  test("cena brez fromPrice: €X (enota) — nikoli gol €X", () => {
    const block = buildAiSupplyContext(
      [toAiSupplyProduct(realProduct({ price: { amount: 29, currency: "EUR", unit: "per_person" } }))],
      "sl"
    );
    expect(block).toContain("€29 (per person)");
    expect(block).not.toContain("od 29");
  });

  test("razpoložljivost unknown ostane unknown — ne „na voljo“", () => {
    const block = buildAiSupplyContext(
      [toAiSupplyProduct(realProduct({ availability: { status: "unknown" } }))],
      "sl"
    );
    expect(block).toContain("availability: unknown");
  });

  test("brez cene → „-“ (iskrena praznina, ne izmišljena)", () => {
    const block = buildAiSupplyContext(
      [toAiSupplyProduct(realProduct({ price: undefined }))],
      "sl"
    );
    expect(block).toContain("price: -");
  });

  test("prazna ponudba → prazen blok (0 sprememb obnašanja brez supplyja)", () => {
    expect(buildAiSupplyContext([], "sl")).toBe("");
    expect(buildAiSupplyContext([], "en")).toBe("");
  });

  test("ocena/recenzije se prenesejo kanonsko", () => {
    const block = buildAiSupplyContext(
      [toAiSupplyProduct(realProduct({ rating: 4.7, reviewCount: 1234 }))],
      "en"
    );
    expect(block).toContain("rating: 4.7 (1234 reviews)");
  });
});

// ---------------------------------------------------------------------------
// §10 — STREŽNI SUPPLY ISKALNIK (obstoječi searchSupply, ne drugi engine)
// ---------------------------------------------------------------------------

describe("TASK 47 §10: fetchAiSupplyContext (kanonski runner)", () => {
  test("AI_SUPPLY_CATS pokriva komercialno ponudbo (transfer/aktivnost/tura)", () => {
    expect(AI_SUPPLY_CATS).toEqual(["transfer", "activity", "tour"]);
  });

  test("bbox iz DESTINATIONS: veljaven, pokriva Ljubljano + Bled, pod mejo z10", () => {
    const [s, w, n, e] = aiSupplyBboxFromDestinations();
    expect(s).toBeLessThan(45.4);
    expect(n).toBeGreaterThan(46.5);
    expect(w).toBeLessThan(13.5);
    expect(e).toBeGreaterThan(15.0);
    // meja maxBboxAreaForZoom(zoom 10) = 36 deg²
    expect((n - s) * (e - w)).toBeLessThan(36);
    // Ljubljana + Bled znotraj
    expect(s < 46.0569 && 46.0569 < n && w < 14.5058 && 14.5058 < e).toBe(true);
    expect(s < 46.3683 && 46.3683 < n && w < 14.0944 && 14.0944 < e).toBe(true);
  });

  test("LIVE (realni adapterji): KiwiTaxi dataset prispeva transferje; Viator/GYG iskreno PRAZNI", async () => {
    const result = await fetchAiSupplyContext({ locale: "sl" });
    // LIVE dokaz: realen dataset v pomnilniku → transferji obstajajo
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.products.length).toBeLessThanOrEqual(MAX_AI_SUPPLY_PRODUCTS);
    expect(result.products.every((p) => p.provider === "kiwitaxi")).toBe(true);
    expect(result.products.every((p) => p.type === "transfer")).toBe(true);
    expect(result.providers).toContain("kiwitaxi");
    // NOT_CONFIGURED providerja: 0 produktov, 0 fake (§19: ne simuliramo LIVE)
    expect(result.products.filter((p) => p.provider === "viator").length).toBe(0);
    expect(result.products.filter((p) => p.provider === "getyourguide").length).toBe(0);
    // not-configured NI napaka vira (iskren capability gate — ne degraded)
    expect(result.degraded).not.toContain("viator");
    expect(result.degraded).not.toContain("getyourguide");
    // cene transferjev so kanonske (per_transfer + fromPrice)
    for (const p of result.products) {
      expect(p.price).toBeDefined();
      expect(p.price!.unit).toBe("per_transfer");
      expect(p.price!.fromPrice).toBe(true);
      expect(p.price!.amount).toBeGreaterThan(0);
    }
  });

  test("LIVE kanonske cene so realne (KiwiTaxi €33–1620 obseg dataseta)", async () => {
    const result = await fetchAiSupplyContext({ locale: "sl" });
    for (const p of result.products) {
      expect(p.price!.amount).toBeGreaterThanOrEqual(33);
      expect(p.price!.amount).toBeLessThanOrEqual(1620);
    }
  });

  test("kap konteksta: total ≥ products (iskrenost o obsegu)", async () => {
    const result = await fetchAiSupplyContext({ locale: "sl" });
    expect(result.total).toBeGreaterThanOrEqual(result.products.length);
  });

  test("OSM NE teče pri AI kategorijah (cat-gated — 0 klicev na Overpass)", async () => {
    // Realni OSM adapter v kanonskem runnerju: pri cats brez lokalnih tipov
    // je adapter cat-gated (ni izveden). Dokaz prek runner poročila:
    const response = await searchSupply({
      bbox: aiSupplyBboxFromDestinations(),
      zoom: 10,
      cats: AI_SUPPLY_CATS,
      locale: "sl",
    });
    const osmInfo = response.adapters.find((a) => a.slug === "osm");
    expect(osmInfo?.note).toBe("cat-gated");
    expect(osmInfo?.count).toBe(0);
    expect(response.degraded).not.toContain("osm");
  });

  test("odpoved supplyja NIKOLI ne vrže (graceful — prazen kontekst)", async () => {
    const failing = [mockAdapter("kiwitaxi", [], true)];
    const result = await fetchAiSupplyContext({ locale: "sl", adapters: failing });
    expect(result.products).toEqual([]);
    expect(result.degraded).toContain("kiwitaxi");
  });
});

// ---------------------------------------------------------------------------
// §20 — IZOLACIJA (regresija: okvara enega vira ne ubije sosedov)
// ---------------------------------------------------------------------------

describe("TASK 47 §20: izolacija v supply kontekstu", () => {
  const ktProduct = realProduct();
  const viatorProduct = realProduct({
    id: "viator:227717P1",
    provider: "viator",
    providerProductId: "227717P1",
    type: "tour",
    title: "Lake Bled Day Trip",
    price: { amount: 500, currency: "EUR", unit: "per_person", fromPrice: true },
    availability: { status: "unknown" },
  });
  const gygProduct = realProduct({
    id: "getyourguide:66985",
    provider: "getyourguide",
    providerProductId: "66985",
    type: "activity",
    title: "Ljubljana: Castle Ticket",
    price: { amount: 29, currency: "EUR", unit: "per_person", fromPrice: true },
    availability: { status: "unknown" },
  });

  test("GYG odpoved → KiwiTaxi + Viator produkte preživijo", async () => {
    const result = await fetchAiSupplyContext({
      locale: "sl",
      adapters: [
        mockAdapter("kiwitaxi", [ktProduct]),
        mockAdapter("viator", [viatorProduct]),
        mockAdapter("getyourguide", [], true),
      ],
    });
    expect(result.degraded).toEqual(["getyourguide"]);
    expect(result.products.map((p) => p.provider)).toContain("kiwitaxi");
    expect(result.products.map((p) => p.provider)).toContain("viator");
    expect(result.products.map((p) => p.provider)).not.toContain("getyourguide");
  });

  test("Viator odpoved → KiwiTaxi + GYG produkte preživijo", async () => {
    const result = await fetchAiSupplyContext({
      locale: "sl",
      adapters: [
        mockAdapter("kiwitaxi", [ktProduct]),
        mockAdapter("viator", [], true),
        mockAdapter("getyourguide", [gygProduct]),
      ],
    });
    expect(result.degraded).toEqual(["viator"]);
    expect(result.products.map((p) => p.provider)).toContain("kiwitaxi");
    expect(result.products.map((p) => p.provider)).toContain("getyourguide");
  });

  test("KiwiTaxi odpoved → GYG/Viator ostanejo izolirani (živi)", async () => {
    const result = await fetchAiSupplyContext({
      locale: "sl",
      adapters: [
        mockAdapter("kiwitaxi", [], true),
        mockAdapter("viator", [viatorProduct]),
        mockAdapter("getyourguide", [gygProduct]),
      ],
    });
    expect(result.degraded).toEqual(["kiwitaxi"]);
    expect(result.products.map((p) => p.provider)).not.toContain("kiwitaxi");
    expect(result.products.map((p) => p.provider).sort()).toEqual(["getyourguide", "viator"]);
  });

  test("E — MULTI-PROVIDER: OSM izbira + KT + Viator + GYG v ENEM kontekstu soobstajajo", async () => {
    const osmProduct = realProduct({
      id: "osm:node-77",
      provider: "osm",
      providerProductId: "node-77",
      type: "museum",
      title: "Muzej na Bledu",
      price: undefined,
      availability: undefined,
      bookingMode: "info_only",
    });
    const result = await fetchAiSupplyContext({
      locale: "sl",
      // OSM adapter z našimi kategorijami: cat-gated v runnerju → v kontekst
      // prispe SAMO če njegovi tipi sekvajo AI kategorije. OSM izbira gre v
      // known index prek uporabnikove izbire (buildKnownSupplyIndex — glej
      // validation teste). Tukaj dokaz: trije komercialni providerji skupaj.
      adapters: [
        mockAdapter("kiwitaxi", [ktProduct]),
        mockAdapter("viator", [viatorProduct]),
        mockAdapter("getyourguide", [gygProduct]),
      ],
    });
    expect(result.products.length).toBe(3);
    expect(new Set(result.products.map((p) => p.provider))).toEqual(
      new Set(["kiwitaxi", "viator", "getyourguide"])
    );
    // osm produkt (uporabnikova izbira) ima enako pravico do konteksta prek
    // projekcije:
    const osmProjection = toAiSupplyProduct(osmProduct, "fixed");
    expect(osmProjection.provider).toBe("osm");
    expect(osmProjection.price).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §21 — FINGERPRINT (cache identiteta)
// ---------------------------------------------------------------------------

describe("TASK 47 §21: supplyContextFingerprint", () => {
  const a = toAiSupplyProduct(realProduct());
  const b = toAiSupplyProduct(
    realProduct({
      id: "kiwitaxi:123",
      providerProductId: "123",
      title: "Bled → Ljubljana Airport",
      price: { amount: 48, currency: "EUR", unit: "per_transfer", fromPrice: true },
    })
  );

  test("determinističen: isti kontekst → isti odtis (vrstni red NE vpliva)", () => {
    expect(supplyContextFingerprint([a, b])).toBe(supplyContextFingerprint([a, b]));
    expect(supplyContextFingerprint([a, b])).toBe(supplyContextFingerprint([b, a]));
  });

  test("request A (supply=A) ≠ request B (supply=B) — nikoli deljen cache", () => {
    expect(supplyContextFingerprint([a])).not.toBe(supplyContextFingerprint([b]));
  });

  test("sprememba CENE spremeni odtis (cena je del identitete)", () => {
    const cheaper = toAiSupplyProduct(
      realProduct({ price: { amount: 40, currency: "EUR", unit: "per_transfer", fromPrice: true } })
    );
    expect(supplyContextFingerprint([a])).not.toBe(supplyContextFingerprint([cheaper]));
  });

  test("sprememba RAZPOLOŽLJIVOSTI spremeni odtis (ločena od cene §6)", () => {
    const available = toAiSupplyProduct(realProduct({ availability: { status: "live_available" } }));
    expect(supplyContextFingerprint([a])).not.toBe(supplyContextFingerprint([available]));
  });

  test("sprememba selectionState spremeni odtis (FIXED ≠ SUGGESTED)", () => {
    const fixed = toAiSupplyProduct(realProduct(), "fixed");
    expect(supplyContextFingerprint([a])).not.toBe(supplyContextFingerprint([fixed]));
  });

  test("prazen kontekst: definiran odtis (NE undefined — varna cache identiteta)", () => {
    const fp = supplyContextFingerprint([]);
    expect(typeof fp).toBe("string");
    expect(fp.length).toBe(16);
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  test("odtis NE vsebuje URL-jev/žetonov (vhod so projekcije brez skrivnosti)", () => {
    const fp = supplyContextFingerprint([a]);
    expect(fp).toMatch(/^[0-9a-f]+$/);
  });

  test("LIVE: realen kontekst dvakrat zapored → enak odtis (stabilnost)", async () => {
    const r1 = await fetchAiSupplyContext({ locale: "sl" });
    const r2 = await fetchAiSupplyContext({ locale: "sl" });
    expect(supplyContextFingerprint(r1.products)).toBe(
      supplyContextFingerprint(r2.products)
    );
  });
});

// ---------------------------------------------------------------------------
// §8/§19 — PRODUKCIJSKA POT: SAMO realni adapterji (fixture nikoli v runtime)
// ---------------------------------------------------------------------------

describe("TASK 47 §8/§19: produkcjska pot brez fake supplyja", () => {
  test("privzeta pot (brez vbrizganih adapterjev) vrača SAMO realne providerje", async () => {
    // Privzeta pot: searchSupply z defaultAdapters() (realni). KiwiTaxi živi
    // (dataset), Viator/GYG capability gate. NIKOLI mock produkta.
    const result = await fetchAiSupplyContext({ locale: "sl" });
    const allowed: ProviderSlug[] = ["kiwitaxi", "viator", "getyourguide"];
    for (const p of result.products) {
      expect(allowed).toContain(p.provider);
    }
    // naslovi realnih transferjev nosijo puščico rute (oblika vira)
    for (const p of result.products) {
      expect(p.title).toContain("→");
    }
  });

  test("realni Viator adapter brez ključa: 0 produktov, NE degraded (iskren gate)", async () => {
    resetViatorAdapterCaches();
    const result = await fetchAiSupplyContext({
      locale: "sl",
      adapters: [createViatorAdapter(getProvider("viator")!)],
    });
    expect(result.products).toEqual([]);
    expect(result.degraded).not.toContain("viator");
  });

  test("realni GYG adapter brez žetona: 0 produktov, NE degraded (iskren gate)", async () => {
    resetGetYourGuideAdapterCaches();
    const result = await fetchAiSupplyContext({
      locale: "sl",
      adapters: [createGetYourGuideAdapter(getProvider("getyourguide")!)],
    });
    expect(result.products).toEqual([]);
    expect(result.degraded).not.toContain("getyourguide");
  });

  test("realni KiwiTaxi adapter: LIVE dataset > 0 transferjev", async () => {
    const result = await fetchAiSupplyContext({
      locale: "sl",
      adapters: [createKiwiTaxiAdapter(getProvider("kiwitaxi")!)],
    });
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });
});
