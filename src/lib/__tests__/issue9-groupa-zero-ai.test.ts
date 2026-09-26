// ============================================================================
// ISSUE #9 (ZERO-AI/deterministic-first) — GROUP A CONTRACT
// ============================================================================
// Z9-B dokazni red za skupino A (chat / smart-search / ask-local / pois):
//  (a) VSE 4 rute skupine A NE uvažajo ai-client, NE vsebujejo
//      generateCompletion in AI Promise.race — 0 runtime LLM odvisnosti;
//  (b) deterministicSearch (ČIST modul, 0 omrežja/DB/AI): ≥12 fixture-ov —
//      SL, EN, tipkarska napaka (Levenshtein ≤ 2), vzdevki → kanonska
//      kategorija, večbesedne poizvedbe, destinacijska imena + vzdevki +
//      diakritično zlaganje, id≠slug slug pogodba, prazne/kratke/
//      samo-stopbesedne poizvedbe, determinizem, limit;
//  (c) /api/ask-local: DATABASE odgovor je PRIMARNI — top-3 REALNE vrstice
//      baze v odgovoru, answerSource "database" (persisted + vrnjen);
//      DB-gated funkcionalno (vzorec task28: pošten skip brez baze);
//  (d) /api/pois/describe: deterministični graditelj opisa iz strukturiranih
//      polj + TRAJNI cache zapis vira "deterministic" (popravek bug-a
//      L199 — prej je cache zapis trdil "ai"); cache datoteka se v testu
//      VARNO varuje (backup → test → byte-identična restavracija).
//
// Vzorce: bun:test + readFileSync source-contract (issue9-groupc) +
// globalThis.fetch, ki odbija VSE (dokaz 0 AI omrežja, task50) +
// clearProviderRateLimits higiena (TASK 76).
// ============================================================================
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
// TASK 76 higiena: route-handler uvozi trošijo žetone deljenega omejevalnika
// runnerja → okno čistimo pred vsakim testom (konvencija suite-a).
import { clearProviderRateLimits } from "@/lib/supply/search";

