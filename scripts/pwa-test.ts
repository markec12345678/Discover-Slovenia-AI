// PWA testi (F5.7) — service worker STRATEGIJSKA logika v mock okolju +
// manifest/offline.html pogodbene kontrole.
//
// ZAKAJ mock in ne brskalnik: SW fetch logika je čista funkcija zahtevka →
// odgovor. Brskalniški test na DEV strežniku laže (dev chunk-i imajo
// STABILNE URL-je brez hash-a → cache-first bi zamrznil staro kodo in
// podrl hidracijo — ravno zato sw-register v dev registrira ?dev=1).
// Zato logiko poženemo v nadzorovanem okolju z lažnimi caches/fetch.
// REALNI offline dokaz potem pride iz produkcije (Vercel E2E).
//
// Zagon: bun run scripts/pwa-test.ts

import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Mini harness: naloži public/sw.js v lažni ServiceWorkerGlobalScope.
// ---------------------------------------------------------------------------

interface FetchEventLike {
  request: Request;
  respondWith: (r: Promise<Response>) => void;
}

class MockCache {
  private map = new Map<string, Response>();

  async put(request: Request | string, response: Response): Promise<void> {
    const key =
      typeof request === "string" ? absUrl(request) : request.url;
    this.map.set(key, response);
  }
  async match(request: Request | string): Promise<Response | undefined> {
    const key =
      typeof request === "string" ? absUrl(request) : request.url;
    return this.map.get(key);
  }
  async delete(request: Request | string): Promise<boolean> {
    const key =
      typeof request === "string" ? absUrl(request) : request.url;
    return this.map.delete(key);
  }
  async keys(): Promise<Request[]> {
    // Vrstni red vstavljanja (kot Chrome v praksi) — za LRU teste.
    return [...this.map.keys()].map((url) => new Request(url));
  }
}

const ORIGIN = "https://discoverslovenia.example";
const SHARED_PREFIX_MARKER = "/api/itinerary/shared/";

/** Testni Request z OBEH lastnostmi, ki ju browser nastavlja avtomatsko
 *  (mode/destination) — v Node/Bun konstruktor tega ne podpira. */
function mkRequest(
  url: string,
  opts: { mode?: RequestMode; destination?: RequestDestination } = {}
): Request {
  const req = new Request(url);
  if (opts.mode) {
    Object.defineProperty(req, "mode", { value: opts.mode });
  }
  if (opts.destination) {
    Object.defineProperty(req, "destination", { value: opts.destination });
  }
  return req;
}

/** Absolutiziraj relativne poti (SW resolucija proti origin-u). */
function absUrl(url: string): string {
  return url.startsWith("/") ? ORIGIN + url : url;
}

class MockCaches {
  private stores = new Map<string, MockCache>();
  async open(name: string): Promise<MockCache> {
    if (!this.stores.has(name)) this.stores.set(name, new MockCache());
    return this.stores.get(name)!;
  }
  async keys(): Promise<string[]> {
    return [...this.stores.keys()];
  }
  async match(
    request: Request | string
  ): Promise<Response | undefined> {
    for (const cache of this.stores.values()) {
      const hit = await cache.match(request);
      if (hit) return hit;
    }
    return undefined;
  }
  _resolveForMock(url: string): string {
    return absUrl(url);
  }
  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name);
  }
}

interface FetchHandler {
  type: string;
  fn: (event: unknown) => void;
}

