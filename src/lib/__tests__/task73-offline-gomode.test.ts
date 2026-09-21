// ============================================================================
// TASK 73 — OFFLINE PWA GO MODE: offline.html Go odsek + sw.js routing (1.72.0)
// ============================================================================
// offline.html je STATIČEN vir (public/) — njegova logika teče kot inline
// vanilla JS BREZ modulov, BREZ hidracije (zato je prav ta stran zanesljiva,
// ko signala ni). Testiramo DVOSLOJNO:
//   A) STATIČNE trditve o struktivi virov (offline.html + sw.js kot poslano)
//   B) IZVEDBA DEJANSKE inline skripte offline.html nad stub DOM-om:
//      izluščimo <script> vsebino in jo poganjamo z globalnimi stubi
//      document/window/localStorage/fetch/caches — preverjamo TOČNO kodo,
//      ki jo uporabniki brez povezave dobijo (ne njeno kopijo v testu).
//
// Zakaj ne JSDOM: offline.html ne potrebuje pravega brskalniškega DOM-a —
// dostopa zgolj do getElementById/textContent/innerHTML/hidden (in ga
// varovalno počisti, če elementa ni). Stub je 40 vrstic in teče v Bun.
// ============================================================================

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";

const OFFLINE_HTML = readFileSync(
  new URL("../../../public/offline.html", import.meta.url),
  "utf8"
);
const SW_JS = readFileSync(
  new URL("../../../public/sw.js", import.meta.url),
  "utf8"
);

/** Izlušči vsebino inline <script> (offline.html ima natanko enega). */
function extractScript(html: string): string {
  const m = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error("offline.html: manjka <script> blok");
  return m[1];
}

const SCRIPT = extractScript(OFFLINE_HTML);

// ---------------------------------------------------------------------------
// HARNES: stub DOM + window nad DEJANSKO skripto offline.html
// ---------------------------------------------------------------------------

interface StubElement {
  textContent: string;
  innerHTML: string;
  hidden: boolean;
  listeners: Record<string, () => void>;
  setAttribute: () => void;
  addEventListener: (type: string, fn: () => void) => void;
}

/** Vsi id-ji iz statičnega HTML (z atributom hidden, kjer je prisoten). */
function makeElements(html: string): Map<string, StubElement> {
  const els = new Map<string, StubElement>();
  for (const m of html.matchAll(/<[a-zA-Z][^>]*\bid="([^"]+)"[^>]*>/g)) {
    els.set(m[1], {
      textContent: "",
      innerHTML: "",
      hidden: /\bhidden\b/.test(m[0]),
      listeners: {},
      setAttribute() {},
      addEventListener(type: string, fn: () => void) {
        this.listeners[type] = fn;
      },
    });
  }
  return els;
}

interface RunOpts {
  /** document.cookie (NEXT_LOCALE=en → angleški vmesnik). */
  cookie?: string;
  /** Sejam localStorage (dai:go-trip, dai:my-trips …). */
  localStorage?: Record<string, string>;
  /** Item, ki ob branju VRŽE (zasebni način / poln prostor). */
  localStorageThrows?: boolean;
  /** window.caches.match (neodločeno → undefined). */
  cachesMatch?: (url: string) => Promise<unknown>;
}

interface RunCtx {
  els: Map<string, StubElement>;
  cachesCalls: string[];
  flush: () => Promise<void>;
}

/**
 * Poganja DEJANSKO inline skripto offline.html z globalnimi stubi.
 * Globala (document/window) ostanejo nameščene do konca fn() — tudi
 * asinhroni callback-i (caches.match) tečejo še proti stub DOM-u.
 */