const ROOT = join(import.meta.dir, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const chatRouteSrc = read("src/app/api/chat/route.ts");
const smartSearchRouteSrc = read("src/app/api/smart-search/route.ts");
const askLocalRouteSrc = read("src/app/api/ask-local/route.ts");
const poisDescribeRouteSrc = read("src/app/api/pois/describe/route.ts");
const smartSearchUiSrc = read("src/components/smart-search.tsx");
const askLocalUiSrc = read("src/components/sections/ask-local.tsx");
const chatbotUiSrc = read("src/components/chatbot.tsx");

const GROUP_A_ROUTES: Array<[string, string]> = [
  ["chat", chatRouteSrc],
  ["smart-search", smartSearchRouteSrc],
  ["ask-local", askLocalRouteSrc],
  ["pois/describe", poisDescribeRouteSrc],
];

// ---------------------------------------------------------------------------
// (a) ZERO-AI source-contract — vse 4 rute skupine A
// ---------------------------------------------------------------------------

describe("ISSUE #9 A(a): 4 rute skupine A — ZERO AI odvisnosti", () => {
  for (const [name, src] of GROUP_A_ROUTES) {
    test(`${name}: NE uvaža ai-client (0 AI klicev)`, () => {
      expect(src).not.toContain('from "@/lib/ai-client"');
      expect(src).not.toMatch(/import[^;]*ai-client/);
    });

    test(`${name}: NE vsebuje generateCompletion / AI Promise.race`, () => {
      expect(src).not.toContain("generateCompletion");
      expect(src).not.toContain("Promise.race");
    });
  }

  test("chat: domenska plast PRIMA — buildDomainAnswer + vir \"database\"", () => {
    expect(chatRouteSrc).toContain("buildDomainAnswer");
    expect(chatRouteSrc).toContain('source: "database"');
    expect(chatRouteSrc).not.toContain('source: "ai"');
    expect(chatRouteSrc).not.toContain('source: "fallback"');
    // Deterministični kontekst ostaja (baza + STO + OSM + enrichment).
    expect(chatRouteSrc).toContain("buildStoGrounding");
    expect(chatRouteSrc).toContain("fetchOverpassNearby");
  });

  test("smart-search: deterministični iskalnik + vir \"deterministic\"", () => {
    expect(smartSearchRouteSrc).toContain("deterministicSearch(");
    expect(smartSearchRouteSrc).toContain('source: "deterministic"');
    expect(smartSearchRouteSrc).not.toContain('source: "ai"');
    expect(smartSearchRouteSrc).not.toContain('source: "fallback"');
  });

  test("ask-local: DATABASE odgovor PRIMA (buildDatabaseAnswer) + answerSource \"database\"", () => {
    expect(askLocalRouteSrc).toMatch(/function buildDatabaseAnswer\(/);
    expect(askLocalRouteSrc).toContain('const answerSource = "database"');
    // NOVA vrstica se persistira SAMO pod iskrenim virom (nikoli "ai").
    expect(askLocalRouteSrc).not.toContain('answerSource: "ai"');
    expect(askLocalRouteSrc).not.toContain('answerSource: "fallback"');
    // Dnevna kvota (produkt/funnel) ostaja — Issue #9 jo namenno ohranja.
    expect(askLocalRouteSrc).toContain("DAILY_FREE_QUESTIONS = 1");
  });

  test("pois/describe: deterministični graditelj + cache zapis vira \"deterministic\"", () => {
    expect(poisDescribeRouteSrc).toMatch(/function buildPoiDescription\(/);
    // VSAK nov cache zapis nosi iskren vir (trajen popravek L199 bug-a).
    expect(poisDescribeRouteSrc).toMatch(
      /source: "deterministic",\s*\n\s*\};/
    );
    expect(poisDescribeRouteSrc).not.toContain('source: "ai",');
    // Rate limit + id regex + telesna kap + admin GET statistika ostanejo.
    expect(poisDescribeRouteSrc).toContain("rateLimit(request");
    expect(poisDescribeRouteSrc).toContain("/^[A-Za-z0-9-]{1,64}$/");
    expect(poisDescribeRouteSrc).toContain("> 32_768");
    expect(poisDescribeRouteSrc).toContain("checkAdmin(request)");
  });

  test("UI iskrenost vira: ena sama database/deterministic značka (brez AI/fallback razlik)", () => {
    // chatbot: ChatResponse.source je "database"; značka chatbot.badgeDatabase.
    expect(chatbotUiSrc).toContain('source: "database"');
    expect(chatbotUiSrc).toContain('t("badgeDatabase")');
    expect(chatbotUiSrc).not.toContain('t("badgeAI")');
    expect(chatbotUiSrc).not.toContain('t("badgeFallback")');
    // smart-search: source "deterministic", nevtralna značka (SL+EN).
    expect(smartSearchUiSrc).toContain('source: "deterministic"');
    expect(smartSearchUiSrc).toContain('"Deterministično iskanje"');
    expect(smartSearchUiSrc).toContain('"Deterministic search"');
    expect(smartSearchUiSrc).not.toContain('"ai" | "fallback"');
    // ask-local AnswerCard: "database" značka + AMBER veja za LEGACY
    // "fallback" vrstice + "Grounded AI" SAMO za legacy "ai" vrstice.
    expect(askLocalUiSrc).toContain('item.answerSource === "database"');
    expect(askLocalUiSrc).toContain('item.answerSource === "fallback"');
    expect(askLocalUiSrc).toContain("Odgovor izključno iz naše baze");
  });
});

// ---------------------------------------------------------------------------
// (b) deterministicSearch — fixture-i (SL/EN/tipkarske/vzdevki/kategorije)
// ---------------------------------------------------------------------------

import {
  deterministicSearch,
  normalize,
  tokenize,
} from "@/lib/deterministic-search";
import { DESTINATIONS } from "@/lib/slovenia-data";

/** Fiksni dataset (oblika vrstic, ki jih /api/smart-search pridobi iz baze). */
const DS = {
  listings: [
    { id: "t9ga-l1", name: "Gostilna Bled", category: "restaurant", destinationName: "Bled", description: "Domača kuhinja ob jezeru.", rating: 4.5 },
    { id: "t9ga-l2", name: "Vinska klet Vipava", category: "wine", destinationName: "Vipava", description: "Degustacija vin.", rating: 4.7 },
    { id: "t9ga-l3", name: "Mestni muzej Ljubljana", category: "museum", destinationName: "Ljubljana", description: "Zgodovina mesta.", rating: 4.3 },
    { id: "t9ga-l4", name: "Bohinj Mountain Hostel", category: "accommodation", destinationName: "Bohinj", description: "Hostel v dolini.", rating: 4.2 },
  ],
  products: [
    { id: "t9ga-p1", name: "Piranska sol", category: "souvenir", destinationName: "Piran", description: "Sol iz piranskih solin.", rating: 4.8 },
  ],
  experiences: [
    { id: "t9ga-e1", name: "Pohod na Vogel", category: "hiking", destinationName: "Bohinj", description: "Gorska tura z razgledom.", rating: 4.6 },
    { id: "t9ga-e2", name: "Degustacija v Piranu", category: "food", destinationName: "Piran", description: "Vinski večer.", rating: 4.9 },
  ],
};

describe("ISSUE #9 A(b): deterministicSearch — normalizacija/tokenizacija", () => {
  test("1. normalize: mala tiskana črka + slovensko diakritično zlaganje", () => {
    expect(normalize("Črni Kal")).toBe("crni kal");
    expect(normalize("ŠKOFJA LOKA")).toBe("skofja loka");
    expect(normalize("požrešno")).toBe("pozresno");
    expect(normalize("ĐIR")).toBe("dir");
  });

  test("2. tokenize: SL+EN stopbesede odpadejo (kaj/na/je/v/in/the/of/near …)", () => {
    expect(tokenize("kaj pojesti na bledu")).toEqual(["pojesti", "bledu"]);
    expect(tokenize("hiking near bohinj")).toEqual(["hiking", "bohinj"]);
    expect(tokenize("the food in the city")).toEqual(["food", "city"]);
  });
});

describe("ISSUE #9 A(b): deterministicSearch — fixture-i nad realnimi DESTINATIONS", () => {
  test("3. SL: \"kaj pojesti na bledu\" → Bled prva destinacija + lokal po imenu/destinaciji", () => {
    const r = deterministicSearch("kaj pojesti na bledu", DS, 3);
    expect(r.destinations[0]?.name).toBe("Bled");
    expect(r.listings.some((l) => l.name === "Gostilna Bled")).toBe(true);
  });

  test("4. EN: \"hiking near bohinj\" → Bohinj prva + izkušnja hiking kategorije", () => {
    const r = deterministicSearch("hiking near bohinj", DS, 3);
    expect(r.destinations[0]?.name).toBe("Bohinj");
    expect(r.experiences.some((e) => e.name === "Pohod na Vogel")).toBe(true);
  });

  test("5. tipkarska napaka: \"ljubljna\" → Ljubljana (Levenshtein 1) + vrstica po fuzzy imenu", () => {
    const r = deterministicSearch("ljubljna", DS, 3);
    expect(r.destinations[0]?.name).toBe("Ljubljana");
    // "Mestni muzej Ljubljana" zadeti prek fuzzy ujemanja imena/destinacije.
    expect(r.listings.some((l) => l.name === "Mestni muzej Ljubljana")).toBe(true);
    // Lažni zadetek varovalka: "piran" NE sme zamenjati za "Tirana"
    // (različna prva črka) — ločen dokaz spodaj (#12).
    expect(
      deterministicSearch("piran", DS, 3).destinations.some(
        (d) => d.name === "Tirana"
      )
    ).toBe(false);
  });

  test("6. alias → kategorija: \"vinska degustacija\" → wine (sinonimni slovar)", () => {
    const r = deterministicSearch("vinska degustacija", DS, 3);
    const hit = r.listings.find((l) => l.name === "Vinska klet Vipava");
    expect(hit).toBeTruthy();
    // Razlog je pošten: iz DEJANSKIH signalov (ključne besede + kategorija wine).
    expect(hit!.reason).toContain("kategorija: wine");
  });

  test("7. kategorija: \"muzeji\" → culture (kanon ujame vrstico kategorije museum)", () => {
    const r = deterministicSearch("muzeji", DS, 3);
    const hit = r.listings.find((l) => l.name === "Mestni muzej Ljubljana");
    expect(hit).toBeTruthy();
    expect(hit!.reason).toContain("kategorija: culture");
  });

  test("8. večbesedna SL: \"zgodovina in kultura v ljubljani\" → Ljubljana + muzej", () => {
    const r = deterministicSearch("zgodovina in kultura v ljubljani", DS, 3);
    expect(r.destinations[0]?.name).toBe("Ljubljana");
    expect(r.listings.some((l) => l.name === "Mestni muzej Ljubljana")).toBe(true);
  });

  test("9. večbesedna EN: \"museums in ljubljana\" → Ljubljana + muzej (kategorija culture)", () => {
    const r = deterministicSearch("museums in ljubljana", DS, 3);
    expect(r.destinations[0]?.name).toBe("Ljubljana");
    const hit = r.listings.find((l) => l.name === "Mestni muzej Ljubljana");
    expect(hit).toBeTruthy();
    expect(hit!.reason).toContain("kategorija: culture");
  });

  test("10. destinacija: \"piran\" → Piran prva + izdedek po destinationName", () => {
    const r = deterministicSearch("piran", DS, 3);
    expect(r.destinations[0]?.name).toBe("Piran");
    expect(r.products.some((p) => p.name === "Piranska sol")).toBe(true);
  });

  test("11. diakritika/velike črke: \"PORTOROŽ\" → Portorož; \"plitvicka jezera\" → Plitvička jezera", () => {
    expect(
      deterministicSearch("PORTOROŽ", DS, 3).destinations[0]?.name
    ).toBe("Portorož");
    expect(
      deterministicSearch("plitvicka jezera", DS, 3).destinations[0]?.name
    ).toBe("Plitvička jezera");
  });

  test("12. id ≠ slug pogodba: \"postojnska jama\" → id \"postojna\", slug \"postojnska-jama\"", () => {
    // 4 od 38 destinacij ima id ≠ slug — iskalnik vrača KANONSKI slug
    // (pogodba iz issue5-t5b-smartsearch-nav ostaja tudi po #9).
    const first = deterministicSearch("postojnska jama", DS, 3).destinations[0];
    expect(first?.id).toBe("postojna");
    expect(first?.slug).toBe("postojnska-jama");
    // Vsi vrnjeni slug-i so kanonični iz DESTINATIONS (0 izmišljenih).
    for (const d of deterministicSearch("kaj pojesti na bledu", DS, 5).destinations) {
      const canon = DESTINATIONS.find((x) => x.id === d.id);
      expect(canon).toBeTruthy();
      expect(d.slug).toBe(canon!.slug);
    }
  });

  test("13. prazna poizvedba → VSE mreže prazne (iskreno, ne privzeto)", () => {
    const r = deterministicSearch("", DS, 3);
    expect(r.destinations).toEqual([]);
    expect(r.listings).toEqual([]);
    expect(r.products).toEqual([]);
    expect(r.experiences).toEqual([]);
  });

  test("14. kratka/samo-stopbesedna poizvedba → prazno (\"a\", \"kaj je to\")", () => {
    for (const q of ["a", "kaj je to"]) {
      const r = deterministicSearch(q, DS, 3);
      expect(r.destinations).toEqual([]);
      expect(r.listings).toEqual([]);
    }
  });

  test("15. brez zadetka (gibberish) → prazne mreže, NE izmišljuje", () => {
    const r = deterministicSearch("qwxzvv", DS, 3);
    expect(r.destinations).toEqual([]);
    expect(r.listings).toEqual([]);
    expect(r.products).toEqual([]);
    expect(r.experiences).toEqual([]);
  });

  test("16. determinizem: enak vhod → enak izhod (deep equal, 2 klica)", () => {
    const a = deterministicSearch("kaj pojesti na bledu", DS, 3);
    const b = deterministicSearch("kaj pojesti na bledu", DS, 3);
    expect(a).toEqual(b);
  });

  test("17. limit: največ N zadetkov na kategorijo (limit 2)", () => {
    const r = deterministicSearch("kaj pojesti na bledu", DS, 2);
    expect(r.destinations.length).toBeLessThanOrEqual(2);
    expect(r.listings.length).toBeLessThanOrEqual(2);
  });

  test("18. oblika izhoda: id/name/category/reason (vrstice) + id/slug/name/tagline/reason (destinacije)", () => {
    const r = deterministicSearch("piran", DS, 3);
    for (const d of r.destinations) {
      expect(typeof d.id).toBe("string");
      expect(typeof d.slug).toBe("string");
      expect(typeof d.name).toBe("string");
      expect(typeof d.tagline).toBe("string");
      expect(typeof d.reason).toBe("string");
    }
    for (const l of r.listings) {
      expect(typeof l.id).toBe("string");
      expect(typeof l.name).toBe("string");
      expect(typeof l.category).toBe("string");
      expect(typeof l.reason).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// (b+) /api/smart-search — funkcionalno (omrežje odbija VSE → 0 AI)
// ---------------------------------------------------------------------------

describe("ISSUE #9 A(b+): /api/smart-search funkcionalno — deterministično", () => {
  const originalFetch = globalThis.fetch;
  let seq = 0;
  let dbReachable = false;

  beforeAll(async () => {
    try {
      const { db } = await import("@/lib/db");
      await db.aIUsageLog.count();
      dbReachable = true;
    } catch {
      dbReachable = false;
    }
  });

  beforeEach(() => {
    seq += 1;
    clearProviderRateLimits();
    // VSI omrežni klici odbijejo — deterministični iskalnik ne potrebuje
    // NIČ od AI (dokaz: odgovor pride kljub popolni odpovedi omrežja).
    globalThis.fetch = (async () => {
      throw new Error(`test-offline-groupa-${seq}`);
    }) as unknown as typeof fetch;
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    if (!dbReachable) return;
    try {
      // Metering vrstice tega testa (feature "search", prepoznavna poizvedba).
      const { db } = await import("@/lib/db");
      await db.aIUsageLog.deleteMany({
        where: { feature: "search", metadata: { contains: "issue9ga" } },
      });
    } catch {
      // čiščenje je best-effort
    }
  });

  test("POST → 200, source \"deterministic\", kanonski slug, iskren povzetek (0 AI)", async () => {
    const { POST } = await import("@/app/api/smart-search/route");
    const res = await POST(
      new Request("http://localhost/api/smart-search", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.99.101.${seq % 250}`,
        },
        body: JSON.stringify({ query: "kaj pojesti na bledu issue9ga", limit: 3 }),
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      destinations: Array<{ id: string; slug: string; name: string; reason: string }>;
      listings: unknown[];
      products: unknown[];
      experiences: unknown[];
      summary: string;
      source: string;
    };
    expect(body.source).toBe("deterministic");
    expect(body.destinations[0]?.name).toBe("Bled");
    // slug pogodba (destSlugById.get(d.id) ?? d.id) — kanonski slug iz dataseta.
    expect(body.destinations[0]?.slug).toBe("bled");
    expect(Array.isArray(body.listings)).toBe(true);
    expect(Array.isArray(body.products)).toBe(true);
    expect(Array.isArray(body.experiences)).toBe(true);
    // Povzetek je strežniško besedilo, ki iskreno imenuje deterministično
    // iskanje (brez omembe AI).
    expect(body.summary).toContain("determinističn");
    expect(body.summary.toLowerCase()).not.toContain("ai");
  }, 30_000);

  test("POST prazna poizvedba → 400 (validacija ostaja)", async () => {
    const { POST } = await import("@/app/api/smart-search/route");
    const res = await POST(
      new Request("http://localhost/api/smart-search", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.99.102.${seq % 250}`,
        },
        body: JSON.stringify({ query: "" }),
      })
    );
    expect(res.status).toBe(400);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// (c) /api/ask-local — DATABASE odgovor (top-3 REALNE vrstice, DB-gated)
// ---------------------------------------------------------------------------

describe("ISSUE #9 A(c): /api/ask-local funkcionalno — database PRIMA", () => {
  const originalFetch = globalThis.fetch;
  const LISTING_IDS = ["issue9-ga-l1", "issue9-ga-l2", "issue9-ga-l3"];
  let dbReachable = false;
  let createdQuestionIds: string[] = [];
  let seq = 0;

  beforeAll(async () => {
    try {
      const { db } = await import("@/lib/db");
      await db.localQuestion.count();
      dbReachable = true;
      // 3 realne (testne) vrstice za Piran — kontekst za top-3 odgovor.
      await db.listing.deleteMany({ where: { id: { in: LISTING_IDS } } });
      await db.listingEvent.deleteMany({
        where: { listingId: { in: LISTING_IDS } },
      });
      for (let i = 0; i < LISTING_IDS.length; i++) {
        await db.listing.create({
          data: {
            id: LISTING_IDS[i],
            name: `Testna gostilna ${i + 1}`,
            slug: `issue9-ga-l-${i + 1}`,
            description: `Domača kuhinja z igriščem za otroke ${i + 1}.`,
            category: "restaurant",
            destinationName: "Piran",
            address: "Testna ulica 1",
            images: "[]",
            rating: 4.5,
            priceRange: "€€",
            status: "published",
          },
        });
      }
    } catch {
      dbReachable = false;
    }
  });

  beforeEach(() => {
    seq += 1;
    clearProviderRateLimits();
    globalThis.fetch = (async () => {
      throw new Error(`test-offline-groupa-ask-${seq}`);
    }) as unknown as typeof fetch;
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    if (!dbReachable) return;
    try {
      const { db } = await import("@/lib/db");
      if (createdQuestionIds.length > 0) {
        await db.localQuestion.deleteMany({
          where: { id: { in: createdQuestionIds } },
        });
      }
      // B2B tracking stranski učinek (ListingEvent + števec) — počistimo.
      await db.listingEvent.deleteMany({
        where: { listingId: { in: LISTING_IDS } },
      });
      await db.listing.deleteMany({ where: { id: { in: LISTING_IDS } } });
    } catch {
      // čiščenje je best-effort
    }
  });

  test("POST → 201, top-3 REALNE vrstice baze, answerSource \"database\", kvota 1/dan", async () => {
    if (!dbReachable) {
      // Pošten skip (vzorec task28): brez baze funkcionalne poti ni.
      expect(dbReachable).toBe(false);
      return;
    }
    const { POST } = await import("@/app/api/ask-local/route");
    const res = await POST(
      new Request("http://localhost/api/ask-local", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.99.103.${seq % 250}`,
        },
        body: JSON.stringify({
          question: "Kam z otroki v Piranu?",
          destinationName: "Piran",
          authorName: "Test",
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      success: boolean;
      question: {
        id: string;
        answer: string;
        answerSource: string;
        recommendedPartners: Array<{ name: string; kind: string }>;
      };
      freeRemaining: number;
    };
    // Odgovor je IZKLJUČNO iz baze — persistiran in vrnjen pod iskrenim virom.
    expect(body.success).toBe(true);
    expect(body.question.answerSource).toBe("database");
    createdQuestionIds.push(body.question.id);

    // TOP-3 realne vrstice: intro + 3 vrstice z • (imena, cena, ocena).
    expect(body.question.answer).toContain("Iz naše baze za Piran:");
    const bullets = body.question.answer.split("\n").filter((l) => l.startsWith("•"));
    expect(bullets.length).toBe(3);
    for (let i = 1; i <= 3; i++) {
      expect(body.question.answer).toContain(`Testna gostilna ${i}`);
    }
    expect(body.question.answer).toContain("ocena 4.5/5");
    expect(body.question.answer).toContain("Cenovni razred €€");

    // Dnevna kvota (1/dan) ostaja — ta uspeh je porabil edino vprašanje.
    expect(body.freeRemaining).toBe(0);

    // B2B flywheel: ujeta imena → priporočeni partnerji (kind "lokal").
    expect(body.question.recommendedPartners.length).toBe(3);
    expect(
      body.question.recommendedPartners.every((p) => p.kind === "lokal")
    ).toBe(true);

    // Iskrenost: odgovor ne trdi udeležbe AI.
    expect(body.question.answer).not.toContain("AI");
  }, 30_000);

  test("POST neveljavno vprašanje → 400 (validacija ostaja)", async () => {
    if (!dbReachable) {
      expect(dbReachable).toBe(false);
      return;
    }
    const { POST } = await import("@/app/api/ask-local/route");
    const res = await POST(
      new Request("http://localhost/api/ask-local", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.99.104.${seq % 250}`,
        },
        body: JSON.stringify({ question: "prekratko" }),
      })
    );
    expect(res.status).toBe(400);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// (d) /api/pois/describe — deterministični opis + cache vir (backup/restore)
// ---------------------------------------------------------------------------

describe("ISSUE #9 A(d): /api/pois/describe funkcionalno — deterministični opis", () => {
  const originalFetch = globalThis.fetch;
  const CACHE_FILE = join(ROOT, "data", "poi-descriptions.json");
  let seq = 0;
  let cacheExisted = false;
  let cacheBackup: string | null = null;

  beforeAll(() => {
    // Varno varovanje TRAJNEGA cache-a: backup → testi → byte-identična
    // restavracija (test NE sme pustiti sledi v repo datoteki).
    cacheExisted = existsSync(CACHE_FILE);
    cacheBackup = cacheExisted ? readFileSync(CACHE_FILE, "utf-8") : null;
  });

  beforeEach(() => {
    seq += 1;
    clearProviderRateLimits();
    globalThis.fetch = (async () => {
      throw new Error(`test-offline-groupa-poi-${seq}`);
    }) as unknown as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    try {
      if (cacheBackup !== null) {
        writeFileSync(CACHE_FILE, cacheBackup, "utf-8");
      } else if (existsSync(CACHE_FILE)) {
        rmSync(CACHE_FILE);
      }
    } catch {
      // best-effort restavracija
    }
  });

  function mkPost(body: unknown, ip: string): Request {
    return new Request("http://localhost/api/pois/describe", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    });
  }

  test("1. nov POI → 200, opis IZ strukturiranih polj, vir \"deterministic\"", async () => {
    const { POST } = await import("@/app/api/pois/describe/route");
    const payload = {
      id: "issue9-ga-poi",
      name: "Testni grad",
      category: "attraction",
      subcategory: "razgledni stolp",
      address: "Cesta 1, Bled",
    };
    const res = await POST(mkPost(payload, `10.99.105.${seq % 250}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      description: string;
      source: string;
      cached: boolean;
    };
    // Deterministični graditelj: `${name} — ${label} (${subcategory}) · ${address}`.
    expect(body.description).toBe(
      "Testni grad — turistična atrakcija (razgledni stolp) · Cesta 1, Bled"
    );
    expect(body.source).toBe("deterministic");
    expect(body.cached).toBe(false);
  }, 30_000);

  test("2. drugi klic isti POI → cache zadetek (perf mehanizem ostaja)", async () => {
    const { POST } = await import("@/app/api/pois/describe/route");
    const payload = {
      id: "issue9-ga-poi",
      name: "Testni grad",
      category: "attraction",
      subcategory: "razgledni stolp",
      address: "Cesta 1, Bled",
    };
    const res = await POST(mkPost(payload, `10.99.106.${seq % 250}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      description: string;
      source: string;
      cached: boolean;
    };
    expect(body.source).toBe("cache");
    expect(body.cached).toBe(true);
    expect(body.description).toBe(
      "Testni grad — turistična atrakcija (razgledni stolp) · Cesta 1, Bled"
    );
  }, 30_000);

  test("3. TRAJNI cache zapis nosi vir \"deterministic\" (popravek L199 bug-a)", () => {
    expect(existsSync(CACHE_FILE)).toBe(true);
    const store = JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as Record<
      string,
      { description: string; source: string }
    >;
    const key = Object.keys(store).find((k) => k.startsWith("issue9-ga-poi:"));
    expect(key).toBeTruthy();
    // Prej so se tudi fallback zapisi označili "ai" — zdaj je vir vedno
    // iskren "deterministic".
    expect(store[key!].source).toBe("deterministic");
    expect(store[key!].description).toContain("Testni grad");
  });

  test("4. neznana kategorija → iskrena rezerva \"zanimivost\" (brez izmišljanja)", async () => {
    const { POST } = await import("@/app/api/pois/describe/route");
    const res = await POST(
      mkPost(
        { id: "issue9-ga-poi-2", name: "Nepoznan objekt", category: "weird" },
        `10.99.107.${seq % 250}`
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { description: string; source: string };
    expect(body.description).toBe("Nepoznan objekt — zanimivost");
    expect(body.source).toBe("deterministic");
  }, 30_000);

  test("5. neveljaven id (napadalčev vnos) → 400 (hardening ostaja)", async () => {
    const { POST } = await import("@/app/api/pois/describe/route");
    const res = await POST(
      mkPost({ id: "bad id!", name: "X" }, `10.99.108.${seq % 250}`)
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Neveljaven POI id");
  }, 30_000);

  test("6. GET statistika brez admina → 401 (admin vrata ostanejo)", async () => {
    const { GET } = await import("@/app/api/pois/describe/route");
    const res = await GET(new Request("http://localhost/api/pois/describe"));
    expect(res.status).toBe(401);
  }, 30_000);
});
