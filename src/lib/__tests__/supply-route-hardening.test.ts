import { describe, expect, test, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { GET } from "@/app/api/supply/search/route";
import { clearProviderRateLimits } from "@/lib/supply/search";

// ============================================================================
// TASK 44 — PRODUCTION HARDENING: /api/supply/search odpovedna izolacija
// ============================================================================
// Forenzika (živo, 18. 9. 2026): `await db.analyticsEvent.create()` v GET
// handlerju je OB sočasnem prometu na ogrevanem dev strežniku povzročal
// prekinitvene 500 (»SyntaxError: Unexpected end of JSON input« iz Next
// dev zahtevek konteksta — asinhrona napaka je ušla try/catch in bila
// pripisana odgovoru; A/B: zapis izklopljen 0/90, z zapisom 14/150).
// Popravek: telemetrija je fire-and-forget (void + lasten .catch).
//
// Ta test ima DVE plasti obrambe:
//  1. SOURCE CONTRACT — nihče ne sme ponovno vpeljati `await` pred zapisom
//     (regresijska varovalka na ravni izvorne kode).
//  2. ROUTE INTEGRACIJA — GET handler dejansko vrne veljaven odgovor z
//     realnim datasetom (kiwitaxi plast iz data/), ne da bi karkoli vrglo
//     neprebujeno izjemo.
// ============================================================================

const ROUTE_SRC = readFileSync(
  new URL("../../app/api/supply/search/route.ts", import.meta.url),
  "utf-8"
);

// TASK 76: GET integracija dejansko poganja searchSupply — runner-jev
// omejevalnik je module state, deljen med datotekami suite-a.
beforeEach(() => {
  clearProviderRateLimits();
});

describe("TASK 44: telemetrija supply poizvedbe je ODVOJENA od odgovora", () => {
  test("SOURCE CONTRACT: zapis je fire-and-forget — NI `await writeSupplyQueryAnalytics`", () => {
    expect(ROUTE_SRC).toMatch(/void writeSupplyQueryAnalytics\(/);
    expect(ROUTE_SRC).not.toMatch(/await writeSupplyQueryAnalytics\(/);
  });

  test("SOURCE CONTRACT: klic nosi lastni .catch (globinska obramba pred odstranitvijo notranjega try/catch)", () => {
    expect(ROUTE_SRC).toMatch(/writeSupplyQueryAnalytics\([^)]*\)\.catch\(/);
  });

  test("SOURCE CONTRACT: zapis je v ločeni funkciji z notranjim try/catch (vsaka napaka ujeta znotraj)", () => {
    expect(ROUTE_SRC).toMatch(
      /async function writeSupplyQueryAnalytics\([\s\S]*?: Promise<void>[\s\S]*?try \{[\s\S]*?\} catch \{/
    );
  });
});

describe("TASK 44: GET /api/supply/search — route integracija (realni dataset)", () => {
  test("veljavna poizvedba (transfer) → 200, produkti, ms; brez neprebujenih izjem", async () => {
    const url =
      "http://localhost/api/supply/search?bbox=46.33,14.05,46.40,14.15&zoom=12&cats=transfer&locale=sl";
    const res = await GET(new Request(url));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      products: { id: string; provider: string; type: string }[];
      adapters: { slug: string; note?: string }[];
      degraded: string[];
      ms: number;
    };

    // Realni KiwiTaxi dataset iz data/ (1494 rut; Bled viewport → kapika 48)
    expect(body.products.length).toBeGreaterThan(0);
    expect(body.products.every((p) => p.provider === "kiwitaxi")).toBe(true);
    expect(body.products.every((p) => p.type === "transfer")).toBe(true);

    // OSM se NI pognal (cats=transfer) — TASK 44: iskrena oznaka je
    // cat-gated (zoom 12 je nad pragom OSM, izvedba je padla zaradi
    // kategorij), NE pa zavajuči "zoom-gated".
    const osm = body.adapters.find((a) => a.slug === "osm");
    expect(osm?.note).toBe("cat-gated");

    // Cache-Control iz registra aktivnih adapterjev. TASK 46: aktiviral se
    // je getyourguide z cacheTtlMs 0 (pogodba vira: »access the API in
    // real-time; do not scrape … to cache its output«) → dizajn pretvori
    // CEL odgovor v no-store (iskrenost živega vira nad CDN priročnostjo;
    // OSM 10 min + kiwitaxi 24 h imata SVOJA adapterjska predpomnilnika,
    // brskalnik ima debounce 500 ms — vpliv na UX je minimalen).
    expect(res.headers.get("cache-control")).toBe("no-store");

    // Požri morebitni fire-and-forget rep — če bi analitika (iz kakršnega
    // koli razloga) vrgla SINHRONO izjemo zunaj notranjega catch-a, bi ta
    // tick javil unhandled rejection in test padel.
    await new Promise((r) => setTimeout(r, 120));

    expect(typeof body.ms).toBe("number");
    expect(body.degraded).toEqual([]);
  });

  test("neveljaven bbox → 400 (validacija PREJ iskanjem — brez stranskih učinkov)", async () => {
    const url =
      "http://localhost/api/supply/search?bbox=999,999,999,999&zoom=12&cats=transfer&locale=sl";
    const res = await GET(new Request(url));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("bbox");
  });
});

describe("TASK 44: prisma query log v dev je izklopljen (koren prekinitvenih 500)", () => {
  const DB_SRC = readFileSync(new URL("../db.ts", import.meta.url), "utf-8");

  test("SOURCE CONTRACT: privzeti log je SAMO ['error'] — query log izključno prek DSA_PRISMA_QUERY_LOG=1", () => {
    // Koren vzroka (A/B dokaz 18. 9. 2026): per-query log callback prisma
    // enginea je ob sočasnosti vrgel raw SyntaxError IZVEN try/catch →
    // Next dev pripisal odprti zahtevi → prekinitvene 500 (~13 %).
    // ON: 8/30 napak; OFF: 0/30. Produkcija ni bila nikoli prizadeta.
    expect(DB_SRC).toMatch(/log:\s*process\.env\.DSA_PRISMA_QUERY_LOG === '1'\s*\?\s*\['query',\s*'error'\]\s*:\s*\['error'\]/);
    // STARA nevarna oblika (query log vedno v dev) NE SME preživeti:
    expect(DB_SRC).not.toMatch(/NODE_ENV === 'production' \? \['error'\] : \['query', 'error'\]/);
  });
});