function loadServiceWorker(devMode: boolean): {
  handlers: FetchHandler[];
  fire: (request: Request) => Promise<Response | null>;
} {
  const handlers: FetchHandler[] = [];
  const listeners: Record<string, Array<(e: unknown) => void>> = {};

  const swUrl = devMode ? `${ORIGIN}/sw.js?dev=1` : `${ORIGIN}/sw.js`;
  const selfObj: Record<string, unknown> = {
    location: new URL(swUrl),
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
      handlers.push({ type, fn });
    },
    skipWaiting: () => {},
    clients: {
      claim: () => Promise.resolve(),
      matchAll: () => Promise.resolve([]),
      openWindow: () => Promise.resolve(undefined),
    },
    registration: { showNotification: () => Promise.resolve() },
  };

  const source = fs.readFileSync(
    path.join(process.cwd(), "public", "sw.js"),
    "utf8"
  );

  // Izvedi v funkciji z lažnimi globali (caches/fetch vbrizgamo).
  // SWRequest: resolva RELATIVNE poti proti ORIGIN (kot browser SW scope).
  class SwRequest extends Request {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const resolved =
        typeof input === "string"
          ? absUrl(input)
          : input instanceof URL
            ? input.href
            : input.url;
      super(resolved, init);
    }
  }
  const mod = new Function(
    "self",
    "caches",
    "fetch",
    "Response",
    "Request",
    "console",
    `"use strict";\n${source}`
  ) as (
    self: unknown,
    caches: unknown,
    fetch: unknown,
    Response: unknown,
    Request: unknown,
    console: unknown
  ) => void;

  const mockCaches = new MockCaches();
  const network = new Map<string, Response | Error>(); // URL → odgovor NAPAKA
  const fetchCalls: string[] = [];
  const mockFetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url =
      typeof input === "string"
        ? absUrl(input)
        : input instanceof URL
          ? input.href
          : input.url;
    fetchCalls.push(url);
    const hit = network.get(url);
    if (hit instanceof Error) throw hit;
    if (hit) return hit.clone();
    throw new TypeError("Failed to fetch (offline)");
  };

  mod(
    selfObj,
    mockCaches,
    mockFetch,
    Response,
    SwRequest,
    { warn: () => {}, info: () => {}, error: () => {} }
  );

  const fire = (request: Request): Promise<Response | null> => {
    // Poišči prijavljene fetch handlerje (spec: respondWith mora biti
    // klican SINHRONO znotraj handlerja — naš sw.js temu ustreza).
    const fetchListeners = listeners["fetch"] || [];
    if (fetchListeners.length === 0) return Promise.resolve(null);
    let captured: Promise<Response> | null = null;
    const event: FetchEventLike = {
      request,
      respondWith: (r: Promise<Response>) => {
        if (!captured) captured = r;
      },
    };
    for (const fn of fetchListeners) fn(event);
    // TS ozkočljevanje ne sledi priredu znotraj closure-a — eksplicitna
    // lokalna kopija z izbiro.
    const capturedPromise = captured as Promise<Response> | null;
    if (!capturedPromise) return Promise.resolve(null); // passthrough
    return capturedPromise.then(
      (resp) => resp,
      () => null
    );
  };

  return {
    handlers,
    fire,
    // @ts-expect-error interne za teste izpostavimo prek closure
    get _intern() {
      return { mockCaches, network, fetchCalls, listeners };
    },
  };
}

// Helper: dobi interne (mockCaches/network/fetchCalls/listeners)
type Loaded = ReturnType<typeof loadServiceWorker>;
function internals(loader: Loaded) {
  // @ts-expect-error dostop do test-only internov
  return loader._intern as {
    mockCaches: MockCaches;
    network: Map<string, Response | Error>;
    fetchCalls: string[];
    listeners: Record<string, Array<(e: unknown) => void>>;
  };
}

// ---------------------------------------------------------------------------
// Testi
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` — ${detail}` : ""));
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html" },
  });
}

console.log("\n=== PWA TESTI (F5.7) — sw.js strategije (mock) ===\n");

// --- T1: DEV_MODE passthrough (noben respondWith) ---
{
  const sw = loadServiceWorker(true);
  const req = mkRequest(`${ORIGIN}/pot/abc123`, { mode: "navigate" });
  const res = await sw.fire(req);
  check(
    "T1 dev (?dev=1): fetch passthrough — SW se ne postavlja pred odgovor",
    res === null
  );
}

// --- T2: deljeni itinerer — network-first + cache put ---
{
  const sw = loadServiceWorker(false);
  const { mockCaches, network, fetchCalls } = internals(sw);
  const url = `${ORIGIN}/api/itinerary/shared/abc1234567?warm=1`;
  network.set(url, jsonResponse({ success: true, views: 7 }));
  const res = await sw.fire(mkRequest(url));
  const body = (await res?.json()) as { views?: number };
  check("T2a warm JSON: odgovor prek omrežja (network-first)", body.views === 7);
  check("T2b warm JSON: en omrežni klic", fetchCalls.length === 1);
  const plans = await mockCaches.open("dai-plans-v1");
  const cachedHit = await plans.match(url);
  check("T2c warm JSON: 200 odgovor se zapiše v dai-plans-v1", !!cachedHit);
}

