// ============================================================================
// ISSUE #5 / T5-B (M6) — /api/itinerary/ingest SSRF REGRESIJSKI TESTI
// ============================================================================
// Vrzel (revizija T5-a2 #4, MEDIUM): ruta ima ročno izdelano SSRF plast
// (isBlockedHostname + ročna re-validacija preusmeritev + htmlToText) iz
// utrdb 1.33.0, a BREZ regresijskega testa na ravni route — edini test, ki
// se je dotikal ujemanja, je bil task95 (PDF cevovod). To je varnostna
// površina javne poti Start Anywhere.
//
// Testi (vzorec task50: NO mock.module — globalThis.fetchnadzor v testih):
//   1. zavrnjene zahteve (400) ŠE PREJ kot kakršen koli fetch,
//   2. preusmeritev NA ZASEBNI naslov → re-validacija → 400 (ne sledi),
//   3. uspešna stran z destinacijo → 200 z zadetki,
//   4. stran brez berljivega besedila → 422, stran brez zadetkov → 422.
// ============================================================================
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
// TASK 76 higiena: ruta uvožena prek @/app/api → troši žetone deljenega
// omejevalnika runnerja → okno OBVEZNO počistimo (konvencija suite-a).
import { clearProviderRateLimits } from "@/lib/supply/search";

const { POST } = await import("@/app/api/itinerary/ingest/route");

const originalFetch = globalThis.fetch;
let seq = 0;

function ingestRequest(url: unknown): Request {
  seq += 1;
  return new Request("http://localhost/api/itinerary/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // unikatni IP na zahtevo — rate limit (10/min) nikoli ne pade v testih
      "x-forwarded-for": `10.77.${seq % 250}.${(seq * 7) % 250}`,
    },
    body: JSON.stringify({ url }),
  });
}

afterAll(() => {
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  // TASK 76: ingest ruta integracijsko poganja supply runner (žetoni)
  clearProviderRateLimits();
});

// ─────────────────────────────────────────────────────────────────────────
// 1. Vnosi, zavrnjeni PRED fetchom (400)
// ─────────────────────────────────────────────────────────────────────────

describe("T5-B/M6: ingest — zavrnitev vnosa brez omrežja (400)", () => {
  test("manjkajoč url → 400", async () => {
    globalThis.fetch = (async () => {
      throw new Error("fetch NE SME biti klican");
    }) as unknown as typeof fetch;
    const res = await POST(ingestRequest(undefined));
    expect(res.status).toBe(400);
  });

  test("ne-URL niz → 400 (ne fetch)", async () => {
    globalThis.fetch = (async () => {
      throw new Error("fetch NE SME biti klican");
    }) as unknown as typeof fetch;
    const res = await POST(ingestRequest("to ni povezava"));
    expect(res.status).toBe(400);
  });

  test("nepodprt protokol (ftp) → 400", async () => {
    globalThis.fetch = (async () => {
      throw new Error("fetch NE SME biti klican");
    }) as unknown as typeof fetch;
    const res = await POST(ingestRequest("ftp://example.com/nekaj"));
    expect(res.status).toBe(400);
  });

  const blocked = [
    "http://localhost/skrivnost",
    "http://127.0.0.1:3000/api/health",
    "http://127.0.0.1/",
    "http://0.0.0.0/",
    "http://10.0.0.5/interno",
    "http://192.168.1.1/admin",
    "http://172.16.0.9/vm",
    "http://169.254.169.254/latest/meta-data/", // cloud metadata past
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://[::1]/", // IPv6 loopback — konservativna blokada
    "http://[::ffff:127.0.0.1]/", // IPv6-mapped IPv4 (utrdba 16-b P2)
  ];
  for (const url of blocked) {
    test(`zasebni naslov zavrnjen BREZ fetcha: ${url}`, async () => {
      globalThis.fetch = (async () => {
        throw new Error("fetch NE SME biti klican");
      }) as unknown as typeof fetch;
      const res = await POST(ingestRequest(url));
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toContain("Zasebni naslovi");
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Preusmeritev na zasebni naslov — re-validacija (ne sledi)
// ─────────────────────────────────────────────────────────────────────────

describe("T5-B/M6: ingest — preusmeritev na zasebni cilj je ponovno validirana", () => {
  test("302 → 127.0.0.2 → 400 (SSRF preko redirecta)", async () => {
    globalThis.fetch = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.2/prevzem" },
      })) as unknown as typeof fetch;
    const res = await POST(ingestRequest("https://javna-stran.si/članek"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("Zasebni naslovi");
  });

  test("relativna preusmeritev na javni cilj se izvede (2. hop doseže vsebino)", async () => {
    let hop = 0;
    globalThis.fetch = (async () => {
      hop += 1;
      if (hop === 1) {
        return new Response(null, {
          status: 301,
          headers: { location: "/koncna-stran" },
        });
      }
      return new Response(
        "<html><head><title>Bled izlet</title></head><body><p>Vodnik po Bledu in okolici z mnogo besedila, da preseže prag.</p></body></html>",
        { status: 200, headers: { "content-type": "text/html" } }
      );
    }) as unknown as typeof fetch;
    const res = await POST(ingestRequest("https://javna-stran.si/prva"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { matches?: unknown[] };
    expect(Array.isArray(body.matches)).toBe(true);
    expect((body.matches as { id?: string }[]).some((m) => m.id === "bled")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Uspešna pot — fetch → htmlToText → matchDestinationsInText
// ─────────────────────────────────────────────────────────────────────────

describe("T5-B/M6: ingest — uspešna pot s kanoničnimi zadetki", () => {
  test("stran z omembo Bleda → 200 z zadetkom + suggestion", async () => {
    globalThis.fetch = (async () =>
      new Response(
        "<html><head><title>Moje potovanje</title></head><body><p>Prvi dan obiščemo Bled, drugi dan Ljubljana in na koncu še Piran. Veliko besedila za prag.</p></body></html>",
        { status: 200, headers: { "content-type": "text/html" } }
      )) as unknown as typeof fetch;
    const res = await POST(ingestRequest("https://blog-primer.si/potovanje"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      matches: { id: string }[];
      suggestion?: unknown;
      pageTitle?: string;
    };
    const ids = body.matches.map((m) => m.id);
    expect(ids).toContain("bled");
    expect(ids).toContain("ljubljana");
    expect(ids).toContain("piran");
    expect(body.suggestion).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Iskrene zavrnitve (422) — brez izmišljevanja
// ─────────────────────────────────────────────────────────────────────────

describe("T5-B/M6: ingest — iskrene zavrnitve (422)", () => {
  test("stran s premalo besedila (<40 znakov) → 422", async () => {
    globalThis.fetch = (async () =>
      new Response("<html><body><p>kra</p></body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;
    const res = await POST(ingestRequest("https://prazna-stran.si/"));
    expect(res.status).toBe(422);
  });

  test("stran brez slovenskih destinacij → 422 z iskrenim sporočilom", async () => {
    globalThis.fetch = (async () =>
      new Response(
        "<html><head><title>Dinner in Paris</title></head><body><p>We visited Paris and London and New York City on our trip around the world this summer.</p></body></html>",
        { status: 200, headers: { "content-type": "text/html" } }
      )) as unknown as typeof fetch;
    const res = await POST(ingestRequest("https://tuji-blog.si/paris"));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("nisem prepoznal nobene slovenske destinacije");
  });

  test("nedosegljiv vir (fetch throw) → 502", async () => {
    globalThis.fetch = (async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;
    const res = await POST(ingestRequest("https://nedosegljiv-vir.si/x"));
    expect(res.status).toBe(502);
  });
});
