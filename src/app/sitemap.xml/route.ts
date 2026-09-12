// sitemap.xml — GOSTITELJU-PRILAGOJEN route handler (MONET-10).
//
// POPRAVEK KRTIČNE INDEKSACIJSKE BLOKADE: prej je sitemap (statična
// MetadataRoute) izpisoval URL-je discoverslovenia.ai — domene, ki nima
// niti DNS-ja — ne glede na to, prek katerega gostitelja je bil strenjen.
// Google/Bing cross-host sitemap ZAVRNEJO V CELOTI ("URL is not under the
// sitemap's host") → 322 URL-jev je bilo za iskalnike nevidnih.
//
// Zdaj: URL-ji se generirajo iz DEJANSKEGA gostitelja zahteve (allowlist,
// glej src/lib/host.ts) → veljavno na onrender.com, vercel.app in na
// prihodnji primarni domeni brez spremembe kode.
//
// ISKRENOST lastmod: prej je vsak URL nosil lastmod = čas gradnje
// ("vse se je spremenilo ob vsakem deployu") — Google napihnjen lastmod
// po dolgotrajnejši nezanesljivosti IGNORIRA. Realnega časa spremembe
// posamezne strani ni → lastmod POŠTENO izpuščen (changefreq + priority
// ostajata).

import { getAllSitemapUrls } from "@/lib/sitemap-urls";
import { resolveBaseUrl } from "@/lib/host";

export const dynamic = "force-dynamic";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(req: Request) {
  const base = resolveBaseUrl(req);
  const urls = getAllSitemapUrls(base);

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map(
        (u) =>
          "  <url>\n" +
          `    <loc>${xmlEscape(u.url)}</loc>\n` +
          `    <changefreq>${u.changeFrequency}</changefreq>\n` +
          `    <priority>${u.priority.toFixed(1)}</priority>\n` +
          "  </url>",
      )
      .join("\n") +
    "\n</urlset>\n";

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Sitemap se spreminja samo ob deployu — urna cache je varna in
      // prijazna do izvora (322 URL-jev, ~30 KB).
      "Cache-Control": "public, max-age=3600",
    },
  });
}
