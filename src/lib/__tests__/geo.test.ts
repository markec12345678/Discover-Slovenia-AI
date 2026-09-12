/// <reference types="bun-types" />
// GEO/vidnost infrastruktura — unit testi (MONET-10).
// Zagon: bun test src/lib/__tests__/geo.test.ts
//
// Pokriva:
//   1. host.ts: allowlist gostiteljev (produkcija/preview/lokalno),
//      host-header injection napadi (evil.com, evil-onrender.com,
//      presledki/pot/neveljavni znaki) → fallback na privzeto domeno
//   2. robots.txt route: Sitemap direktiva KAŽE NA GOSTITELJA ZAHTEVE
//      (kritični popravek cross-host blokade), Allow/Disallow pravila,
//      eksplicitna AI crawler dovoljenja
//   3. sitemap.xml route: URL-ji z DEJANSKEGA gostitelja (ne mrtve domene),
//      vsebuje GEO poti (llms.txt, rss.xml), številko URL-jev, XML izhod
//   4. llms.txt / llms-full.txt: spec struktura (# naslov, > povzetek,
//      povezave z opisi), gostitelju-prilagojeni URL-ji
//   5. rss.xml: veljaven RSS 2.0 ogrodje, jezik, item številke
//   6. pogoji-uporabe/pot stranice: (izpuščeno — pokrito v smoke)

import { describe, test, expect } from "bun:test";
import { isAllowedHost, resolveBaseUrl, DEFAULT_BASE_URL } from "@/lib/host";
import { hreflangForPath, destinationSchema } from "@/components/seo";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { getTotalSitemapUrlCount } from "@/lib/sitemap-urls";
// Route handlerji so čiste funkcije — jih lahko pokličemo s sintetičnimi Requesti.
import { GET as robotsGET } from "@/app/robots.txt/route";
import { GET as sitemapGET } from "@/app/sitemap.xml/route";
import { GET as llmsGET } from "@/app/llms.txt/route";
import { GET as llmsFullGET } from "@/app/llms-full.txt/route";
import { GET as rssGET } from "@/app/rss.xml/route";

function req(host: string, extra: Record<string, string> = {}): Request {
  return new Request("http://placeholder/", {
    headers: { host, ...extra },
  });
}

const RENDER = "i-feel-slovenia.onrender.com";
const VERCEL = "i-feel-slovenia.vercel.app";

// ─── host.ts ───────────────────────────────────────────────────────────────

describe("host allowlist", () => {
  test("dovoljeni gostitelji (produkcija/preview/lokalno/primarna domena)", () => {
    expect(isAllowedHost(RENDER)).toBe(true);
    expect(isAllowedHost("neki-staging.onrender.com")).toBe(true);
    expect(isAllowedHost(VERCEL)).toBe(true);
    expect(isAllowedHost("dsa-xyz.vercel.app")).toBe(true);
    expect(isAllowedHost("discoverslovenia.ai")).toBe(true);
    expect(isAllowedHost("www.discoverslovenia.ai")).toBe(true);
    expect(isAllowedHost("localhost")).toBe(true);
    expect(isAllowedHost("127.0.0.1")).toBe(true);
  });

  test("host-header injection napadi zavrnjeni", () => {
    expect(isAllowedHost("evil.com")).toBe(false);
    // pika pred končnico je OBVEZNA — evil-onrender.com NE ujame .onrender.com
    expect(isAllowedHost("evil-onrender.com")).toBe(false);
    expect(isAllowedHost("onrender.com.evil.com")).toBe(false);
    expect(isAllowedHost("evil.onrender.com.attacker.io")).toBe(false);
    expect(isAllowedHost("")).toBe(false);
    expect(isAllowedHost("evil.com/x")).toBe(false);
    expect(isAllowedHost("evil.com\\x")).toBe(false);
    expect(isAllowedHost("evil .com")).toBe(false);
  });

  test("resolveBaseUrl: gostitelj zahteve → baza; napad → privzeta domena", () => {
    expect(resolveBaseUrl(req(RENDER))).toBe(`https://${RENDER}`);
    expect(resolveBaseUrl(req(VERCEL))).toBe(`https://${VERCEL}`);
    expect(resolveBaseUrl(req("localhost:3000"))).toBe("http://localhost:3000");
    // x-forwarded-host ima prednost (Render/CF ga nastavita)
    expect(
      resolveBaseUrl(
        req("internal-ignored", { "x-forwarded-host": RENDER }),
      ),
    ).toBe(`https://${RENDER}`);
    // napadalni Host → fallback na privzeto domeno (NE na napadalca)
    expect(resolveBaseUrl(req("evil.com"))).toBe(DEFAULT_BASE_URL);
    expect(resolveBaseUrl(req("evil-onrender.com"))).toBe(DEFAULT_BASE_URL);
    // brez glav → privzeta
    expect(resolveBaseUrl(new Request("http://placeholder/"))).toBe(
      DEFAULT_BASE_URL,
    );
  });
});

// ─── robots.txt ────────────────────────────────────────────────────────────