// --- T3: deljeni itinerer OFFLINE — fallback na cache ---
{
  const sw = loadServiceWorker(false);
  const { mockCaches, network } = internals(sw);
  const url = `${ORIGIN}/api/itinerary/shared/abc1234567?warm=1`;
  // 1. online obisk (polni cache)
  network.set(url, jsonResponse({ success: true, name: "Bled" }));
  await sw.fire(mkRequest(url));
  // 2. "odjdimo offline" — omrežje vrže
  network.set(url, new TypeError("offline"));
  const res = await sw.fire(mkRequest(url));
  const body = (await res?.json()) as { name?: string; error?: string };
  check(
    "T3 offline warm JSON: fallback na cache (ime Bled)",
    body.name === "Bled"
  );
}

// --- T4: drugi /api/* NIKOLI iz cache-a ---
{
  const sw = loadServiceWorker(false);
  const res = await sw.fire(new Request(`${ORIGIN}/api/itinerary`));
  check("T4 /api/itinerary (POST-generation endpoint): passthrough", res === null);
  const res2 = await sw.fire(new Request(`${ORIGIN}/api/user/trips`));
  check("T4b /api/user/trips: passthrough", res2 === null);
}

// --- T5: navigacija /pot/* — network-first + PLANS cache + offline fallback ---
{
  const sw = loadServiceWorker(false);
  const { mockCaches, network } = internals(sw);
  const url = `${ORIGIN}/pot/abc1234567`;
  network.set(url, htmlResponse("<html>načrt Bled</html>"));
  await sw.fire(mkRequest(url, { mode: "navigate" }));
  const plans = await mockCaches.open("dai-plans-v1");
  check(
    "T5a /pot navigacija: HTML se shrani v dai-plans-v1",
    !!(await plans.match(url))
  );
  // offline → cache fallback
  network.set(url, new TypeError("offline"));
  const res = await sw.fire(mkRequest(url, { mode: "navigate" }));
  const text = await res?.text();
  check(
    "T5b /pot navigacija OFFLINE: zadnji viden HTML iz cache-a",
    text === "<html>načrt Bled</html>"
  );
}

// --- T6: navigacija NE-cachirana OFFLINE → /offline.html fallback ---
{
  const sw = loadServiceWorker(false);
  const { mockCaches, network } = internals(sw);
  // precache /offline.html (kot ga naredi install)
  network.set(`${ORIGIN}/offline.html`, htmlResponse("<html>OFFLINE PAGE</html>"));
  const shell = await mockCaches.open("dai-shell-v2");
  await shell.put(`${ORIGIN}/offline.html`, htmlResponse("<html>OFFLINE PAGE</html>"));
  const url = `${ORIGIN}/destinacije/nekaj-nikoli-viđeno`;
  network.set(url, new TypeError("offline"));
  const res = await sw.fire(mkRequest(url, { mode: "navigate" }));
  const text = await res?.text();
  check(
    "T6 ne-cachirana stran OFFLINE: fallback na /offline.html",
    text === "<html>OFFLINE PAGE</html>"
  );
}

// --- T7: /pot/* z query (utm) OFFLINE → fallback brez search ---
{
  const sw = loadServiceWorker(false);
  const { mockCaches } = internals(sw);
  const plans = await mockCaches.open("dai-plans-v1");
  await plans.put(`${ORIGIN}/pot/abc1234567`, htmlResponse("<html>PLAN</html>"));
  const res = await sw.fire(
    mkRequest(`${ORIGIN}/pot/abc1234567?utm_source=whatsapp`, {
      mode: "navigate",
    })
  );
  const text = await res?.text();
  check("T7 /pot?utm OFFLINE: najden vnos brez query-ja", text === "<html>PLAN</html>");
}

