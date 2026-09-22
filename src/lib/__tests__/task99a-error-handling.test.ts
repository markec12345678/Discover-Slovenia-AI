// ============================================================================
// TASK 99-a — NAPAKE, KI LAŽEJO O VZROKU: testi (GitHub issue #1, §15)
// ============================================================================
//
// Trije cilji (vsak pošten do uporabnika):
//
//   1. API RUTE — JSON napaka namesto surovega Next.js 500 HTML:
//      /api/destinations + /api/destinations/[slug] dobita fail-closed
//      ovojnico try/catch → { error } + 503 (vzorec journey/bookings).
//      UGOTOVITEV (doc drift issue-ja): obe poti NE dostopata do Prisma —
//      strežeta STATIČNE podatke (@/lib/slovenia-data), zato sporočili
//      iskreno govorita o destinacijah, ne o bazi. Test tudi varuje to
//      resnico (če kdaj kdaj doda Prisma, se mora spremeniti tudi besedilo).
//      Preverjene "check" rute (health/ai-health/ai/sources/api root) baze
//      ne dotikajo — njihova odsotnost try/catch NI napaka (health že ima
//      lastno 503-degraded semantiko; checkAIHealth je allSettled-defenziven).
//
//   2. USE-SUPPLY-QUERY — iskrena klasifikacija odpovedi fetcha:
//      prej je VSA odpoved obsodila OSM (degraded: ["osm"]), tudi kadar je
//      uporabnik offline. Zdaj: navigator.onLine === false ALI TypeError →
//      "client-network" (napaka ODJEMALCA, nihče ni kriv); sicer
//      "supply-unavailable" — a degraded: [] (ponudnika ne obtožimo brez
//      poštene strežniške atribucije).
//
//   3. I18N PARITETA nove oznake: "supply-unavailable" NIKOLI ni živel v
//      sl.json/en.json — človeška oznaka te napake (degradedHint) živi v
//      DVOJEZIČNI tabeli T v map-view.tsx (sl/en v enem viru). Nova oznaka
//      "client-network" (networkHint) je dodana TJA, s pariteto SL+EN —
//      enaka struktura, enaka mesta, enaka pot ključa (T.networkHint[lang]).
//
//   4. MARKETPLACE <img> — onError fallback (skrij pokvarjeno sliko,
//      ozadje bg-muted ostane kot placeholder) za vseh 7 prej nezaščitenih
//      mest; identičen slog obstoječega vzorca (supply/product-modal ~314).
//
// Stil: SOURCE-CONTRACT (branje izvorne datoteke + regex/vsebinske
// trditve) — enako kot task86/task97/task98.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/** Števec pojavitev podniza (ne-regex, dobesedno). */
function count(src: string, needle: string): number {
  return src.split(needle).length - 1;
}

