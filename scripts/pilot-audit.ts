#!/usr/bin/env bun
/**
 * PILOT VALIDATION GATE — Test 1: produkcijski URL audit
 *
 * Uporaba:
 *   bun run scripts/pilot-audit.ts <set> <mode> [conc] [outPrefix]
 *
 * Seti:
 *   core      — obvezne poti (SL+EN), SEO datoteke, affiliate /go/*, owner/admin
 *   hubs      — 22 SL + 22 EN destinacijskih hubov (iz sitemap)
 *   sitemap   — VSI URL-ji iz sitemap.xml
 *   links     — interni linki s homepage-a + hubov (link integrity)
 *   api       — API endpointi (GET) vzporedno (Neon connection stres)
 *   recheck   — ponovni test URL-jev iz prejšnjega spisa z napakami
 *
 * Načini: seq (konk. 1) | par (privzeto 12)
 *
 * Rezultati: scripts/pilot-results/<set>-<mode>.json + povzetek na stdout.
 * Skripta NE spreminja aplikacijske kode — je validacijsko orodje (faza 1 pravilo).
 */

// Modul, ne globalna skripta: izolira skop (TS2451 — kolizija `const BASE` s
// pilot-scenarios.ts) in omogoča top-level await (TS1375). `export {}` ne vpliva
// na izvajanje z bun.
export {};

const BASE = "https://i-feel-slovenia.onrender.com";
const TIMEOUT_MS = 30_000;
const RESULTS_DIR = "scripts/pilot-results";

// ---------------------------------------------------------------------------
// Pomožne funkcije
// ---------------------------------------------------------------------------

interface HtmlCheck {
  lang?: string;
  title?: string;
  canonical?: string;
  canonicalSelf?: boolean;
  hreflang?: string[];
  jsonLdCount?: number;
  imgCount?: number;
}

interface CheckResult {
  url: string;
  status: number;
  ok: boolean;
  timeMs: number;
  redirectedTo?: string;
  contentType?: string;
  size?: number;
  html?: HtmlCheck;
  bodyHint?: string;
  error?: string;
}

function parseArgs(): { set: string; mode: string; conc: number; outPrefix: string } {
  const [set = "core", mode = "seq"] = process.argv.slice(2);
  const concArg = Number(process.argv[4] ?? "");
  const conc =
    Number.isFinite(concArg) && concArg > 0
      ? concArg
      : mode === "par"
        ? 12
        : 1;
  const outPrefix = process.argv[5] ?? `${set}-${mode}`;
  return { set, mode, conc, outPrefix };
}

async function fetchCheck(
  url: string,
  opts: { redirect?: RequestRedirect; wantBody?: boolean } = {}
): Promise<CheckResult> {
  const started = Date.now();
  const isGo = url.includes("/go/");
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: opts.redirect ?? (isGo ? "manual" : "follow"),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "PilotValidationGate/1.0 (+audit)" },
    });
    const timeMs = Date.now() - started;
    const contentType = res.headers.get("content-type") ?? undefined;
    let body = "";
    if (opts.wantBody || res.status >= 400) {
      body = await res.text().catch(() => "");
    }
    const html: HtmlCheck | undefined = extractHtmlSignals(body);
    return {
      url,
      status: res.status,
      ok: res.ok,
      timeMs,
      redirectedTo: isGo ? res.headers.get("location") ?? undefined : undefined,
      contentType,
      size: body.length || undefined,
      html,
      bodyHint: res.status >= 400 ? body.slice(0, 300) : undefined,
    };
  } catch (e) {
    return {
      url,
      status: 0,
      ok: false,
      timeMs: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function extractHtmlSignals(body: string): HtmlCheck | undefined {
  if (!body || !/<html/i.test(body)) return undefined;
  const lang = body.match(/<html[^>]*\slang="([^"]+)"/i)?.[1];
  const title = body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
  const canonical = body.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1];
  const hreflang = [...body.matchAll(/<link[^>]+hrefLang="([^"]+)"[^>]+href="([^"]+)"/gi)].map(
    (m) => `${m[1]} → ${m[2]}`
  );
  // React hydrira hrefLang (camelCase) — ulovi obe obliki
  if (hreflang.length === 0) {
    for (const m of body.matchAll(/<link[^>]+href="([^"]+)"[^>]+hrefLang="([^"]+)"/gi)) {
      hreflang.push(`${m[2]} → ${m[1]}`);
    }
  }
  const jsonLdCount = (body.match(/application\/ld\+json/g) ?? []).length;
  const imgCount = (body.match(/<img\b/gi) ?? []).length;
  return { lang, title, canonical, hreflang, jsonLdCount, imgCount };
}

