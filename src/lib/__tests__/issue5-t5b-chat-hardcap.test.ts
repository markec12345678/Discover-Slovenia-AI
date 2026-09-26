// ============================================================================
// ISSUE #5 / T5-B (M3) → ISSUE #9 ZERO-AI — /api/chat: DOMENSKA PLAST PRIMA
// ============================================================================
// Zgodovina (T5-B): /api/chat je bil EDINA pomembna AI pot brez trde meje —
// fix je dodal 25 s Promise.race + klientni 30 s AbortController, padec pa
// je šel v deterministično domensko rezervo (source "fallback").
//
// Issue #9 (ZERO-AI, skupina A): AI klic je ODSTRANJEN — domenska plast
// (buildDomainAnswer) je PRIMARNA in EDINA pot. Ta test varuje novo pogodbo:
//   1. source-contract: ruta NE vsebuje ai-client/generateCompletion/
//      Promise.race (AI pot ne obstaja več), POKLIČE buildDomainAnswer in
//      odgovarja source "database";
//   2. klientni abort (30 s) ostaja kot omrežna varovalka (neškodljiv);
//   3. funkcionalno: z odbijajočim omrežjem (VSI klicev odpovejo) odgovor
//      PRIDE (200, source "database") — 0 odvisnosti od AI.
//      (Determinizem brez mock.module — globalThis.fetch zavrača VSE klice,
//      vzorec task50-scenario-automation.test.ts.)
// ============================================================================
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// TASK 76 higiena: ruta uvožena prek @/app/api → troši žetone deljenega
// omejevalnika runnerja → okno OBVEZNO počistimo (konvencija suite-a).
import { clearProviderRateLimits } from "@/lib/supply/search";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const chatRouteSrc = read("src/app/api/chat/route.ts");
const chatbotSrc = read("src/components/chatbot.tsx");

// ─────────────────────────────────────────────────────────────────────────
// 1. Source-contract — ZERO-AI na ruti (Issue #9, skupina A)
// ─────────────────────────────────────────────────────────────────────────

describe("Issue #9 ZERO-AI: /api/chat brez AI (domenska plast prima)", () => {
  test("ruta NE uvaža ai-client (0 AI odvisnosti)", () => {
    expect(chatRouteSrc).not.toContain('from "@/lib/ai-client"');
    expect(chatRouteSrc).not.toMatch(/import[^;]*ai-client/);
  });

  test("ruta NE vsebuje generateCompletion (0 LLM klicev)", () => {
    expect(chatRouteSrc).not.toContain("generateCompletion");
  });

  test("ruta NE vsebuje AI Promise.race / trde meje AI (ni kaj omejevati)", () => {
    expect(chatRouteSrc).not.toContain("Promise.race");
    expect(chatRouteSrc).not.toContain("chatHardCapMs");
  });

  test("ruta POKLIČE buildDomainAnswer (deterministični primarni odgovor)", () => {
    expect(chatRouteSrc).toContain("buildDomainAnswer");
    expect(chatRouteSrc).toMatch(/await buildDomainAnswer\(/);
  });

  test("odgovor je pošteno označen source \"database\" (nikoli ai/fallback)", () => {
    expect(chatRouteSrc).toContain('source: "database"');
    expect(chatRouteSrc).not.toContain('source: "ai"');
    expect(chatRouteSrc).not.toContain('source: "fallback"');
  });

  test("kontekst ostaja: baza + STO uzemljenje + OSM enrichment se NE sme izgubiti", () => {
    // Deterministični kontekst hrani domenski odgovor (naloga #9: "keep
    // deterministic context-building (DB queries, STO grounding, OSM
    // enrichment callbacks)").
    expect(chatRouteSrc).toContain("buildStoGrounding");
    expect(chatRouteSrc).toContain("maybeRefreshStoIndex");
    expect(chatRouteSrc).toContain("detectGeoIntent");
    expect(chatRouteSrc).toContain("fetchOverpassNearby");
    expect(chatRouteSrc).toContain("db.listing.findMany");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Source-contract — klientni abort ostaja (omrežna varovalka, neškodljiv)
// ─────────────────────────────────────────────────────────────────────────

describe("T5-B/M3 (hrešče po #9): chatbot.tsx klientni abort (30 s)", () => {
  test("AbortController s timeoutom (pokrije izjemno počasen odziv)", () => {
    expect(chatbotSrc).toContain("CHAT_FETCH_TIMEOUT_MS = 30_000");
    expect(chatbotSrc).toContain("new AbortController()");
    expect(chatbotSrc).toContain("controller.abort(), CHAT_FETCH_TIMEOUT_MS");
  });

  test("fetch nosi signal", () => {
    expect(chatbotSrc).toContain("signal: controller.signal");
  });

  test("abort timer se počisti v finally", () => {
    expect(chatbotSrc).toContain("clearTimeout(abortTimer)");
  });

  test("AbortError gre po OBSTOJEČI poti sporočila (brez novih nizov)", () => {
    // catch blok ostaja enoten — dodana je samo komentar označba
    expect(chatbotSrc).toMatch(/catch\s*\{/);
  });

  test("klientska značka vira: ena sama \"database\" značka (brez AI/fallback)", () => {
    expect(chatbotSrc).toContain('source: "database"');
    expect(chatbotSrc).toContain('t("badgeDatabase")');
    expect(chatbotSrc).not.toContain('t("badgeAI")');
    expect(chatbotSrc).not.toContain('t("badgeFallback")');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Funkcionalno — z omrežjem, ki odbija VSE, odgovor vseeno PRIDE
//    (deterministična domenska plast; vzorec task50: NO mock.module)
// ─────────────────────────────────────────────────────────────────────────

describe("Issue #9 ZERO-AI: /api/chat funkcionalno — popolnoma brez AI", () => {
  const originalFetch = globalThis.fetch;
  let seq = 0;

  beforeEach(() => {
    seq += 1;
    clearProviderRateLimits();
    // VSI omrežni klici odbijejo (z-ai SDK / OpenRouter / Gemini / Puter —
    // pa tudi Open-Meteo/Overpass — vsi gredo čez global fetch) → če bi
    // karkoli poskušalo AI (ali omrežje), bi padlo; odgovor mora priti
    // KLJUB temu iz lokalnih podatkov (baza + statika).
    globalThis.fetch = (async () => {
      throw new Error(`test-offline-${seq}`);
    }) as unknown as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  test("odgovor PRIDE (200) z iskreno oznako source:\"database\" — 0 AI klicev", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // unikatni IP — rate limit (20/10 min) med testi nikoli ne pade
        "x-forwarded-for": `10.99.78.${seq}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Kaj naj vidim na Bledu?" }],
        language: "sl",
      }),
    });
    const res = await POST(request);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      message: string;
      source: string;
      sources?: unknown[];
      places?: unknown[];
      timestamp: string;
    };
    // Oblika odgovora ostaja kompatibilna (polja, ki jih klient bere).
    expect(body.source).toBe("database");
    expect(typeof body.message === "string" && body.message.length > 0).toBe(true);
    expect(Array.isArray(body.sources)).toBe(true);
    expect(Array.isArray(body.places)).toBe(true);
    expect(typeof body.timestamp === "string").toBe(true);
    // Odgovor ne trdi udeležbe AI.
    expect(body.message).not.toContain("AI trenutno ni dosegljiv");
  }, 30_000);
});
