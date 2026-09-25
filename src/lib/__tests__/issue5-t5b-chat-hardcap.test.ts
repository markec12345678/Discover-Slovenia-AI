// ============================================================================
// ISSUE #5 / T5-B (M3, del 1) — /api/chat TRDA MEJA + KLIENTNI ABORT
// ============================================================================
// Vrzel (revizija T5-a1 #3, MEDIUM): /api/chat je bil EDINA pomembna AI pot
// brez trde meje — privzeti skupni proračun verige je 150 s, klientni fetch
// v chatbot.tsx pa NI imel AbortControllerja. Uporabnik je lahko gledal
// spinner ~2,5 minute pred deterministično domensko rezervo (živ dokaz
// tega razreda iz prejšnjih incidentov: refine 262 s, search > 400 s).
//
// Fix (T5-b2): K-5 vzorec (isti kot itinerary 70 s / refine 60 s /
// smart-search 15 s) — 25 s zunanja Promise.race meja → null → OBSTOJEČA
// domenska rezerva (buildDomainFallbackAnswer, source:"fallback");
// klient ima 30 s AbortController (pokrije mejo + gradnjo rezerve) in gre
// ob prekinitvi po obstoječi poti sporočila o nedosegljivosti.
//
// Test varuje:
//   1. source-contract: meja + race + čiščenje timera na ruti, abort na
//      klientu (vzorec fa-acceptance-fixes.test.ts),
//   2. funkcionalno: z odbijajočim omrežjem (vsi providerji odpovejo)
//      odgovor PRIDE (200, source:"fallback") — rezerva ostaja nedotaknjena.
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
// 1. Source-contract — trda meja na ruti
// ─────────────────────────────────────────────────────────────────────────

describe("T5-B/M3: /api/chat trda meja (K-5 vzorec)", () => {
  test("zunanja meja 25 s (Promise.race) okoli generateCompletion", () => {
    expect(chatRouteSrc).toContain("const chatHardCapMs = 25_000");
    expect(chatRouteSrc).toContain("Promise.race");
    expect(chatRouteSrc).toMatch(/generateCompletion\(/);
  });

  test("noga AI je vezana na skupno mejo (22 s / 25 s — globoka vrata padejo pošteno)", () => {
    expect(chatRouteSrc).toContain("timeoutMs: 22_000");
    expect(chatRouteSrc).toContain("totalBudgetMs: 25_000");
  });

  test("timer se počisti ob koncu (finally — tudi ob uspehu, brez leak-a)", () => {
    expect(chatRouteSrc).toContain("clearTimeout(chatHardCapTimer)");
    expect(chatRouteSrc).toMatch(/\.finally\(\(\)\s*=>/);
  });

  test("ob null/odpovedi ostane OBSTOJEČA domenska rezerva (source:\"fallback\")", () => {
    // vrzel je bila v ČASU, ne v rezervi — ta nesme biti dotaknjena
    expect(chatRouteSrc).toContain("buildDomainFallbackAnswer");
    expect(chatRouteSrc).toContain('source: "fallback"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Source-contract — klientni abort
// ─────────────────────────────────────────────────────────────────────────

describe("T5-B/M3: chatbot.tsx klientni abort (30 s)", () => {
  test("AbortController s timeoutom (pokrije 25 s mejo + gradnjo rezerve)", () => {
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
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Funkcionalno — z omrežjem, ki odbija VSE, odgovor vseeno PRIDE
//    (deterministična domenska rezerva; vzorec task50: NO mock.module)
// ─────────────────────────────────────────────────────────────────────────

describe("T5-B/M3: /api/chat funkcionalno — odpoved vseh AI providerjev", () => {
  const originalFetch = globalThis.fetch;
  let seq = 0;

  beforeEach(() => {
    seq += 1;
    clearProviderRateLimits();
    // VSI omrežni klicev odbijejo (z-ai SDK / OpenRouter / Gemini / Puter
    // vsi gredo čez global fetch) → generateCompletion vrne null/throw →
    // domenska rezerva. Brez Date.now zmrzovanja — trda meja ni odvisna od
    // ure, zato test ne čaka 25 s (null/throw pride takoj).
    globalThis.fetch = (async () => {
      throw new Error(`test-offline-${seq}`);
    }) as unknown as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  test("odgovor PRIDE (200) z iskreno oznako source:\"fallback\"", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // unikatni IP — rate limit (20/10 min) med testi nikoli ne pade
        "x-forwarded-for": `10.99.77.${seq}`,
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
    };
    expect(body.source).toBe("fallback");
    expect(typeof body.message === "string" && body.message.length > 0).toBe(true);
  }, 30_000);
});
