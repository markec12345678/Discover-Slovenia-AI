// llms.txt — GEO format (MONET-10), spec llmstxt.org:
//   # Naslov
//   > enovrstični povzetek
//   ## Sekcija
//   - [Ime](URL): opis
//
// Raziskava 2026: AI crawlerji (GPTBot/ClaudeBot/PerplexityBot) datoteko
// pridobivajo REDKO — a cena vzdrževanja je NIČ (generira se iz istih
// podatkov kot sitemap) in spec je standard, ki ga vse več agentov
// pričakuje na korenu. NE dadjujemo lažnim obljubam: to je navigacijska
// pomoč, ne čarobni umetek citiranosti.
//
// llms-full.txt (posebna pot) vsebuje razširjeno vsebino (popolni opisi
// destinacij) za agente, ki želijo kontekst v enem zamihu.

import { DESTINATIONS } from "@/lib/slovenia-data";
import { resolveBaseUrl } from "@/lib/host";
import { GUIDE_TYPES, GUIDE_TYPE_META, DURATION_SLUGS } from "@/lib/sitemap-urls";

export const dynamic = "force-dynamic";

const DURATION_LABELS: Record<string, string> = {
  "1-dan": "1 dan",
  vikend: "vikend (2 dneva)",
  "3-dnevi": "3 dni",
  "5-dnevi": "5 dni",
  "7-dnevi": "7 dni",
};

export async function GET(req: Request) {
  const base = resolveBaseUrl(req);

  const sections: string[] = [];

  // === Ključne strani ===
  sections.push(
    [
      "## Ključne strani",
      "",
      `- [Načrtuj potovanje (AI)](${base}/nacrtuj): AI načrtovalec, ki iz destinacij, datumov in interesov sestavi popoln itinerer z razdaljami, cenami in alternativami.`,
      `- [Destinacije](${base}/destinacije): vseh ${DESTINATIONS.length} slovenskih destinacij z regijo, tipom, cenovnim razredom in najboljšo sezono.`,
      `- [Zemljevid](${base}/zemljevid): interaktivni zemljevid Slovenije z vsemi destinacijami.`,
      `- [Doživetja](${base}/dozivetja): izkušnje in aktivnosti z neposrednimi rezervacijami.`,
      `- [Tržnica](${base}/trznica): lokalni izdelki in darila slovenskih ponudnikov.`,
      `- [Vodiči](${base}/vodici): vodniki po tipih potovanj.`,
      `- [O strani](${base}/o-strani): metodologija, viri podatkov in uredniška načela (E-E-A-T).`,
      `- [RSS](${base}/rss.xml): kanal novih vodnikov in strani.`,
      "",
    ].join("\n"),
  );

  // === Destinacije ===
  sections.push(
    [
      `## Destinacije (${DESTINATIONS.length})`,
      "",
      ...DESTINATIONS.map(
        (d) => `- [${d.name}](${base}/destinacija/${d.slug}): ${d.tagline}.`,
      ),
      "",
    ].join("\n"),
  );

  // === Things to do ===
  sections.push(
    [
      "## Kaj početi (things-to-do)",
      "",
      ...DESTINATIONS.map(
        (d) =>
          `- [${d.name} — kaj početi](${base}/destinacija/${d.slug}/things-to-do): ${d.highlights.slice(0, 3).join(", ")} in več.`,
      ),
      "",
    ].join("\n"),
  );

  // === Itinererji ===
  sections.push(
    [
      "## Itinererji po trajanju",
      "",
      ...DESTINATIONS.flatMap((d) =>
        DURATION_SLUGS.map(
          (dur) =>
            `- [${d.name} — ${DURATION_LABELS[dur]}](${base}/destinacija/${d.slug}/itinerary/${dur}): podroben načrt (${DURATION_LABELS[dur]}) za ${d.name}.`,
        ),
      ),
      "",
    ].join("\n"),
  );

  // === Vodniki ===
  sections.push(
    [
      "## Vodniki po tipu potovanja",
      "",
      ...DESTINATIONS.flatMap((d) =>
        GUIDE_TYPES.map(
          (t) =>
            `- [${d.name} — ${GUIDE_TYPE_META[t].label}](${base}/destinacija/${d.slug}/guide/${t}): ${GUIDE_TYPE_META[t].description}`,
        ),
      ),
      "",
    ].join("\n"),
  );

  const body = [
    "# Discover Slovenia AI",
    "",
    "> AI načrtovalec potovanj po Sloveniji: 22 destinacij, itinererji po trajanju, vodniki po tipu potovanja, kaj početi, najboljši čas obiska in neposredne rezervacije (hoteli, izleti, transferji, eSIM, transport, vstopnice).",
    "",
    `Celotna vsebina v enem datotečnem formatu: [llms-full.txt](${base}/llms-full.txt)`,
    "",
    ...sections,
  ].join("\n");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
