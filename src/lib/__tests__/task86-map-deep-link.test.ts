// TASK 86 — geo glob-povezava: javni listing modal → /zemljevid (query
// lat/lng/zoom/label) → zlati poudarni marker. Zapre javni tok TASK 85
// (partner vnese koordinati → popotnik v imeniku klikne "Prikaži na
// zemljevidu" → zemljevid se odpre točno na lokaciji lokala).
//
// SOURCE-CONTRACT vzorec (readFileSync dejanskih datotek) — varovalka
// pred nehote odstranjeno glob podporo ali XSS escapanjem.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("TASK 86: source-contract — map-view glob query podpora", () => {
  const src = source("src/components/sections/map-view.tsx");

  test("client-only query parse (URLSearchParams v leaflet init useEffect)", () => {
    expect(src).toContain("new URLSearchParams(window.location.search)");
    expect(src).toContain('q.get("lat")');
    expect(src).toContain('q.get("lng")');
    expect(src).toContain('q.get("zoom")');
    expect(src).toContain('q.get("label")');
  });

  test("trda geo vrata: ±90/±180 + null island (0,0) zavrnjen (kot supply)", () => {
    expect(src).toContain("Math.abs(qLat) <= 90");
    expect(src).toContain("Math.abs(qLng) <= 180");
    expect(src).toContain("!(qLat === 0 && qLng === 0)");
    expect(src).toContain("Number.isFinite(qLat)");
  });

  test("zoom clamp [10, 16] — glob povezava ne more raztegniti meja", () => {
    expect(src).toContain("Math.min(16, Math.max(10, qZoom))");
  });

  test("center/zoom iz query, fallback center Slovenije", () => {
    expect(src).toContain("hasGeo ? [qLat, qLng] : [46.15, 14.47]");
  });

  test("zlati poudarni marker: direktno na map (ne v grozdenje) + nad pini", () => {
    expect(src).toContain("highlight-location-marker");
    expect(src).toContain("zIndexOffset: 1000");
    expect(src).toContain(".addTo(map)");
  });

  test("label iz query je escap-an (XSS varnost — uporabniški vnos)", () => {
    // qLabel iz URL NE SME ne-escapan v popup HTML (lokalni escapeHtml)
    expect(src).toContain("qLabel ? escapeHtml(qLabel)");
    // in lokalni escapeHtml obstaja (5 znakov: & < > " ')
    expect(src).toContain('function escapeHtml(s: string)');
  });
});

describe("TASK 86: source-contract — listing-modal geo povezava", () => {
  const src = source("src/components/sections/listing-modal.tsx");

  test("povezava Prikaži na zemljevidu SAMO ob obeh koordinatah", () => {
    expect(src).toContain("listing.lat != null && listing.lng != null");
    expect(src).toContain("Prikaži na zemljevidu");
  });

  test("href: /zemljevid?lat=&lng=&zoom=13&label= (encodeURIComponent ime)", () => {
    expect(src).toContain("/zemljevid?lat=${listing.lat}&lng=${listing.lng}");
    expect(src).toContain("zoom=13");
    expect(src).toContain("encodeURIComponent(listing.name)");
  });
});

describe("TASK 86: source-contract — javni API ne strippa geo polj", () => {
  const src = source("src/lib/public-fields.ts");

  test("toPublicListing destrukturira SAMO interna polja (lat/lng ostanejo)", () => {
    expect(src).toContain("export function toPublicListing");
    // lat/lng NE smeta biti v odstranjeni listi
    const body = src.split("export function toPublicListing")[1].split("}")[0];
    expect(body).not.toMatch(/\blat\b/);
    expect(body).not.toMatch(/\blng\b/);
    // in javni rute uporabljajo sanitizacijo
    expect(source("src/app/api/listings/route.ts")).toContain(
      "toPublicListing"
    );
  });
});