/** Odstrani komentarje — pogodba velja za KODO (komentar zgodovine ni koda). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

const destinationsRoute = source("src/app/api/destinations/route.ts");
const destinationSlugRoute = source("src/app/api/destinations/[slug]/route.ts");
const supplyQuery = source("src/lib/supply/use-supply-query.ts");
const mapView = source("src/components/sections/map-view.tsx");
const marketplace = source("src/components/sections/marketplace.tsx");
const productModal = source("src/components/sections/product-modal.tsx");
const experienceModal = source("src/components/sections/experience-modal.tsx");
const supplyProductModal = source("src/components/supply/product-modal.tsx");
const lightbox = source("src/components/image-lightbox.tsx");

// ---------------------------------------------------------------------------
// 1. API RUTE — fail-closed JSON ovojnica (vzorec journey/bookings)
// ---------------------------------------------------------------------------

describe("TASK 99-a: /api/destinations — JSON napaka namesto 500 HTML", () => {
  test("ovojnica try/catch + console.error + NextResponse.json + 503", () => {
    expect(destinationsRoute).toContain("try {");
    expect(destinationsRoute).toContain("} catch (error) {");
    expect(destinationsRoute).toContain('console.error("[destinations] GET napaka:"');
    // JSON ovojnica (ne HTML): NextResponse.json z error poljem in statusom 503
    expect(destinationsRoute).toMatch(/NextResponse\.json\(\s*\{ error:/);
    expect(destinationsRoute).toContain("{ status: 503 }");
  });

  test("sporočilo je slovensko in POŠTENO (ruta nima baze → ne omenja baze)", () => {
    expect(destinationsRoute).toContain("Destinacije trenutno niso dosegljive");
    // Iskrenost: ruta ne dostopa do Prisma — sporočilo "baza ni dosegljiva"
    // bi bila LAŽ o vzroku.
    expect(destinationsRoute).not.toContain("baza");
    expect(destinationsRoute).not.toContain("Podatkovna baza");
  });

  test("uspešna pot NESPREMENJENA: isti filtri + oblika odgovora", () => {
    // select/where ekvivalent na statičnih podatkih:
    expect(destinationsRoute).toContain("let result = DESTINATIONS;");
    expect(destinationsRoute).toContain("d.region === region");
    expect(destinationsRoute).toContain("result.filter((d) => d.featured)");
    // response shape:
    expect(destinationsRoute).toContain("destinations: result,");
    expect(destinationsRoute).toContain("total: result.length,");
    // vir podatkov nespremenjen (statičen, NE prisma):
    expect(destinationsRoute).toContain('from "@/lib/slovenia-data"');
    expect(destinationsRoute).not.toContain('@/lib/db"');
  });
});

describe("TASK 99-a: /api/destinations/[slug] — JSON napaka + ohranjena 404 pot", () => {
  test("ovojnica try/catch + console.error + JSON + 503", () => {
    expect(destinationSlugRoute).toContain("try {");
    expect(destinationSlugRoute).toContain("} catch (error) {");
    expect(destinationSlugRoute).toContain('console.error("[destinations/[slug]] GET napaka:"');
    expect(destinationSlugRoute).toMatch(/NextResponse\.json\(\s*\{ error:/);
    expect(destinationSlugRoute).toContain("{ status: 503 }");
    expect(destinationSlugRoute).toContain("Destinacija trenutno ni dosegljiva");
  });

  test("uspešna pot + 404 pot NESPREMENJENI", () => {
    expect(destinationSlugRoute).toContain("getDestinationById(slug)");
    expect(destinationSlugRoute).toContain("d.slug === slug");
    expect(destinationSlugRoute).toContain('"Destination not found"');
    expect(destinationSlugRoute).toContain("{ status: 404 }");
    expect(destinationSlugRoute).toContain("return NextResponse.json({ destination });");
    expect(destinationSlugRoute).not.toContain('@/lib/db"');
  });

  test("referenčni vzorec journey/bookings ostaja (slogovna pravilnost ovojnic)", () => {
    const reference = source("src/app/api/journey/bookings/route.ts");
    expect(reference).toContain("} catch (error) {");
    expect(reference).toContain("{ status: 503 }");
  });
});

describe("TASK 99-a: 'check' rute — potrjeno BREZ prisma dostopa (ni kaj popraviti)", () => {
  test("health / ai-health / ai/sources / api root ne uvažajo @/lib/db", () => {
    const routes = [
      "src/app/api/health/route.ts",
      "src/app/api/ai-health/route.ts",
      "src/app/api/ai/sources/route.ts",
      "src/app/api/route.ts",
    ];
    for (const rel of routes) {
      // Brez neposrednega db dostopa → DB izpad these rut NE more vrniti
      // 500 (health ima lastno 503-degraded semantiko; ai-health probe so
      // allSettled; ai/sources je leksični lokalni indeks; api root je
      // statičen "Hello, world!").
      expect(source(rel)).not.toContain('@/lib/db"');
    }
  });

  test("health ima že svojo eksplicitno 503 degraded semantiko", () => {
    const health = source("src/app/api/health/route.ts");
    expect(health).toContain("degraded ? 503 : 200");
  });
});

// ---------------------------------------------------------------------------
// 2. USE-SUPPLY-QUERY — iskrena klasifikacija napak (ne obtožuj OSM)
// ---------------------------------------------------------------------------

describe("TASK 99-a: use-supply-query — konec lažne obtožbe OSM", () => {
  test("NIČ več hardcoded degraded: [\"osm\"] v odpovedi fetcha", () => {
    // Prej: VSA odpoved je obsodila OSM — tudi offline uporabnik.
    // (Štejemo samo KODO — komentarji zgodovine se ne izvajajo.)
    const code = stripComments(supplyQuery);
    expect(count(code, 'degraded: ["osm"]')).toBe(0);
    expect(code).not.toMatch(/degraded:\s*\[\s*"osm"\s*\]/);
    // Niti v katastrofalni obliki: noben "osm" niz v kodi datoteke.
    expect(count(code, '"osm"')).toBe(0);
  });

  test("loči NAPAKO ODJEMALCA: navigator.onLine + TypeError", () => {
    expect(supplyQuery).toContain("navigator.onLine === false");
    expect(supplyQuery).toContain("err instanceof TypeError");
    // SSR-varnost (typeof navigator):
    expect(supplyQuery).toContain("typeof navigator !== \"undefined\"");
  });

  test("novi iskreni kodi napake sta prisotni (union tip)", () => {
    expect(supplyQuery).toContain('"client-network"');
    expect(supplyQuery).toContain('"supply-unavailable"');
    // Tip error polja je POŠTEN union (ne svoboden string):
    expect(supplyQuery).toMatch(
      /export type SupplyLayerError = "client-network" \| "supply-unavailable";/
    );
    expect(supplyQuery).toContain("error: SupplyLayerError | null;");
  });

  test("klasifikacija: client-network ⇄ supply-unavailable (ternary v catch)", () => {
    expect(supplyQuery).toContain(
      'error: isClientNetwork ? "client-network" : "supply-unavailable",'
    );
  });

  test("odpoved fetcha NE krivi ponudnika: degraded: [] v catch poti", () => {
    expect(supplyQuery).toContain(
      'error: isClientNetwork ? "client-network" : "supply-unavailable",\n            products: [],\n            degraded: [],'
    );
  });

  test("uspešna pot NESPREMENJENA: strežniška atribucija degraded ostaja", () => {
    // Poštena atribucija sme priti LE iz strežniškega odgovora:
    expect(supplyQuery).toContain("degraded: data.degraded ?? []");
    // AbortError handling (preklic nove poizvedbe) nespremenjen:
    expect(supplyQuery).toContain('err.name === "AbortError"');
    // telemetrija + debounce + zoom vrata nespremenjeni:
    expect(supplyQuery).toContain('"supply_map_query"');
    expect(supplyQuery).toContain("SUPPLY_MIN_ZOOM");
  });
});

// ---------------------------------------------------------------------------
// 3. I18N PARITETA — oznaka "client-network" v OBEH jezikih
// ---------------------------------------------------------------------------

describe("TASK 99-a: networkHint — pariteta SL/EN (map-view tabela T)", () => {
  test("oznaka obstaja v istem imenskem prostoru kot obstoječa degradedHint", () => {
    // Obe oznaki napake sloja živita v tabeli T (dvojezični vir resnice
    // te komponente — "supply-unavailable" v sl.json/en.json NI obstajal):
    expect(mapView).toContain("degradedHint: {");
    expect(mapView).toContain("networkHint: {");
  });

  test("networkHint ima SL in EN, oba neprazna, EN ni kopija SL", () => {
    const m = mapView.match(
      /networkHint:\s*\{\s*sl:\s*"([^"]+)",\s*en:\s*"([^"]+)",\s*\}/
    );
    expect(m).not.toBeNull();
    const [sl, en] = [m?.[1] ?? "", m?.[2] ?? ""];
    expect(sl.trim().length).toBeGreaterThan(0);
    expect(en.trim().length).toBeGreaterThan(0);
    expect(en).not.toBe(sl); // resničen prevod, ne copy-paste
    // Iskrenost: SL ne obtožuje virov (ključna beseda obstoječe oznake):
    expect(sl).not.toContain("viri");
    expect(en).not.toContain("sources");
  });

  test("ista pot ključa v obeh jezikih: T.networkHint[lang] se dejansko izrise", () => {
    expect(mapView).toContain("T.networkHint[lang]");
    // Pogojna izbira besedila po kodi napake (ne po zunanjem stanju):
    expect(mapView).toContain('supply.error === "client-network"');
    // Ohranjena obstoječa oznaka za strežniške napake:
    expect(mapView).toContain("T.degradedHint[lang]");
  });

  test("consumer (ProviderPanel) varuje prazen degraded seznam — [] je varno", () => {
    const panel = source("src/components/supply/provider-panel.tsx");
    expect(panel).toContain("degraded.length > 0");
  });
});

// ---------------------------------------------------------------------------
// 4. MARKETPLACE <img> — onError fallback (skrij pokvarjeno sliko)
// ---------------------------------------------------------------------------

describe("TASK 99-a: marketplace površine — vsak <img> ima onError", () => {
  test("marketplace.tsx: 2 <img>, 2 onError (kartica izdelka + kartica izkušnje)", () => {
    expect(count(marketplace, "<img")).toBe(2);
    expect(count(marketplace, "onError")).toBe(2);
  });

  test("sections/product-modal.tsx: 3 <img>, 3 onError (velika + sličica + podobni)", () => {
    expect(count(productModal, "<img")).toBe(3);
    expect(count(productModal, "onError")).toBe(3);
  });

  test("sections/experience-modal.tsx: 3 <img>, 3 onError (velika + sličica + podobne)", () => {
    expect(count(experienceModal, "<img")).toBe(3);
    expect(count(experienceModal, "onError")).toBe(3);
  });

  test("handler slog je IDENTIČEN obstoječemu vzorcu (supply/product-modal ~314)", () => {
    const repoPattern =
      '(e.currentTarget as HTMLImageElement).style.display = "none";';
    expect(supplyProductModal).toContain(repoPattern);
    expect(count(marketplace, repoPattern)).toBe(2);
    expect(count(productModal, repoPattern)).toBe(3);
    expect(count(experienceModal, repoPattern)).toBe(3);
  });

  test("obstoječa onError mesta NISO bila dotaknjena (regresija)", () => {
    expect(count(supplyProductModal, "onError")).toBeGreaterThanOrEqual(1);
    expect(count(lightbox, "onError")).toBeGreaterThanOrEqual(1);
    // Lightbox vzorec (onError kot "loaded") ostaja:
    expect(lightbox).toContain("onError={() => setLoadedSrc(current.src)}");
  });

  test("layout/logika nespremenjena: bg-muted placeholder ostaja pod sliko", () => {
    // Skrita pokvarjena slika razkrije obstoječe bg-muted ozadje kartice:
    expect(marketplace).toContain("aspect-square w-full overflow-hidden bg-muted");
    expect(marketplace).toContain("aspect-video w-full overflow-hidden bg-muted");
    expect(productModal).toContain("aspect-video w-full overflow-hidden bg-muted");
    expect(experienceModal).toContain("aspect-video w-full overflow-hidden bg-muted");
  });
});
