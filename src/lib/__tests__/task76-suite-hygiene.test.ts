// ============================================================================
// TASK 76 — HIGIENA SUITE-A: deljeni omejevalnik runnerja (trajna varovalka)
// ============================================================================
// Forenzika (živo, 21. 9. 2026): bun test poganja VSE datoteke suite-a v
// ENEM procesu → module-level stanje se deli med datotekami. Runner-jev
// drseči omejevalnik (providerRateLimited v supply/search.ts) je take
// stanje: vsak searchSupply klic — neposreden ALI posreden prek
// POST /api/itinerary → fetchAiSupplyContext → searchSupply(defaultAdapters)
// ali planJourney(...) — porabi žeton providerja (60 s okno, kap iz registra).
//
// Pred popravkom so route-testi (task51-routing-failure 13 + task53 3 +
// task51-geo-coherence 4 = 20/20 kapa viatorja) izpraznili okno, preden je
// prišel viator-adapter.test.ts na vrst → njegova opazka je bila
// „rate-limited“ namesto „not-configured“ (2 padca v polnem suite-u,
// posamično 32/32 zeleno — klasična kontaminacija med datotekami, ne
// časovna anomalija).
//
// KONVENCIJA (trajna): vsaka testna datoteka, ki USTVARJA žetone — torej
// vsebuje `searchSupply(`, uvozi route handler (`@/app/api/`) ali pokliče
// `planJourney(` — MORA referencirati clearProviderRateLimits (uvoz +
// klic v beforeEach/afterEach). Ta varovalka preverja konvencijo nad
// IZVORNO KODO suite-a: nov test, ki bi žetone puščal naslednjim
// datotekam, pade TUKAJ z jasnim sporočilom.
// ============================================================================
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

const TESTS_DIR = new URL("./", import.meta.url);

const files = readdirSync(TESTS_DIR).filter((f) => f.endsWith(".test.ts"));

/** Vzorci, pri katerih datoteka NEDVOMNO sproži searchSupply (žetoni). */
const TOKEN_TRIGGERS: RegExp[] = [
  /searchSupply\(/, // neposreden klic runnerja
  /@\/app\/api\//, // route-handler integracija (handlerji poganjajo runner)
  /planJourney\(/, // orchestrator (brez vbrizganih adapterjev → defaultAdapters)
];

function tokenConsumingFiles(): string[] {
  return files.filter((f) => {
    const src = readFileSync(new URL(f, TESTS_DIR), "utf-8");
    return TOKEN_TRIGGERS.some((re) => re.test(src));
  });
}

describe("TASK 76: higiena suite-a — deljeni omejevalnik runnerja", () => {
  test("SOURCE CONTRACT: datoteke, ki trošijo žetone, ČISTijo okno (clearProviderRateLimits)", () => {
    const violators = tokenConsumingFiles().filter((f) => {
      const src = readFileSync(new URL(f, TESTS_DIR), "utf-8");
      return !src.includes("clearProviderRateLimits");
    });
    expect(violators).toEqual([]);
    if (violators.length > 0) {
      console.error(
        `TASK 76: te datoteke sprožijo searchSupply (neposredno ali prek route/planJourney), a NE čistijo deljenega okna omejevalnika:\n${violators
          .map((f) => `  - ${f}`)
          .join("\n")}\nDodaj: import { clearProviderRateLimits } from "@/lib/supply/search" + klic v beforeEach/afterEach.`
      );
    }
  });

  test("VAROVALKA JE ŽIVA: vzorci zajamejo znane trošilce (≥ 15 datotek)", () => {
    // Če bi vzorce preimenovali (searchSupply → *), bi prvi test prazno
    // zeleno mineval (0 pravnih kršiteljev) — ta živostna kontrola zagotovi,
    // da varovalka dejansko nekaj preverja.
    expect(tokenConsumingFiles().length).toBeGreaterThanOrEqual(15);
  });

  test("SAMO-ZAŠČITA: suite ima vsaj 50 testnih datotek (obseg skeniranja)", () => {
    expect(files.length).toBeGreaterThanOrEqual(50);
  });
});