async function runOfflineScript(
  opts: RunOpts,
  fn: (ctx: RunCtx) => Promise<void> | void
): Promise<void> {
  const els = makeElements(OFFLINE_HTML);
  const lsStore = new Map(Object.entries(opts.localStorage ?? {}));
  const cachesCalls: string[] = [];

  const documentStub = {
    cookie: opts.cookie ?? "",
    title: "",
    documentElement: { setAttribute() {} },
    getElementById: (id: string) => els.get(id) ?? null,
  };
  const windowStub = {
    localStorage: {
      getItem: (k: string) => {
        if (opts.localStorageThrows) throw new Error("QuotaExceeded");
        return lsStore.has(k) ? lsStore.get(k)! : null;
      },
      setItem: (k: string, v: string) => {
        lsStore.set(k, v);
      },
      removeItem: (k: string) => {
        lsStore.delete(k);
      },
    },
    fetch: () => Promise.resolve({ ok: false }),
    caches: opts.cachesMatch
      ? {
          match: (url: string) => {
            cachesCalls.push(url);
            return opts.cachesMatch!(url);
          },
        }
      : undefined,
    location: { reload() {} },
  };

  const g = globalThis as unknown as Record<string, unknown>;
  const prevDoc = g.document;
  const prevWin = g.window;
  g.document = documentStub;
  g.window = windowStub;
  try {
    // Strogo isti zagon kot brskalnik: celoten inline <script>.
    new Function(SCRIPT)();
    await fn({
      els,
      cachesCalls,
      flush: () => new Promise((r) => setTimeout(r, 0)),
    });
  } finally {
    if (prevDoc === undefined) delete g.document;
    else g.document = prevDoc;
    if (prevWin === undefined) delete g.window;
    else g.window = prevWin;
  }
}

// ---------------------------------------------------------------------------
// FIXTURE: realen zapis dai:go-trip (oblika go-persist GoTripRecord)
// ---------------------------------------------------------------------------

/** Minimalen veljaven GoTripRecord (isti ključi kot go-persist.ts piše). */
function goRecord(lang: "sl" | "en", startDate?: string): Record<string, unknown> {
  return {
    version: 1,
    savedAt: "2026-09-21T10:00:00.000Z",
    journey: {
      id: "j1",
      lang,
      origin: { label: "Ljubljana (Brnik)" },
      destination: { label: "Bled" },
      travelers: 2,
      ...(startDate ? { startDate } : {}),
      arrivalTime: "14:00",
      categories: {
        transfer: { products: [{ id: "kt:t1", title: "Transfer Brnik → Bled" }] },
        accommodation: { products: [{ id: "fsq:h1", title: "Hotel Park Bled" }] },
        restaurants: { products: [{ id: "fsq:r1", title: "Gostilna Pri Lnu" }] },
        petrol: { products: [] },
        attractions: { products: [{ id: "fsq:a1", title: "Blejski otok" }] },
        events: {
          products: [
            {
              id: "events:e1",
              title: "Festival Bled",
              eventDate: { start: "2026-09-25T19:00:00.000Z" },
            },
          ],
        },
        rental: { providers: [] },
      },
      totals: {
        confirmedTotal: 0,
        knownTotal: 0,
        estimatedTotal: 0,
        unknownCount: 0,
        fromPriceCount: 0,
        currency: "EUR",
      },
      validation: { issues: [] },
      supplyHealth: { degradedProviders: [] },
      generatedAt: "2026-09-21T09:00:00.000Z",
    },
    // fsq:r1 NAMENOMA ni izbran — kartica ga ne sme pokazati.
    selectedIds: ["kt:t1", "fsq:h1", "fsq:a1", "events:e1"],
  };
}

// ---------------------------------------------------------------------------
// A) STATIČNE trditve — offline.html
// ---------------------------------------------------------------------------

describe("TASK 73: offline.html — Go Mode odsek (statična struktura)", () => {
  test("① bere PRAVilen ključ persistente (dai:go-trip) in povezuje obe lokali", () => {
    expect(OFFLINE_HTML).toContain('window.localStorage.getItem("dai:go-trip")');
    // Lokalno-zavedna povezava (isti URL, kot ga gradi startGoMode).
    expect(OFFLINE_HTML).toContain('LANG === "en" ? "/en/na-poti" : "/na-poti"');
  });

  test("② vsi Go Mode elementi obstajajo v statičnem HTML (skripta ne crkne)", () => {
    for (const id of ["go-section", "t-go-title", "t-go", "go-plan", "go-notcached"]) {
      expect(OFFLINE_HTML).toContain(`id="${id}"`);
    }
    // Iskrena opomba ima role=status (bralniki napovejo odkritje).
    expect(OFFLINE_HTML).toMatch(/id="go-notcached"[^>]*role="status"/);
  });

  test("③ Go odsek stoji PRED „Moji načrti“ (aktivno potovanje je nujno najprej)", () => {
    const goAt = OFFLINE_HTML.indexOf('id="go-section"');
    const plansAt = OFFLINE_HTML.indexOf('id="t-plans-title"');
    expect(goAt).toBeGreaterThan(0);
    expect(plansAt).toBeGreaterThan(goAt);
  });

  test("④ slovarja I18N (SL/EN) imata IDENTIČNO množico ključev (pariteta)", () => {
    const sl = dictKeys("sl");
    const en = dictKeys("en");
    expect(sl).toEqual(en);
    // Nove ključi TASK 73 v OBEH jezikih.
    for (const k of ["go", "goOpen", "goNotCached", "goNoDate"]) {
      expect(sl).toContain(k);
      expect(en).toContain(k);
    }
  });
});