describe("robots.txt route", () => {
  test("Sitemap direktiva kaže na GOSTITELJA ZAHTEVE (cross-host popravek)", async () => {
    for (const h of [RENDER, VERCEL, "localhost:3000"]) {
      const res = await robotsGET(req(h));
      const body = await res.text();
      const base =
        h.startsWith("localhost") ? `http://${h}` : `https://${h}`;
      expect(body).toContain(`Sitemap: ${base}/sitemap.xml`);
    }
  });

  test("pravila: Allow / + zasebne poti zaprte + AI crawlerji dovoljeni", async () => {
    const body = await (await robotsGET(req(RENDER))).text();
    expect(body).toContain("User-agent: *");
    expect(body).toContain("Allow: /");
    expect(body).toContain("Disallow: /admin");
    expect(body).toContain("Disallow: /owner");
    expect(body).toContain("Disallow: /api/");
    for (const bot of [
      "GPTBot",
      "OAI-SearchBot",
      "ClaudeBot",
      "PerplexityBot",
      "Google-Extended",
    ]) {
      expect(body).toContain(`User-agent: ${bot}`);
    }
    // NI napihnjene blokade celotnega spletišča
    expect(body).not.toMatch(/Disallow: \/\s*$/);
  });

  test("Content-Type text/plain + no-cache glave", async () => {
    const res = await robotsGET(req(RENDER));
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("cache-control")).toContain("must-revalidate");
  });
});

// ─── sitemap.xml ───────────────────────────────────────────────────────────

describe("sitemap.xml route", () => {
  test("URL-ji z DEJANSKEGA gostitelja (ne mrtve privzete domene)", async () => {
    const body = await (await sitemapGET(req(RENDER))).text();
    expect(body).toContain(`https://${RENDER}/destinacija/bled/things-to-do`);
    expect(body).toContain(`https://${RENDER}/`);
    // NI URL-jev druge domene, ko je gostitelj znan
    expect(body).not.toContain("https://discoverslovenia.ai/");
  });

  test("napadalni Host → fallback na privzeto domeno (NE na napadalca)", async () => {
    const body = await (await sitemapGET(req("evil.com"))).text();
    expect(body).not.toContain("evil.com");
    expect(body).toContain(DEFAULT_BASE_URL);
  });

  test("število URL-jev se ujema s števcem + GEO poti vključene", async () => {
    const body = await (await sitemapGET(req(RENDER))).text();
    const locs = body.match(/<loc>/g) ?? [];
    expect(locs.length).toBe(getTotalSitemapUrlCount());
    expect(body).toContain(`https://${RENDER}/llms.txt`);
    expect(body).toContain(`https://${RENDER}/rss.xml`);
    // llms-full.txt namenoma NI v sitemapu (pomožni format za agente)
    expect(body).not.toContain("/llms-full.txt");
  });

  test("iskrenost: lastmod IZPUŠČEN (ni časa gradnje na vsem)", async () => {
    const body = await (await sitemapGET(req(RENDER))).text();
    expect(body).not.toContain("<lastmod>");
    expect(body).toContain("<changefreq>");
  });

  test("XML ogrodje + content-type", async () => {
    const res = await sitemapGET(req(RENDER));
    expect(res.headers.get("content-type")).toContain("application/xml");
    const body = await res.text();
    expect(body.startsWith('<?xml version="1.0"')).toBe(true);
    // FW4.3-2: urlset ima xhtml namespace za hreflang alternate
    expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(body).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
  });

  test("FW4.3-2 + ADRIA-EN: hreflang alternati (xhtml:link) + EN URL-ji", async () => {
    const body = await (await sitemapGET(req(RENDER))).text();
    // EN različice so v sitemapu (jedro lijaka na EN whitelisti)
    expect(body).toContain(`https://${RENDER}/en`);
    // hreflang gruča na SL poti: sl-SI + en-US + x-default
    expect(body).toContain(
      `hreflang="sl-SI" href="https://${RENDER}/destinacija/bled/things-to-do"`,
    );
    expect(body).toContain(
      `hreflang="en-US" href="https://${RENDER}/en/destinacija/bled/things-to-do"`,
    );
    expect(body).toContain(
      `hreflang="x-default" href="https://${RENDER}/destinacija/bled/things-to-do"`,
    );
    // ADRIA-EN: jadranski vodniki so NA whitelisti — EN različice + hreflang
    expect(body).toContain(`https://${RENDER}/en/vodici/kotor-crna-gora-iz-slovenije`);
    expect(body).toContain(
      `hreflang="sl-SI" href="https://${RENDER}/vodici/kotor-crna-gora-iz-slovenije"`,
    );
    expect(body).toContain(
      `hreflang="en-US" href="https://${RENDER}/en/vodici/kotor-crna-gora-iz-slovenije"`,
    );
    expect(body).toContain(`https://${RENDER}/en/vodici`);
    // EN poti, ki NISO na whitelisti (blog, dogodki), EN različice NIMAJO
    expect(body).not.toContain("/en/blog");
    expect(body).not.toContain("/en/dogodki");
  });
});

