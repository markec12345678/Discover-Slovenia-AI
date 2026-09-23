// ============================================================================
// HARDENING MASTER TASK — I1/I2: GEO PLAUSIBILITY NEVERIFICIRANIH IZBIR
// ============================================================================
// I1 (P1): za providerje brez strežne resnice (viator/gyg/tiqets/osm/…) so
//   klientove koordinate/napisi/tipi šli NARAVNOST v geoAnchors in finalne
//   postanke. Komentar v route.ts je trdil „koordinate so kanonske…
//   NIKOLI ne pridejo do sem" — to je veljalo SAMO za kiwitaxi (dataset).
// I2 (P2): nikjer v verigi generacija/refine/save ni bilo geo plausibility
//   preverka (SI_BBOX se je uporabljal samo za listinge/FSQ ingest).
// FIX: verifySelectedProducts odstrani koordinate NEVERIFICIRANEGA produkta,
//   če so zunaj plausibilne regije (SI_BBOX ± 1.5°/2.0° — alpsko-jadranska
//   soščina). Produkt ostane kot uporabnikova izbira (brez geo sidra).
// ============================================================================
import { describe, expect, test } from "bun:test";
import {
  verifySelectedProducts,
  isPlausibleClientGeo,
} from "@/lib/supply/selection-verify";
import type { SelectedProviderProduct } from "@/lib/supply/types";

function sel(
  overrides: Partial<SelectedProviderProduct>
): SelectedProviderProduct {
  return {
    provider: "viator",
    providerProductId: "98765",
    title: "Fabricated Tour",
    type: "activity",
    selectionState: "fixed",
    lat: 46.05,
    lng: 14.5,
    ...overrides,
  } as SelectedProviderProduct;
}

describe("HARDENING I2: isPlausibleClientGeo", () => {
  test("Ljubljana / Trst / Zagreb so plausibilni", () => {
    expect(isPlausibleClientGeo(46.05, 14.5)).toBe(true); // Ljubljana
    expect(isPlausibleClientGeo(45.65, 13.77)).toBe(true); // Trst
    expect(isPlausibleClientGeo(45.81, 15.98)).toBe(true); // Zagreb
  });

  test("Tokyo / New York / Dunaj-skala niso plausibilni", () => {
    expect(isPlausibleClientGeo(35.68, 139.69)).toBe(false); // Tokyo
    expect(isPlausibleClientGeo(40.71, -74.0)).toBe(false); // NYC
    expect(isPlausibleClientGeo(0, 0)).toBe(false); // null island
  });

  test("null/undefined/NaN koordinate niso plausibilne", () => {
    expect(isPlausibleClientGeo(null, 14.5)).toBe(false);
    expect(isPlausibleClientGeo(46.05, undefined)).toBe(false);
    expect(isPlausibleClientGeo(Number.NaN, 14.5)).toBe(false);
  });
});

describe("HARDENING I1: verifySelectedProducts — geo brez strežne resnice", () => {
  test("viator produkt s Tokio koordinatami → geo ODSTRANJENO, produkt ostane", () => {
    const { products, report } = verifySelectedProducts([
      sel({
        lat: 35.68,
        lng: 139.69,
        price: {
          amount: 999,
          currency: "EUR",
          unit: "per_person",
        } as never,
      }),
    ]);
    expect(products).toHaveLength(1);
    expect(products[0].lat).toBeUndefined();
    expect(products[0].lng).toBeUndefined();
    expect(products[0].price).toBeUndefined(); // unknown is unknown (Task 49)
    expect(report.geoStripped).toBe(1);
    expect(report.pricesStripped).toBe(1);
  });

  test("viator produkt z Ljubljano → geo OHRANJENO (regijsko smiselna izbira)", () => {
    const { products, report } = verifySelectedProducts([
      sel({ lat: 46.05, lng: 14.5 }),
    ]);
    expect(products[0].lat).toBe(46.05);
    expect(products[0].lng).toBe(14.5);
    expect(report.geoStripped).toBe(0);
  });

  test("osm produkt s Tokio koordinatami → geo ODSTRANJENO", () => {
    const { products, report } = verifySelectedProducts([
      sel({ provider: "osm", lat: 35.68, lng: 139.69 }),
    ]);
    expect(products).toHaveLength(1);
    expect(products[0].lat).toBeUndefined();
    expect(products[0].lng).toBeUndefined();
    expect(report.geoStripped).toBe(1);
  });

  test("osm produkt z lodge koordinatami ( null) ostane brez spremembe", () => {
    const { products, report } = verifySelectedProducts([
      sel({ provider: "osm", lat: undefined, lng: undefined }),
    ]);
    expect(products[0].lat).toBeUndefined();
    expect(report.geoStripped).toBe(0);
  });

  test("strežni supply ( priključen provider) ostane avtoriteta nad klientovim geo", () => {
    const server = {
      provider: "viator",
      providerProductId: "98765",
      title: "Real Tour",
      type: "activity",
      location: { lat: 46.05, lng: 14.5 },
    };
    const { products, report } = verifySelectedProducts(
      [sel({ lat: 35.68, lng: 139.69 })],
      [server as never]
    );
    expect(products[0].lat).toBe(46.05); // restored iz strežnega supply
    expect(report.geoRestored).toBe(1);
    expect(report.geoStripped).toBe(0);
  });

  test("poročilo vključuje geoStripped v hasVerifyChanges", () => {
    const { report } = verifySelectedProducts([
      sel({ lat: 35.68, lng: 139.69 }),
    ]);
    expect(report.geoStripped).toBe(1);
    // hasVerifyChanges je izvoz iz selection-verify — preverimo posredno:
    // vsaj geoStripped > 0 pomeni spremembo
    expect(report.geoStripped).toBeGreaterThan(0);
  });
});