/**
 * Izlušči blok `sl: { … }` / `en: { … }` iz I18N v offline.html.
 * Hoja po zavitočih je ZAVEDNA NIZOV (ključi z "{" v vrednosti ne sesujejo).
 */
function dictBlock(langKey: string): string {
  const re = new RegExp(`\\b${langKey}:\\s*\\{`);
  const m = re.exec(OFFLINE_HTML);
  if (!m) throw new Error(`offline.html: manjka slovar ${langKey}`);
  let i = m.index + m[0].length;
  let depth = 1;
  let inStr = false;
  let escNext = false;
  while (i < OFFLINE_HTML.length && depth > 0) {
    const ch = OFFLINE_HTML[i];
    if (inStr) {
      if (escNext) escNext = false;
      else if (ch === "\\") escNext = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return OFFLINE_HTML.slice(m.index + m[0].length, i - 1);
}

/** Ključi slovarja (samo nizovne vrednosti — takšni so vsi). */
function dictKeys(langKey: string): string[] {
  return [
    ...dictBlock(langKey).matchAll(/(?:^|\n)\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*"/g),
  ].map((m) => m[1]);
}

// ---------------------------------------------------------------------------
// A) STATIČNE trditve — sw.js
// ---------------------------------------------------------------------------

describe("TASK 73: sw.js — Go Mode routing v PLANS cache", () => {
  test("⑤ /na-poti in /en/na-poti gresta v PLANS cache (ne v 400-vnosni SHELL)", () => {
    expect(SW_JS).toContain('const GO_PAGE_PATHS = ["/na-poti", "/en/na-poti"]');
    expect(SW_JS).toContain(
      "const navCache = isSharePage || isGoPage ? PLANS_CACHE : SHELL_CACHE;"
    );
  });

  test("⑥ imena cache-a NAMENOMA niso bumpana (format vnosov se ni spremenil)", () => {
    // Bump bi ob aktivaciji SW pobrisal offline načrte popotnikov —
    // odločitev je dokumentirana v sw.js ob GO_PAGE_PATHS.
    expect(SW_JS).toContain('const PLANS_CACHE = "dai-plans-v1"');
    expect(SW_JS).toContain('const SHELL_CACHE = "dai-shell-v2"');
    expect(SW_JS).toContain("NAMENOMA ne bumpamo");
  });

  test("⑦ offline.html ostaja precache-ana (splošni offline fallback živi naprej)", () => {
    expect(SW_JS).toMatch(/"\/offline\.html",/);
  });
});

// ---------------------------------------------------------------------------
// B) IZVEDBA dejanske inline skripte offline.html
// ---------------------------------------------------------------------------

describe("TASK 73: offline.html — Go Mode odsek (izvedba skripte)", () => {
  test("⑧ SL zapis: kartica aktivnega potovanja z dnevi, izbire in CTA", async () => {
    await runOfflineScript(
      { localStorage: { "dai:go-trip": JSON.stringify(goRecord("sl", "2026-09-21")) } },
      ({ els }) => {
        const section = els.get("go-section")!;
        const html = els.get("go-plan")!.innerHTML;
        expect(section.hidden).toBe(false);
        // Glava: relacija + „shranjeno <leto>“.
        expect(html).toContain("Ljubljana (Brnik) → Bled");
        expect(html).toContain("shranjeno");
        expect(html).toContain("2026");
        // Dan 1: prihod + IZBRANI nedatirani izdelki; neizbrani NE.
        expect(html).toContain("Prihod: Ljubljana (Brnik)");
        expect(html).toContain("Transfer Brnik → Bled");
        expect(html).toContain("Hotel Park Bled");
        expect(html).toContain("Blejski otok");
        expect(html).not.toContain("Gostilna Pri Lnu");
        // Dogodek na svojem realnem datumu (1. dan prihoda je prej).
        expect(html).toContain("Festival Bled");
        expect(html.indexOf("Festival Bled")).toBeGreaterThan(
          html.indexOf("Prihod: Ljubljana (Brnik)")
        );
        // Meta: 2 dneva · 5 postankov (prihod + 4 izbrani).
        expect(html).toContain("2× dan · 5 postankov");
        // CTA vodi na slovensko stran Na poti.
        expect(html).toContain('href="/na-poti"');
        // Prevod naslova odseka.
        expect(els.get("t-go")!.textContent).toBe("Na poti — aktivno potovanje");
        // Brez window.caches → opomba o nev odprtosti ostane skrita.
        expect(els.get("go-notcached")!.hidden).toBe(true);
        expect(els.get("go-notcached")!.textContent).toContain("Na poti");
      }
    );
  });

  test("⑨ EN zapis + EN piškotek: Arrival, /en/na-poti, EN meta", async () => {
    await runOfflineScript(
      {
        cookie: "NEXT_LOCALE=en",
        localStorage: { "dai:go-trip": JSON.stringify(goRecord("en", "2026-09-21")) },
      },
      ({ els }) => {
        const html = els.get("go-plan")!.innerHTML;
        // Naslov prihoda sledi JEZIKU ZAPISA (kanon buildMyTrip), ne piškotku.
        expect(html).toContain("Arrival: Ljubljana (Brnik)");
        expect(html).not.toContain("Prihod: ");
        expect(html).toContain("2× day · 5 stops");
        expect(html).toContain('href="/en/na-poti"');
        expect(els.get("t-go")!.textContent).toBe("On the road — active journey");
      }
    );
  });

  test("⑩ mešano: EN zapis pod SL vmesnikom — Arrival ostaja, povezava je SL", async () => {
    await runOfflineScript(
      { localStorage: { "dai:go-trip": JSON.stringify(goRecord("en", "2026-09-21")) } },
      ({ els }) => {
        const html = els.get("go-plan")!.innerHTML;
        // Naslov VNOSA je v jeziku zapisa (zrcali buildMyTrip) …
        expect(html).toContain("Arrival: Ljubljana (Brnik)");
        // … vmesnik in povezava pa v jeziku strani (T/LANG).
        expect(html).toContain("2× dan · 5 postankov");
        expect(html).toContain('href="/na-poti"');
        expect(els.get("t-go")!.textContent).toBe("Na poti — aktivno potovanje");
      }
    );
  });

  test("⑪ brez zapisa: odsek ostane skrit, vsebina prazna", async () => {
    await runOfflineScript({}, ({ els }) => {
      expect(els.get("go-section")!.hidden).toBe(true);
      expect(els.get("go-plan")!.innerHTML).toBe("");
    });
  });

  test("⑫ pokvarjeni zapisi NE sesujejo strani (validacija = go-persist)", async () => {
    const bad = [
      "{not json",
      JSON.stringify({ version: 2, savedAt: "x", journey: {}, selectedIds: [] }),
      JSON.stringify({ version: 1, savedAt: 5, journey: { id: "j" }, selectedIds: [] }),
      JSON.stringify({
        version: 1,
        savedAt: "x",
        journey: { id: "j", lang: "de", origin: { label: "a" }, destination: { label: "b" }, categories: {} },
        selectedIds: [],
      }),
      JSON.stringify({ version: 1, savedAt: "x", journey: goRecord("sl").journey, selectedIds: [1, 2] }),
      JSON.stringify({ version: 1, savedAt: "x", journey: { id: "j", lang: "sl" }, selectedIds: [] }),
    ];
    for (const raw of bad) {
      await runOfflineScript(
        { localStorage: { "dai:go-trip": raw } },
        ({ els }) => {
          expect(els.get("go-section")!.hidden).toBe(true);
          expect(els.get("go-plan")!.innerHTML).toBe("");
        }
      );
    }
  });

  test("⑬ vržeč localStorage (zasebni način): odsek skrit, brez sesutja", async () => {
    await runOfflineScript(
      { localStorageThrows: true },
      ({ els }) => {
        expect(els.get("go-section")!.hidden).toBe(true);
        // Ostala vsebina strani živi naprej (ne odvisna od dai:go-trip).
        expect(els.get("plans-list")!.innerHTML).toContain("Na tej napravi");
      }
    );
  });

  test("⑭ kronologija TASK 72: dogodek PRED datumom prihoda uredi se prej; brez datuma je dan 1 sidro", async () => {
    // Scenarij A: prihod 25. 9., dogodek 21. 9. → dogodek PRVI.
    const a = goRecord("sl", "2026-09-25");
    const aJ = a.journey as Record<string, unknown>;
    const aCats = (aJ.categories as Record<string, { products: unknown[] }>);
    (aCats.events.products[0] as Record<string, { start: string }>).eventDate = {
      start: "2026-09-21T19:00:00.000Z",
    };
    await runOfflineScript(
      { localStorage: { "dai:go-trip": JSON.stringify(a) } },
      ({ els }) => {
        const html = els.get("go-plan")!.innerHTML;
        expect(html.indexOf("Festival Bled")).toBeGreaterThan(0);
        expect(html.indexOf("Festival Bled")).toBeLessThan(
          html.indexOf("Prihod: Ljubljana (Brnik)")
        );
      }
    );

    // Scenarij B: brez datuma prihoda → dan 1 („“) ostane prvi kot sidro.
    await runOfflineScript(
      { localStorage: { "dai:go-trip": JSON.stringify(goRecord("sl")) } },
      ({ els }) => {
        const html = els.get("go-plan")!.innerHTML;
        expect(html).toContain("Datum prihoda ni vnesen");
        expect(html.indexOf("Prihod: Ljubljana (Brnik)")).toBeLessThan(
          html.indexOf("Festival Bled")
        );
      }
    );
  });

  test("⑮ XSS: naslovi virov in oznaki potovanja so ubežani (esc)", async () => {
    const rec = goRecord("sl", "2026-09-21");
    const j = rec.journey as Record<string, unknown>;
    j.origin = { label: 'Ljubljana" onmouseover="x' };
    const cats = j.categories as Record<string, { products: Record<string, unknown>[] }>;
    cats.attractions.products[0].title = '<img src=x onerror="alert(1)">';
    await runOfflineScript(
      { localStorage: { "dai:go-trip": JSON.stringify(rec) } },
      ({ els }) => {
        const html = els.get("go-plan")!.innerHTML;
        expect(html).not.toContain("<img");
        expect(html).toContain("&lt;img");
        expect(html).not.toContain('Ljubljana" onmouseover');
        expect(html).toContain("Ljubljana&quot;");
      }
    );
  });

  test("⑯ iskrena opomba: cache MISS jo pokaže, HIT in manjkajoč API ne", async () => {
    // MISS: /na-poti ni v cache-u → opomba se pokaže.
    await runOfflineScript(
      {
        localStorage: { "dai:go-trip": JSON.stringify(goRecord("sl", "2026-09-21")) },
        cachesMatch: () => Promise.resolve(null),
      },
      async ({ els, cachesCalls, flush }) => {
        await flush();
        expect(cachesCalls).toEqual(["/na-poti"]);
        expect(els.get("go-notcached")!.hidden).toBe(false);
        expect(els.get("go-notcached")!.textContent).toContain("Na poti");
      }
    );

    // HIT: stran je v cache-u → opomba ostane skrita.
    await runOfflineScript(
      {
        localStorage: { "dai:go-trip": JSON.stringify(goRecord("sl", "2026-09-21")) },
        cachesMatch: () => Promise.resolve({ ok: true }),
      },
      async ({ els, flush }) => {
        await flush();
        expect(els.get("go-notcached")!.hidden).toBe(true);
      }
    );

    // EN: preverja PRAVO pot (/en/na-poti).
    await runOfflineScript(
      {
        cookie: "NEXT_LOCALE=en",
        localStorage: { "dai:go-trip": JSON.stringify(goRecord("en", "2026-09-21")) },
        cachesMatch: () => Promise.resolve(null),
      },
      async ({ cachesCalls, flush }) => {
        await flush();
        expect(cachesCalls).toEqual(["/en/na-poti"]);
      }
    );
  });

  test("⑰ dogodek BREZ datuma je izpuščen (časovnica ne izumlja datumov)", async () => {
    const rec = goRecord("sl", "2026-09-21");
    const j = rec.journey as Record<string, unknown>;
    const cats = j.categories as Record<string, { products: Record<string, unknown>[] }>;
    delete (cats.events.products[0] as Record<string, unknown>).eventDate;
    await runOfflineScript(
      { localStorage: { "dai:go-trip": JSON.stringify(rec) } },
      ({ els }) => {
        const html = els.get("go-plan")!.innerHTML;
        expect(html).not.toContain("Festival Bled");
        // 1 dan · 4 postanki (prihod + 3 izbrani brez dogodka).
        expect(html).toContain("1× dan · 4 postankov");
      }
    );
  });
});