// --- T8: OSM tile-i → cache-first v dai-tiles-v1 ---
{
  const sw = loadServiceWorker(false);
  const { mockCaches, network, fetchCalls } = internals(sw);
  const tileUrl = "https://tile.openstreetmap.org/7/33/51.png";
  network.set(tileUrl, new Response("TILE", { status: 200 }));
  await sw.fire(mkRequest(tileUrl, { destination: "image" }));
  const tiles = await mockCaches.open("dai-tiles-v1");
  check("T8a OSM tile: shranjen v dai-tiles-v1", !!(await tiles.match(tileUrl)));
  // drugi klic → cache-first (brez novega omrežnega klica)
  fetchCalls.length = 0;
  const res2 = await sw.fire(mkRequest(tileUrl, { destination: "image" }));
  const t2 = await res2?.text();
  check("T8b OSM tile drugič: cache-first (0 omrežnih klicev)", fetchCalls.length === 0 && t2 === "TILE");
}

// --- T9: cross-origin NE-slika (zunanji API) → passthrough ---
{
  const sw = loadServiceWorker(false);
  const res = await sw.fire(
    mkRequest("https://api.external.example/data", { mode: "cors" })
  );
  check("T9 zunanji API (ne-slika): SW se ne vmešava", res === null);
}

// --- T10: admin/owner → passthrough ---
{
  const sw = loadServiceWriterSafe();
  const res = await sw.fire(new Request(`${ORIGIN}/admin/dashboard`));
  check("T10 /admin: passthrough", res === null);
  const res2 = await sw.fire(new Request(`${ORIGIN}/owner/panel`));
  check("T10b /owner: passthrough", res2 === null);
}

function loadServiceWriterSafe(): Loaded {
  return loadServiceWorker(false);
}

// --- T11: activate pobriše legacy cache (discoverslovenia-v1) ---
{
  const sw = loadServiceWorker(false);
  const { mockCaches, listeners } = internals(sw);
  const legacy = await mockCaches.open("discoverslovenia-v1");
  await legacy.put(`${ORIGIN}/stara-stran`, htmlResponse("stara"));
  // aktiviraj (event.waitUntil-ish: handler je sinhron z waitUntil mock)
  const activateEvent = {
    waitUntil: (p: Promise<unknown>) => {
      void p.catch(() => {});
    },
  };
  for (const fn of listeners["activate"] || []) fn(activateEvent);
  await new Promise((r) => setTimeout(r, 30));
  const keys = await mockCaches.keys();
  check(
    "T11 activate: legacy discoverslovenia-v1 izbrisan",
    !keys.includes("discoverslovenia-v1")
  );
}

// --- T12: skripti → cache-first v dai-shell-v2 ---
{
  const sw = loadServiceWorker(false);
  const { mockCaches, network, fetchCalls } = internals(sw);
  const chunk = `${ORIGIN}/_next/static/chunks/app/page-abc123.js`;
  network.set(chunk, new Response("JS", { status: 200 }));
  await sw.fire(mkRequest(chunk, { destination: "script" }));
  const shell = await mockCaches.open("dai-shell-v2");
  check("T12a chunk: shranjen v dai-shell-v2", !!(await shell.match(chunk)));
  fetchCalls.length = 0;
  await sw.fire(mkRequest(chunk, { destination: "script" }));
  check("T12b chunk drugič: cache-first (0 omrežnih klicev)", fetchCalls.length === 0);
}

// --- T13: 500 se NE cachira (fail-open, brez laži) ---
{
  const sw = loadServiceWorker(false);
  const { mockCaches, network } = internals(sw);
  const url = `${ORIGIN}/api/itinerary/shared/err1234567`;
  network.set(url, jsonResponse({ error: "server" }, 500));
  const res = await sw.fire(mkRequest(url));
  check("T13a 500 odgovor preide do klienta", res?.status === 500);
  const plans = await mockCaches.open("dai-plans-v1");
  check("T13b 500 se NE zapiše v cache", !(await plans.match(url)));
}

// ---------------------------------------------------------------------------
// Pogodbene kontrole: manifest.json + offline.html + sw.js viri
// ---------------------------------------------------------------------------

