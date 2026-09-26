import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  parseRefineCommand,
  pickDefaultDay,
} from "@/lib/refine-command-parser";
import { scoreProduct, rankProductCandidates } from "@/lib/ai-recommendations";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { Itinerary } from "@/lib/types";

const ROOT = join(__dirname, "..", "..", "..");
const source = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// ============================================================================
// ISSUE #9 — CORE GROUP: ZERO-AI source-contract + PARSER fixtureji
// (itinerary generacija, refine ukazna gramatika, plan Q&A, priporočila)
// ============================================================================

describe("ISSUE #9 CORE: source-contract — 0 AI v jedrnih poteh", () => {
  test("/api/itinerary: 0 AI — deterministični motor je kanonska pot", () => {
    const c = source("src/app/api/itinerary/route.ts");
    expect(c).not.toContain('from "@/lib/ai-client"');
    expect(c).not.toMatch(/generateCompletion\s*\(/);
    expect(c).toContain("generateDeterministicItinerary");
    // delegacija nosi IZKLJUČNO oznako "deterministic" (nikoli "fallback")
    expect(c).toContain('"deterministic"');
  });

  test("/api/itinerary/refine: 0 AI + ukazna gramatika iz parserja", () => {
    const c = source("src/app/api/itinerary/refine/route.ts");
    expect(c).not.toContain('from "@/lib/ai-client"');
    expect(c).not.toMatch(/generateCompletion\s*\(/);
    expect(c).toContain("parseRefineCommand(");
  });

  test("/api/itinerary/ask: 0 AI — computed-first + iskrena odklonitev", () => {
    const c = source("src/app/api/itinerary/ask/route.ts");
    expect(c).not.toContain('from "@/lib/ai-client"');
    expect(c).not.toMatch(/generateCompletion\s*\(/);
    expect(c).toContain('source: "computed"');
    expect(c).toContain("buildUnknownAnswer");
  });

  test("ai-recommendations: 0 AI — uteženo točkovanje (§14)", () => {
    const c = source("src/lib/ai-recommendations.ts");
    expect(c).not.toContain('from "@/lib/ai-client"');
    expect(c).not.toMatch(/generateCompletion\s*\(/);
    expect(c).toContain("scoreProduct");
    expect(c).toContain("scoreExperience");
  });

  test("ai-client.ts: SAMO vision (generateVisionCompletion + health; 0 tekstovne verige)", () => {
    const c = source("src/lib/ai-client.ts");
    expect(c).toContain("generateVisionCompletion");
    expect(c).not.toMatch(/function generateCompletion\b/);
    expect(c).not.toContain('from "openai"');
    expect(c).not.toContain("openrouter");
    expect(c).not.toContain("puter");
  });

  test("package.json: paket openai ODSTRANJEN; z-ai-web-dev-sdk ostaja (opcijski VLM)", () => {
    const pkg = JSON.parse(source("package.json"));
    expect(pkg.dependencies.openai).toBeUndefined();
    expect(pkg.dependencies["z-ai-web-dev-sdk"]).toBeTruthy();
  });

  test(".env.example: OPENROUTER/PUTER spremenljivke ODSTRANJENE (GEMINI ostane opcijsko)", () => {
    const env = source(".env.example");
    expect(env).not.toMatch(/^OPENROUTER_/m);
    expect(env).not.toMatch(/^PUTER_/m);
    expect(env).toContain("GEMINI_API_KEY");
    expect(env).toContain("OPCIJSKO");
  });

  test("generateVisionCompletion smejo uvažati SAMO ingest-image + bookings/parse", () => {
    const allowed = [
      "src/app/api/itinerary/ingest-image/route.ts",
      "src/app/api/journey/bookings/parse/route.ts",
    ];
    // brute-force scan vseh API rut po vzorcu projekta (readFileSync-safe)
    const routes = [
      "src/app/api/itinerary/route.ts",
      "src/app/api/itinerary/refine/route.ts",
      "src/app/api/itinerary/ask/route.ts",
      "src/app/api/chat/route.ts",
      "src/app/api/smart-search/route.ts",
      "src/app/api/ask-local/route.ts",
      "src/app/api/pois/describe/route.ts",
      "src/app/api/insights/route.ts",
      "src/app/api/owner/auto-tag/route.ts",
      "src/app/api/consultations/route.ts",
      "src/app/api/journey/bookings/parse/route.ts",
      "src/app/api/itinerary/ingest-image/route.ts",
      "src/app/api/reviews/route.ts",
    ];
    for (const rel of routes) {
      const c = source(rel);
      if (allowed.includes(rel)) {
        expect(c).toContain("generateVisionCompletion");
      } else {
        expect(c).not.toContain("generateVisionCompletion");
        expect(c).not.toContain('from "@/lib/ai-client"');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// REFINA — UKAZNA GRAMATIKA (Issue #9 §7): prosti jezik → tipiziran ukaz
// ---------------------------------------------------------------------------

describe("ISSUE #9 §7: parseRefineCommand — hitre akcije (SL+EN)", () => {
  test('"ceneje" → cheaper', () => {
    const cmd = parseRefineCommand("Naredi načrt ceneje", { lang: "sl" });
    expect(cmd.kind).toBe("quick-action");
    if (cmd.kind === "quick-action") expect(cmd.action).toBe("cheaper");
  });

  test('"dražje" → pricier', () => {
    const cmd = parseRefineCommand("Rad bi dražji načrt", { lang: "sl" });
    expect(cmd.kind).toBe("quick-action");
    if (cmd.kind === "quick-action") expect(cmd.action).toBe("pricier");
  });

  test('"cheaper" (EN) → cheaper', () => {
    const cmd = parseRefineCommand("Make the itinerary cheaper", { lang: "en" });
    expect(cmd.kind).toBe("quick-action");
    if (cmd.kind === "quick-action") expect(cmd.action).toBe("cheaper");
  });

  test('"manj vožnje" / "krajše" → less_driving', () => {
    for (const q of ["manj vožnje prosim", "krajša vožnja", "less driving"]) {
      const cmd = parseRefineCommand(q, { lang: "sl" });
      expect(cmd.kind).toBe("quick-action");
      if (cmd.kind === "quick-action") expect(cmd.action).toBe("less_driving");
    }
  });

  test('"več narave" → more_nature; "več hrane"/"kosilo" → more_food', () => {
    expect(parseRefineCommand("več narave", {}).kind).toBe("quick-action");
    const nature = parseRefineCommand("več narave", {});
    if (nature.kind === "quick-action") expect(nature.action).toBe("more_nature");
    const food = parseRefineCommand("dodaj kosilo", {});
    if (food.kind === "quick-action") expect(food.action).toBe("more_food");
  });

  test('"bolj aktivno"/"bolj aktiven" ( sklonsko) → more_active', () => {
    for (const q of ["bolj aktivno", "Naredi načrt bolj aktiven", "more active"]) {
      const cmd = parseRefineCommand(q, {});
      expect(cmd.kind).toBe("quick-action");
      if (cmd.kind === "quick-action") expect(cmd.action).toBe("more_active");
    }
  });

  test('"bolj mirno"/"bolj miren" → slower_pace (sklonsko)', () => {
    for (const q of ["bolj mirno", "Naredi načrt bolj miren"]) {
      const cmd = parseRefineCommand(q, {});
      expect(cmd.kind).toBe("quick-action");
      if (cmd.kind === "quick-action") expect(cmd.action).toBe("slower_pace");
    }
  });

  test('"dež"/"indoor" → rain_suitable; "družina"/"otroci" → family_friendly', () => {
    const rain = parseRefineCommand("kaj ob dežju?", {});
    if (rain.kind === "quick-action") expect(rain.action).toBe("rain_suitable");
    const fam = parseRefineCommand("za otroke prosim", {});
    if (fam.kind === "quick-action") expect(fam.action).toBe("family_friendly");
  });
});

describe("ISSUE #9 §7: parseRefineCommand — dodajanje/odstranjevanje destinacij", () => {
  test('"dodaj Bled" → add-place (kanonično ime iz datasetta)', () => {
    const cmd = parseRefineCommand("dodaj Bled", { lang: "sl" });
    expect(cmd.kind).toBe("add-place");
    if (cmd.kind === "add-place") {
      expect(cmd.placeName).toBe("Bled");
      expect(cmd.placeId).toBe("bled");
    }
  });

  test('"odstrani Bohinj" → remove-place', () => {
    const cmd = parseRefineCommand("odstrani Bohinj", { lang: "sl" });
    expect(cmd.kind).toBe("remove-place");
    if (cmd.kind === "remove-place") {
      expect(cmd.placeId).toBe("bohinj");
    }
  });

  test('"remove Piran" (EN) → remove-place', () => {
    const cmd = parseRefineCommand("remove Piran", { lang: "en" });
    expect(cmd.kind).toBe("remove-place");
  });

  test('"add Bled on day 2" → add-place + day=2', () => {
    const cmd = parseRefineCommand("add Bled on day 2", { lang: "en", daysCount: 3 });
    expect(cmd.kind).toBe("add-place");
    if (cmd.kind === "add-place") expect(cmd.day).toBe(2);
  });

  test('"dodaj Ljubljano" (sklon) → word-boundary NE zadene (iskreno unknown, ne ugiba)', () => {
    // "Ljubljano" (tožilnik) ni enako kanoničnemu "Ljubljana" — parser ne ugiba
    const cmd = parseRefineCommand("dodaj Ljubljano", { lang: "sl" });
    expect(cmd.kind).not.toBe("add-place");
  });

  test('"dodaj Postojnska jama" → add-place (večbesedno kanonično ime)', () => {
    const cmd = parseRefineCommand("dodaj Postojnska jama", { lang: "sl" });
    expect(cmd.kind).toBe("add-place");
    if (cmd.kind === "add-place") expect(cmd.placeId).toBe("postojna");
  });
});

describe("ISSUE #9 §7: parseRefineCommand — dnevni cilji + odklonitve", () => {
  test('"dan 2" → day=2; "sobota" se razreši iz tripStartDate', () => {
    const cmd = parseRefineCommand("manj vožnje dan 2", { daysCount: 3 });
    if (cmd.kind === "quick-action") expect(cmd.day).toBe(2);
    // 2026-10-05 = ponedeljek → sobota = dan 6 (nedelja=7)
    const sat = parseRefineCommand("več narave na soboto", {
      tripStartDate: "2026-10-05",
      daysCount: 7,
    });
    if (sat.kind === "quick-action") expect(sat.day).toBe(6);
  });

  test('"prestavi na soboto" → unsupported (prepoznan, a nepodprt — iskreno)', () => {
    const cmd = parseRefineCommand("prestavi Bled na soboto", {
      tripStartDate: "2026-10-05",
      daysCount: 7,
    });
    expect(cmd.kind).toBe("unsupported");
    if (cmd.kind === "unsupported") expect(cmd.matchedIntent).toBe("move-day");
  });

  test("smeti → unknown (nikoli ne ugiba)", () => {
    for (const q of ["", "x", "kjhsdfg vuhsdfg", "??"]) {
      expect(parseRefineCommand(q, {}).kind).toBe("unknown");
    }
  });

  test("DETERMINIZEM: isti vhod → isti ukaz", () => {
    const a = parseRefineCommand("ceneje dan 3", { daysCount: 5 });
    const b = parseRefineCommand("ceneje dan 3", { daysCount: 5 });
    expect(a).toEqual(b);
  });
});

describe("ISSUE #9 §7: pickDefaultDay — deterministična izbira dneva", () => {
  const it = {
    days: [
      { day: 1, locations: [{}, {}, {}] },
      { day: 2, locations: [{}] },
      { day: 3, locations: [{}, {}] },
    ],
  } as unknown as Itinerary;

  test("brez eksplicitnega dneva → dan z največ postanki (1)", () => {
    expect(pickDefaultDay(it, "more_nature")).toBe(1);
  });

  test("prazen načrt → dan 1 (fail-safe)", () => {
    expect(pickDefaultDay({ days: [] } as unknown as Itinerary, "cheaper")).toBe(1);
  });

  test("less_driving → dan z največ vožnje (geografsko najrazteznjenejši)", () => {
    const geo = {
      days: [
        {
          day: 1,
          locations: [
            { destination_id: "ljubljana" },
            { destination_id: "piran" },
          ],
        },
        {
          day: 2,
          locations: [
            { destination_id: "bled" },
            { destination_id: "bohinj" },
          ],
        },
      ],
    } as unknown as Itinerary;
    // Ljubljana→Piran (~100+ km) vs Bled→Bohinj (~20 km) → dan 1
    expect(pickDefaultDay(geo, "less_driving")).toBe(1);
  });
});

describe("ISSUE #9 §14: priporočila tržnice — uteženo točkovanje (ostanek tukaj, glavna v wave5)", () => {
  test("scoreProduct upošteva isto kategorijo/regijo/ceno (realni dataset)", () => {
    const bled = DESTINATIONS.find((d) => d.id === "bled");
    expect(bled).toBeTruthy();
    const current = {
      id: "x", name: "X", description: "", category: "activity",
      destinationName: "Gorenjska", price: 20, organic: false,
      handmade: false, local: true, vegan: false, rating: 4.5,
    };
    const near = { ...current, id: "n", price: 22, rating: 4.4 };
    const far = { ...current, id: "f", category: "food", price: 200, rating: 4.9 };
    expect(scoreProduct(current, near)).toBeGreaterThan(scoreProduct(current, far));
    expect(rankProductCandidates(current, [far, near])[0].id).toBe("n");
  });
});