// ─── llms.txt / llms-full.txt ──────────────────────────────────────────────

describe("llms.txt route", () => {
  test("spec struktura: # naslov, > povzetek, sekcije s povezavami", async () => {
    const res = await llmsGET(req(RENDER));
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const body = await res.text();
    expect(body.startsWith("# Discover Slovenia AI")).toBe(true);
    expect(body).toContain("> AI načrtovalec potovanj po Sloveniji");
    expect(body).toContain("## Destinacije");
    expect(body).toContain(`[Bled](https://${RENDER}/destinacija/bled)`);
    expect(body).toContain("## Itinererji po trajanju");
    expect(body).toContain(`https://${RENDER}/destinacija/bled/itinerary/vikend`);
    expect(body).toContain(`[llms-full.txt](https://${RENDER}/llms-full.txt)`);
  });

  test("gostitelju-prilagojeni URL-ji (vercel drugačen od render)", async () => {
    const renderBody = await (await llmsGET(req(RENDER))).text();
    const vercelBody = await (await llmsGET(req(VERCEL))).text();
    expect(renderBody).toContain(`https://${RENDER}/`);
    expect(vercelBody).toContain(`https://${VERCEL}/`);
  });
});

describe("llms-full.txt route", () => {
  test("polni opisi destinacij + vsi tipi strani", async () => {
    const res = await llmsFullGET(req(RENDER));
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const body = await res.text();
    expect(body).toContain("# Discover Slovenia AI — polni vodnik po Sloveniji");
    expect(body).toContain("## Bled");
    // POPOLNI opis (ne samo tagline)
    expect(body).toContain("Blejsko jezero s svojim edinstvenim otokom");
    expect(body).toContain(`https://${RENDER}/destinacija/bled/best-time-to-visit/poletje`);
    expect(body).toContain(`https://${RENDER}/destinacija/bled/guide/romanticni-pobeg`);
  });
});

// ─── rss.xml ───────────────────────────────────────────────────────────────

describe("rss.xml route", () => {
  test("RSS 2.0 ogrodje + jezik + lastBuildDate", async () => {
    const res = await rssGET(req(RENDER));
    expect(res.headers.get("content-type")).toContain("application/rss+xml");
    const body = await res.text();
    expect(body.startsWith('<?xml version="1.0"')).toBe(true);
    expect(body).toContain('<rss version="2.0">');
    expect(body).toContain("<language>sl-si</language>");
    expect(body).toContain("<lastBuildDate>");
    expect(body).toContain(`https://${RENDER}/rss.xml`);
  });

  test("itemi: 22 things-to-do + 88 vodnikov + 10 jadranskih = 120, escapano besedilo", async () => {
    const body = await (await rssGET(req(RENDER))).text();
    const items = body.match(/<item>/g) ?? [];
    expect(items.length).toBe(120);
    expect(body).toContain(`https://${RENDER}/destinacija/bled/things-to-do`);
    expect(body).toContain(`https://${RENDER}/destinacija/bled/guide/druzinski`);
    // ADRIA-1: jadranski vodniki z RESNIČNIM pubDate (edini itemi z njim)
    expect(body).toContain(`https://${RENDER}/vodici/kotor-crna-gora-iz-slovenije`);
    expect(body).toMatch(/<pubDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4}/);
    // XML escape: & < > morajo biti entitete; UTF-8 šumniki so veljavni
    expect(body).not.toMatch(/<description>[^<]*[&<>][^<]*<\/description>/);
  });
});

// ─── SEO-2: host-honest canonical/hreflang/schema helperji ─────────────────

describe("SEO-2 — host-zavedni SEO helperji (components/seo.tsx)", () => {
  test("hreflangForPath: baseUrl parameter se upošteva (sl-SI + x-default)", () => {
    const langs = hreflangForPath("/destinacija/bled/things-to-do", "https://i-feel-slovenia.onrender.com");
    expect(langs["sl-SI"]).toBe("https://i-feel-slovenia.onrender.com/destinacija/bled/things-to-do");
    expect(langs["x-default"]).toBe("https://i-feel-slovenia.onrender.com/destinacija/bled/things-to-do");
    expect(JSON.stringify(langs)).not.toContain("discoverslovenia.ai");
  });

  test("destinationSchema: vsi URL-ji na podanem baseUrl (ne mrtva domena)", () => {
    const bled = DESTINATIONS.find((d) => d.slug === "bled")!;
    const schema = destinationSchema(bled, "https://i-feel-slovenia.onrender.com");
    const s = JSON.stringify(schema);
    expect(s).toContain("https://i-feel-slovenia.onrender.com/destinacija/bled/things-to-do");
    expect(s).not.toContain("https://discoverslovenia.ai");
    // containsPlace URL-ji so prav tako host-honest
    expect(s).not.toMatch(/"url":"https:\/\/discoverslovenia\.ai/);
  });

  test("default fallback (brez baseUrl) ostane varna domena — ne crash", () => {
    const langs = hreflangForPath("/x");
    expect(langs["sl-SI"]).toContain("/x");
  });
});
