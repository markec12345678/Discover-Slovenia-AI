// rss.xml — RSS 2.0 kanal (MONET-10).
//
// NAMEN: svežinski signal (Bing/Google odkrijeta nove/posodobljene strani
// prek feed odkrivanja) + baza za bralnike vsebin. ISKRENOST: itemi nimajo
// izmišljenega pubDate (realnega časa objave ne beležimo) — kanal nosi
// lastBuildDate trenutka generiranja, kar je spec-skladno in resnično.
//
// Vsebina: things-to-do strani vseh destinacij (najbogatejša vsebina)
// + vodniki po tipu potovanja. URL-ji so gostitelju-prilagojeni (allowlist).

import { DESTINATIONS } from "@/lib/slovenia-data";
import { resolveBaseUrl } from "@/lib/host";
import {
  GUIDE_TYPES,
  GUIDE_TYPE_META,
} from "@/lib/sitemap-urls";

export const dynamic = "force-dynamic";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(d: Date): string {
  // RSS 2.0 zahteva RFC 822 (npr. "Sat, 12 Sep 2026 07:00:00 GMT")
  // — toUTCString() ta format že izda.
  return d.toUTCString();
}

export async function GET(req: Request) {
  const base = resolveBaseUrl(req);

  const items: string[] = [];

  // Things-to-do strani — jedro vsebinske ponudbe
  for (const d of DESTINATIONS) {
    items.push(
      [
        "    <item>",
        `      <title>${xmlEscape(d.name)} — kaj početi in videti</title>`,
        `      <link>${xmlEscape(`${base}/destinacija/${d.slug}/things-to-do`)}</link>`,
        `      <guid>${xmlEscape(`${base}/destinacija/${d.slug}/things-to-do`)}</guid>`,
        `      <description>${xmlEscape(`${d.tagline}. ${d.highlights.slice(0, 4).join(", ")} — vodnik z aktivnostmi, nasveti in praktičnimi informacijami.`)}</description>`,
        `      <category>${xmlEscape(d.region)}</category>`,
        "    </item>",
      ].join("\n"),
    );
  }

  // Vodniki po tipu potovanja
  for (const d of DESTINATIONS) {
    for (const t of GUIDE_TYPES) {
      const meta = GUIDE_TYPE_META[t];
      items.push(
        [
          "    <item>",
          `      <title>${xmlEscape(`${d.name}: ${meta.label}`)}</title>`,
          `      <link>${xmlEscape(`${base}/destinacija/${d.slug}/guide/${t}`)}</link>`,
          `      <guid>${xmlEscape(`${base}/destinacija/${d.slug}/guide/${t}`)}</guid>`,
          `      <description>${xmlEscape(`${d.name} — ${d.tagline}. ${meta.description}`)}</description>`,
          `      <category>${xmlEscape(meta.label)}</category>`,
          "    </item>",
      ].join("\n"),
      );
    }
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0">\n' +
    "  <channel>\n" +
    "    <title>Discover Slovenia AI — vodniki po Sloveniji</title>\n" +
    `    <link>${xmlEscape(base)}</link>\n` +
    "    <description>AI načrtovalec potovanj po Sloveniji: destinacije, itinererji, vodniki, kaj početi in najboljši čas obiska.</description>\n" +
    "    <language>sl-si</language>\n" +
    `    <lastBuildDate>${rfc822(new Date())}</lastBuildDate>\n` +
    `    <atom:link href="${xmlEscape(`${base}/rss.xml`)}" rel="self" type="application/rss+xml" xmlns:atom="http://www.w3.org/2005/Atom"/>\n` +
    items.join("\n") +
    "\n  </channel>\n" +
    "</rss>\n";

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=1800",
    },
  });
}