async function runPool<T, R>(
  items: T[],
  conc: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(conc, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

function summarize(results: CheckResult[], label: string): void {
  const total = results.length;
  const ok200 = results.filter((r) => r.status === 200).length;
  const redirects = results.filter((r) => r.status >= 300 && r.status < 400).length;
  const notFound = results.filter((r) => r.status === 404).length;
  const serverErr = results.filter((r) => r.status >= 500).length;
  const networkErr = results.filter((r) => r.status === 0).length;
  const times = results.map((r) => r.timeMs).sort((a, b) => a - b);
  const p = (q: number) => (times.length ? times[Math.min(times.length - 1, Math.floor(times.length * q))] : 0);
  console.log(`\n=== ${label} ===`);
  console.log(
    `skupaj: ${total} | 200: ${ok200} | 3xx: ${redirects} | 404: ${notFound} | 5xx: ${serverErr} | omrežne napake: ${networkErr}`
  );
  console.log(`časi: p50 ${p(0.5)} ms | p90 ${p(0.9)} ms | max ${times[times.length - 1] ?? 0} ms`);
  const bad = results.filter((r) => r.status !== 200 && !(r.status >= 300 && r.status < 400));
  if (bad.length > 0) {
    console.log("Odstopanja:");
    for (const b of bad.slice(0, 40)) {
      console.log(`  ${b.status || "ERR"} ${b.url} ${b.error ?? b.bodyHint ?? ""}`.slice(0, 220));
    }
    if (bad.length > 40) console.log(`  … in še ${bad.length - 40}`);
  }
}

async function saveJson(data: unknown, name: string): Promise<string> {
  const path = `${RESULTS_DIR}/${name}.json`;
  await Bun.write(path, JSON.stringify(data, null, 2));
  return path;
}

// ---------------------------------------------------------------------------
// Definicije URL-jev
// ---------------------------------------------------------------------------

function coreUrls(): { url: string; kind: string }[] {
  const pairs: [string, string | null][] = [
    ["/", "/en"],
    ["/nacrtuj", "/en/nacrtuj"], // opomba: uporabnikov "/en/plan" ne obstaja — EN pot je /en/nacrtuj
    ["/destinacije", "/en/destinacije"],
    ["/destinacija/bled", "/en/destinacija/bled"],
    ["/destinacija/ljubljana", "/en/destinacija/ljubljana"],
    ["/destinacija/piran", "/en/destinacija/piran"],
    ["/destinacija/bled/things-to-do", "/en/destinacija/bled/things-to-do"],
    ["/destinacija/ljubljana/things-to-do", "/en/destinacija/ljubljana/things-to-do"],
    ["/destinacija/bled/guide/romanticni-pobeg", "/en/destinacija/bled/guide/romanticni-pobeg"],
    ["/destinacija/piran/guide/druzinski", "/en/destinacija/piran/guide/druzinski"],
    ["/destinacija/bled/best-time-to-visit/poletje", "/en/destinacija/bled/best-time-to-visit/poletje"],
    ["/destinacija/bled/itinerary/vikend", "/en/destinacija/bled/itinerary/vikend"],
    ["/vodici", "/en/vodici"],
    ["/trznica", null],
    ["/zemljevid", null],
    ["/dogodki", null],
    ["/dozivetja", null],
    ["/lokali", null],
    ["/o-strani", "/en/o-strani"],
    ["/kontakt", "/en/kontakt"],
    ["/vir-podatkov", "/en/vir-podatkov"],
    ["/za-ponudnike", null],
  ];
  const urls: { url: string; kind: string }[] = [];
  for (const [sl, en] of pairs) {
    urls.push({ url: `${BASE}${sl}`, kind: "page" });
    if (en) urls.push({ url: `${BASE}${en}`, kind: "page-en" });
  }
  for (const f of ["/sitemap.xml", "/robots.txt", "/llms.txt", "/llms-full.txt", "/rss.xml"]) {
    urls.push({ url: `${BASE}${f}`, kind: "seo-file" });
  }
  // Affiliate: s parametrom dest (pričakovan 302 na partnerja)
  for (const p of [
    "hotels", "cars", "activities", "flights", "insurance",
    "esim", "transfers", "transport", "tickets", "viator",
  ]) {
    urls.push({ url: `${BASE}/go/${p}?dest=bled`, kind: "affiliate" });
  }
  // Fail-closed preverba: brez dest (pričakovan 400) in neznan ponudnik (404)
  urls.push({ url: `${BASE}/go/hotels`, kind: "affiliate-no-dest" });
  urls.push({ url: `${BASE}/go/neobstojeci?dest=bled`, kind: "affiliate-invalid" });
  urls.push({ url: `${BASE}/owner/prijava`, kind: "owner" });
  urls.push({ url: `${BASE}/owner/dashboard`, kind: "owner-protected" });
  urls.push({ url: `${BASE}/admin`, kind: "admin" });
  urls.push({ url: `${BASE}/api/listings`, kind: "api" });
  urls.push({ url: `${BASE}/api/ai-health`, kind: "api" });
  urls.push({ url: `${BASE}/destinacija/neobstojeci-xyz`, kind: "invalid-slug" });
  return urls;
}

async function sitemapUrls(): Promise<string[]> {
  const res = await fetch(`${BASE}/sitemap.xml`, { signal: AbortSignal.timeout(60_000) });
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

function hubUrls(all: string[]): string[] {
  return all.filter(
    (u) =>
      /\/destinacija\/[^/]+$/.test(u) ||
      /\/en\/destinacija\/[^/]+$/.test(u)
  );
}

function extractInternalLinks(html: string, from: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    let href = m[1];
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    if (href.startsWith("http")) {
      if (!href.startsWith(BASE)) continue;
      href = href.slice(BASE.length);
    }
    if (href.startsWith("//")) continue;
    href = href.split("#")[0];
    // OHRANI query string (ključen za /go/* affiliate povezave z dest parametrom)
    if (!href || !href.startsWith("/")) continue;
    if (/\.(png|jpe?g|webp|svg|ico|xml|txt|json|webmanifest)$/i.test(href)) continue;
    out.add(`${BASE}${href}`);
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// Glavni program
// ---------------------------------------------------------------------------

const { set, mode, conc, outPrefix } = parseArgs();
console.log(`Pilot audit — set: ${set}, mode: ${mode}, konkurenca: ${conc}`);

if (set === "core") {
  const targets = coreUrls();
  const results = await runPool(targets, conc, async (t) => fetchCheck(t.url, { wantBody: true }));
  summarize(results, `CORE ${mode} (${targets.length} URL-jev)`);
  // Affiliate redirect targeti
  for (const r of results) {
    if (r.url.includes("/go/")) {
      console.log(`  GO ${r.status} ${r.url.replace(BASE, "")} → ${r.redirectedTo?.slice(0, 90) ?? "(brez lokacije)"}`);
    }
  }
  await saveJson({ set, mode, conc, results }, outPrefix);
} else if (set === "hubs") {
  const all = await sitemapUrls();
  const hubs = hubUrls(all);
  console.log(`Najdenih hub URL-jev: ${hubs.length}`);
  const results = await runPool(hubs, conc, (u) => fetchCheck(u, { wantBody: true }));
  summarize(results, `HUBS ${mode} (${hubs.length} URL-jev)`);
  const missingCanonical = results.filter((r) => r.html && !r.html.canonical);
  const missingJsonLd = results.filter((r) => r.html && (r.html.jsonLdCount ?? 0) === 0);
  const missingHreflang = results.filter((r) => r.html && (r.html.hreflang?.length ?? 0) === 0);
  console.log(`  brez canonical: ${missingCanonical.length} | brez JSON-LD: ${missingJsonLd.length} | brez hreflang: ${missingHreflang.length}`);
  await saveJson({ set, mode, conc, count: hubs.length, results }, outPrefix);
} else if (set === "sitemap") {
  const all = await sitemapUrls();
  console.log(`Sitemap vsebuje ${all.length} URL-jev`);
  const results = await runPool(all, conc, (u) => fetchCheck(u));
  summarize(results, `SITEMAP ${mode} (${all.length} URL-jev)`);
  await saveJson({ set, mode, conc, count: all.length, results }, outPrefix);
} else if (set === "links") {
  const all = await sitemapUrls();
  const sources = [`${BASE}/`, `${BASE}/en`, ...hubUrls(all)];
  console.log(`Viri za ekstrakcijo linkov: ${sources.length}`);
  const linkSet = new Map<string, string[]>();
  await runPool(sources, 4, async (src) => {
    const r = await fetchCheck(src, { wantBody: true });
    if (r.status === 200) {
      // telo moramo pridobiti še enkrat (fetchCheck ga je že prebral — uporabi size signal)
      const body = await (await fetch(src, { signal: AbortSignal.timeout(TIMEOUT_MS) })).text();
      for (const l of extractInternalLinks(body, src)) {
        const prev = linkSet.get(l) ?? [];
        if (!prev.includes(src)) prev.push(src);
        linkSet.set(l, prev);
      }
    }
    return r;
  });
  const targets = [...linkSet.keys()];
  console.log(`Unikatnih internih linkov: ${targets.length}`);
  const results = await runPool(targets, conc, (u) => fetchCheck(u));
  summarize(results, `LINKS ${mode} (${targets.length} URL-jev)`);
  const dead = results.filter((r) => r.status >= 400 || r.status === 0);
  if (dead.length > 0) {
    console.log("Mrtvi linki (vir → tarča):");
    for (const d of dead) {
      const sources2 = (linkSet.get(d.url) ?? []).map((s) => s.replace(BASE, "")).slice(0, 3);
      console.log(`  ${d.status || "ERR"} ${d.url.replace(BASE, "")} ← ${sources2.join(", ")}`);
    }
  }
  await saveJson({ set, mode, conc, sources: sources.length, count: targets.length, results }, outPrefix);
} else if (set === "api") {
  // Neon connection stres — GET /api/listings vzporedno (brez POST rate limita)
  const targets: { url: string; kind: string }[] = [];
  for (let i = 0; i < 12; i++) {
    targets.push({ url: `${BASE}/api/listings`, kind: `listings-${i}` });
  }
  targets.push({ url: `${BASE}/api/ai-health`, kind: "ai-health" });
  const results = await runPool(targets, conc, async (t) => {
    const started = Date.now();
    try {
      const res = await fetch(t.url, { signal: AbortSignal.timeout(60_000) });
      const body = res.status >= 400 ? await res.text().catch(() => "") : "";
      return {
        url: t.url,
        status: res.status,
        ok: res.ok,
        timeMs: Date.now() - started,
        bodyHint: body.slice(0, 300) || undefined,
      } as CheckResult;
    } catch (e) {
      return {
        url: t.url,
        status: 0,
        ok: false,
        timeMs: Date.now() - started,
        error: e instanceof Error ? e.message : String(e),
      } as CheckResult;
    }
  });
  summarize(results, `API ${mode} (${targets.length} klicev)`);
  const prismaErr = results.filter((r) => /prisma|connection|pool|P10\d\d|Timed out/i.test(r.bodyHint ?? r.error ?? ""));
  console.log(`  znaki Prisma/Neon connection napak: ${prismaErr.length}`);
  for (const p of prismaErr.slice(0, 5)) console.log(`    → ${p.bodyHint ?? p.error}`);
  await saveJson({ set, mode, conc, results }, outPrefix);
} else if (set === "recheck") {
  const src = process.argv[4] ?? "";
  const file = Bun.file(`${RESULTS_DIR}/${src}.json`);
  const data = (await file.json()) as { results: CheckResult[] };
  const failedUrls = data.results
    .filter((r) => r.status !== 200 && !(r.status >= 300 && r.status < 400 && r.url.includes("/go/")))
    .map((r) => r.url);
  console.log(`Ponovni test ${failedUrls.length} spornih URL-jev iz '${src}'`);
  const results = await runPool(failedUrls, 3, (u) => fetchCheck(u));
  summarize(results, `RECHECK (${failedUrls.length} URL-jev)`);
  await saveJson({ set: "recheck", mode: src, conc: 3, results }, `${outPrefix}`);
} else {
  console.error(`Neznan set: ${set}`);
  process.exit(1);
}
