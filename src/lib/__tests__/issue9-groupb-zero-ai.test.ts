import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";

import {
  generateDeterministicInsights,
  type StatsData,
} from "@/lib/deterministic-insights";
import { suggestTags } from "@/lib/auto-tag-taxonomy";
import { getFaqForPage } from "@/lib/seo-faq";
import { buildDeterministicConsultation } from "@/lib/consultation-engine";

const ROOT = join(__dirname, "..", "..", "..");
const source = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// ============================================================================
// ISSUE #9 — GROUP B: ZERO-AI source-contract + deterministični fixtureji
// (auto-tag taksonomija, vpogledi, story lokalno, approve brez enrichmenta,
// translate/ai-story ruti ODSTRANJENI, seo-faq, konsultacija)
// ============================================================================

describe("ISSUE #9 GROUP B: source-contract — 0 AI v celotni skupini", () => {
  test("auto-tag ruta: 0 AI (brez ai-client/generateCompletion)", () => {
    const c = source("src/app/api/owner/auto-tag/route.ts");
    expect(c).not.toContain('from "@/lib/ai-client"');
    expect(c).not.toMatch(/generateCompletion\s*\(/);
  });

  test("insights ruta: 0 AI + vir vedno deterministic", () => {
    const c = source("src/app/api/insights/route.ts");
    expect(c).not.toContain('from "@/lib/ai-client"');
    expect(c).not.toMatch(/generateCompletion\s*\(/);
    expect(c).toContain('source: "deterministic"');
  });

  test("/api/translate ruta NE obstaja več (dev-only, 0 klicev)", () => {
    expect(existsSync(join(ROOT, "src/app/api/translate/route.ts"))).toBe(false);
  });

  test("/api/ai-story ruta NE obstaja več (zgodba se gradi LOKALNO)", () => {
    expect(existsSync(join(ROOT, "src/app/api/ai-story/route.ts"))).toBe(false);
  });

  test("stara /api/ai-insights ruta NE obstaja več (preimenovana v /api/insights)", () => {
    expect(existsSync(join(ROOT, "src/app/api/ai-insights/route.ts"))).toBe(false);
  });

  test("admin/approve: enrichment v ozadju ODSTRANJEN (edini ne-pregledani AI→DB zapis)", () => {
    const c = source("src/app/api/admin/approve/[id]/route.ts");
    expect(c).not.toMatch(/enrichListingInBackground\(/);
    expect(c).not.toContain('from "@/lib/ai-client"');
    // e-pošta NE trdi več "avtomatsko optimiziran z AI"
    expect(c).not.toMatch(/optimiziran z AI/i);
  });

  test("ai-story komponenta: gradi zgodbo LOKALNO (0 omrežnih klicev)", () => {
    const c = source("src/components/ai-story.tsx");
    expect(c).not.toMatch(/fetch\(\s*["'][^"']*ai-story/);
    expect(c).toContain("buildStoryLocal");
  });

  test("insights-panel konzumira /api/insights (nova pot)", () => {
    const c = source("src/components/insights-panel.tsx");
    expect(c).toContain("/api/insights");
    expect(c).not.toContain("/api/ai-insights");
  });

  test("seo-faq: 0 AI + BREZ datotečnega cache-a (nič več 90-dnevnega strupa)", () => {
    const c = source("src/lib/seo-faq.ts");
    expect(c).not.toContain('from "@/lib/ai-client"');
    expect(c).not.toMatch(/generateCompletion\s*\(/);
    expect(c).not.toMatch(/from ["']fs["']|from ["']node:fs["']/);
    expect(existsSync(join(ROOT, "data/seo-faq-cache.json"))).toBe(false);
  });

  test("consultation-engine: 0 AI + deterministični motor primarni", () => {
    const c = source("src/lib/consultation-engine.ts");
    expect(c).not.toContain('from "@/lib/ai-client"');
    expect(c).not.toMatch(/generateCompletion\s*\(/);
    expect(c).toContain("buildDeterministicConsultation");
  });
});

describe("ISSUE #9 GROUP B: auto-tag taksonomija — fixtureji (SL+EN)", () => {
  test("pohodništvo/trail (SL) → activity (slovar ključnih besed)", () => {
    const r = suggestTags({
      type: "listing",
      name: "Pohodniška pot na rodno goro",
      description: "Vodeni trail po gorski poti, srednja zahtevnost.",
    });
    expect(r.category).toBe("activity");
    expect(r.source).toBe("deterministic");
    expect(["medium", "high"]).toContain(r.confidence);
  });

  test("hiking/mountain (EN) → activity (isti slovar, oba jezika)", () => {
    const r = suggestTags({
      type: "listing",
      name: "Mountain hiking guide",
      description: "Guided trail walks in the alps.",
    });
    expect(r.category).toBe("activity");
  });

  test("pizzeria/italijanska (SL) → restaurant", () => {
    const r = suggestTags({
      type: "listing",
      name: "Pizzeria Toni",
      description: "Italijanska hrana, pizza iz krušne peči.",
    });
    expect(r.category).toBe("restaurant");
  });

  test("hotel/nastanitev → hotel", () => {
    const r = suggestTags({
      type: "listing",
      name: "Hotel Park",
      description: "Nastanitev z zajtrkom v centru.",
    });
    expect(r.category).toBe("hotel");
  });

  test("vino/degustacija (SL) → wine (izdelek)", () => {
    const r = suggestTags({
      type: "product",
      name: "Refošk vrhunski",
      description: "Rdeče vino za degustacijo, suho.",
    });
    expect(r.category).toBe("wine");
    expect(r.source).toBe("deterministic");
  });

  test("family winery tour (EN) → tasting (izkušnja)", () => {
    const r = suggestTags({
      type: "experience",
      name: "Family winery tour with tasting",
      description: "Visit a local winery and taste five wines.",
    });
    expect(r.category).toBe("tasting");
  });

  test("wellness/sauna/terme → wellness", () => {
    const r = suggestTags({
      type: "listing",
      name: "Terme Olimia",
      description: "Wellness center z savno in bazeni.",
    });
    expect(r.category).toBe("wellness");
  });

  test("0 zadetkov → honest 'low' + privzeta kategorija (ne ugiba)", () => {
    const r = suggestTags({
      type: "listing",
      name: "Zzz qqq",
      description: "Xyz.",
    });
    expect(r.confidence).toBe("low");
    expect(r.source).toBe("deterministic");
    expect(r.category).toBeTruthy();
  });

  test("DETERMINIZEM: isti vhod → isti izhod", () => {
    const body = { type: "listing" as const, name: "Gostilna pri lipi", description: "Domača hrana in vino." };
    expect(suggestTags(body)).toEqual(suggestTags(body));
  });
});

describe("ISSUE #9 GROUP B: vpogledi — deterministična pravila", () => {
  const baseStats: StatsData = {
    totalListings: 40,
    totalOwners: 10,
    premiumOwners: 4,
    enterpriseOwners: 1,
    freeOwners: 5,
    mrr: 1096,
    churnRate: 2,
    totalViews: 1000,
    totalClicks: 100,
    totalAiRecs: 1000,
    leads7d: 0,
    leads30d: 0,
    topCategories: [{ category: "restaurant", count: 12 }],
    topRegions: [],
    type: "admin",
  };

  test("churn > 5 % → anomalija (high priority)", () => {
    const r = generateDeterministicInsights({ ...baseStats, churnRate: 8 }, "admin");
    const churn = r.insights.find((i) => i.title.includes("churn"));
    expect(churn).toBeDefined();
    expect(churn?.type).toBe("anomaly");
    expect(churn?.priority).toBe("high");
    expect(r.source).toBe("deterministic");
  });

  test("freeOwners > 70 % → priložnost", () => {
    const r = generateDeterministicInsights(
      { ...baseStats, totalOwners: 10, freeOwners: 8, premiumOwners: 2 },
      "admin"
    );
    expect(r.insights.some((i) => i.type === "opportunity")).toBe(true);
  });

  test("MRR trend je VEDNO prisoten (izračun iz realnih paketov)", () => {
    const r = generateDeterministicInsights(baseStats, "admin");
    expect(r.insights.some((i) => i.title.includes("MRR"))).toBe(true);
  });

  test("top kategorija iz agregatov + CTR stavek", () => {
    const r = generateDeterministicInsights(baseStats, "admin");
    expect(r.insights.some((i) => i.title.includes("restaurant"))).toBe(true);
    expect(r.insights.some((i) => i.description.includes("CTR"))).toBe(true);
  });

  test("owner: free paket → upsell; CTR < 5 % @ >100 ogledov → anomalija", () => {
    const r = generateDeterministicInsights(
      {
        ...baseStats,
        type: "owner",
        ownerPlan: "free",
        ownerListings: 5,
        ownerViews: 500,
        ownerClicks: 10,
      },
      "owner"
    );
    expect(r.insights.some((i) => i.title.includes("Premium"))).toBe(true);
    expect(r.insights.some((i) => i.type === "anomaly")).toBe(true);
  });

  test("DETERMINIZEM + kap 5 vpogledov", () => {
    const a = generateDeterministicInsights(baseStats, "admin");
    const b = generateDeterministicInsights(baseStats, "admin");
    expect(a).toEqual(b);
    expect(a.insights.length).toBeLessThanOrEqual(5);
  });
});

describe("ISSUE #9 GROUP B: seo-faq — graditelj iz realnih podatkov", () => {
  test("bled things-to-do: 4 FAQ, odgovori iz REALNIH aktivnosti dataseta", async () => {
    const r = await getFaqForPage("bled", "Bled", "things-to-do");
    expect(r.faqs.length).toBe(4);
    expect(r.source).toBe("deterministic");
    // vsa vprašanja vsebujejo ime destinacije (šablona iz realnega imena)
    expect(r.faqs.every((f) => f.question.length > 10)).toBe(true);
  });

  test("ljubljana things-to-do: dejstva, ne izumi (source deterministic)", async () => {
    const r = await getFaqForPage("ljubljana", "Ljubljana", "things-to-do");
    expect(r.source).toBe("deterministic");
    expect(r.faqs.length).toBeGreaterThan(0);
    expect(r.faqs.every((f) => f.answer.trim().length > 0)).toBe(true);
  });

  test("neznana destinacija → iskrene splošne predloge (ne sesuje se)", async () => {
    const r = await getFaqForPage("ne-obstaja", "Nikjer", "things-to-do");
    expect(r.source).toBe("deterministic");
    expect(r.faqs.length).toBeGreaterThan(0);
  });
});

describe("ISSUE #9 GROUP B: konsultacija — deterministični motor", () => {
  const ctx = {
    destinationSummary:
      "Bled — blejsko jezero z gradom in otočkom, alpsko okolje.",
    items: [
      {
        id: "e1",
        kind: "experience",
        name: "Pletna vožnja po Blejskem jezeru",
        destination: "Bled",
        price: 15,
        rating: 4.8,
        durationHours: 1,
        familyFriendly: true,
        description: "Tradicionalna lesena pletna na jezeru.",
      },
      {
        id: "l1",
        kind: "listing",
        name: "Gostilna Pri jezeru",
        destination: "Bled",
        price: 25,
        rating: 4.5,
        durationHours: 2,
        familyFriendly: true,
        description: "Domača kulinartika z blejsko kremšnito.",
      },
    ] as const,
  };

  test("odgovor je 4-sekcjski načrt IZKLJUČNO iz baze (answerSource deterministic)", () => {
    const input = {
      question: "Kaj početi na Bledu z družino?",
      destinationName: "Bled",
      travelDates: "julij 2027",
      partyDescription: "2 odrasla + 2 otroka",
      budget: "srednji",
      interests: ["družina", "narava"],
    };
    const answer = buildDeterministicConsultation(input, ctx as never);
    expect(typeof answer).toBe("string");
    expect(answer.length).toBeGreaterThan(100);
    // 4-sekcjska struktura iz REALNEGA konteksta (samo dejstva)
    expect(answer).toMatch(/povzetek|načrt|nasvet|rezervacij/i);
    // iskrenost: vsebina izključno iz baze (ne "AI trenutno ni dosegljiv")
    expect(answer).not.toMatch(/AI trenutno ni dosegljiv/i);
  });
});