console.log("\n=== POGODBE: manifest / offline.html / javni viri ===\n");

const manifest = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public", "manifest.json"), "utf8")
) as Record<string, unknown>;

check("M1 manifest: id=\"/\"", manifest.id === "/");
check(
  "M2 manifest: display standalone + start_url /",
  manifest.display === "standalone" && manifest.start_url === "/"
);
const icons = manifest.icons as Array<{ src: string; sizes: string }>;
check(
  "M3 manifest: ikone 192+512 (any+maskable) obstajajo na disku",
  icons.every((i) =>
    fs.existsSync(path.join(process.cwd(), "public", i.src.replace(/^\//, "")))
  ) && icons.length >= 4
);
const shots = manifest.screenshots as Array<{
  src: string;
  sizes: string;
  form_factor?: string;
}>;
check(
  "M4 manifest: screenshots (wide 1280x720 + narrow 540x720) obstajajo",
  shots.length === 2 &&
    shots.some(
      (s) => s.sizes === "1280x720" && s.form_factor === "wide" && fs.existsSync(path.join(process.cwd(), "public", s.src.replace(/^\//, "")))
    ) &&
    shots.some(
      (s) => s.sizes === "540x720" && s.form_factor === "narrow" && fs.existsSync(path.join(process.cwd(), "public", s.src.replace(/^\//, "")))
    )
);

const offlineHtml = fs.readFileSync(
  path.join(process.cwd(), "public", "offline.html"),
  "utf8"
);
check(
  "O1 offline.html: bere dai:my-trips (localStorage)",
  offlineHtml.includes("dai:my-trips")
);
check(
  "O2 offline.html: fetcha warm URL (ujema se s SW cache ključem)",
  offlineHtml.includes("?warm=1")
);
check(
  "O3 offline.html: bere zadnji načrt (discoverslovenia_last_itinerary)",
  offlineHtml.includes("discoverslovenia_last_itinerary")
);
check(
  "O4 offline.html: ni ZUNANJIH virov (self-contained — deluje brez omrežja)",
  !/src=["']https?:\/\//.test(offlineHtml) &&
    !/href=["']https?:\/\//.test(offlineHtml) &&
    !/url\(https?:\/\//.test(offlineHtml)
);
check(
  "O5 offline.html: dvojezično (SL default + EN prek NEXT_LOCALE)",
  offlineHtml.includes("NEXT_LOCALE") &&
    offlineHtml.includes("Brez povezave") &&
    offlineHtml.includes("You're offline")
);
check(
  "O6 offline.html: HTML escape vseh dinamičnih vrednosti (XSS)",
  offlineHtml.includes("function esc(")
);

const swSource = fs.readFileSync(
  path.join(process.cwd(), "public", "sw.js"),
  "utf8"
);
const SHARED_S1_MARKER = SHARED_PREFIX_MARKER;
check(
  "S1 sw.js: shared-itinerary branch PRED generičnim /api/ skipom",
  swSource.indexOf(SHARED_S1_MARKER) <
    swSource.indexOf('url.pathname.startsWith("/api/")')
);
check(
  "S2 sw.js: offline.html v precache seznamu",
  swSource.includes('"/offline.html"')
);
check(
  "S3 sw.js: whitelist štiri cache-e (purge legacy)",
  swSource.includes('"dai-shell-v2"') &&
    swSource.includes('"dai-plans-v1"') &&
    swSource.includes('"dai-tiles-v1"') &&
    swSource.includes('"dai-img-v1"')
);
check(
  "S4 sw.js: push handlerji ostajajo (F predhodna funkcionalnost)",
  swSource.includes('addEventListener("push"') &&
    swSource.includes('addEventListener("notificationclick"')
);
check(
  "S5 sw.js: GET_CACHE_INFO debug vmesnik (E2E)",
  swSource.includes("GET_CACHE_INFO")
);

// --- Konec ---
console.log(
  `\n=== REZULTAT: ${passed} ✓ / ${failed} ✗ ===${failures.length ? "\nNEUSPEHI:\n - " + failures.join("\n - ") : ""}\n`
);
process.exit(failed === 0 ? 0 : 1);
