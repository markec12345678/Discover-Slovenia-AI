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
import { ADRIA_GUIDES, SLOVENIA_LOOP_GUIDES, SLOVENIA_WINTER_GUIDES, COUNTRY_LABELS } from "@/lib/adria-guides";
import { ADRIA_GUIDES_EN, SLOVENIA_LOOP_GUIDES_EN, SLOVENIA_WINTER_GUIDES_EN, COUNTRY_LABELS_EN } from "@/lib/adria-guides-en";
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
      `- [Zemljevid](${base}/zemljevid): interaktivni zemljevid Slovenije — vseh ${DESTINATIONS.length} destinacij plus točke zanimivosti iz OpenStreetMap (znamenitosti, muzeji, narava, razgledi, sakralni objekti, hrana in pijača, nastanitve, trgovine).`,
      // 1.48.1: EN zemljevid je od 1.48 na EN whitelisti — GEO ozaveščenost
      // (del istega kandidata "llms.txt ozaveščanje EN zemljevida" iz workloga)
      `- [Map — English](${base}/en/zemljevid): interactive map of Slovenia — all ${DESTINATIONS.length} destinations plus points of interest from OpenStreetMap (attractions, museums, nature, viewpoints, religious sites, food & drink, stays, shops).`,
      `- [Doživetja](${base}/dozivetja): izkušnje in aktivnosti z neposrednimi rezervacijami.`,
      `- [Tržnica](${base}/trznica): lokalni izdelki in darila slovenskih ponudnikov.`,
      `- [Vodiči](${base}/vodici): vodniki po tipih potovanj.`,
      `- [Primerjava AI načrtovalcev](${base}/primerjava): iskrena primerjava splošnih AI načrtovalcev (Mindtrip, Layla, Wanderlog) s specializom za Slovenijo — brez prijave, slovenščina in angleščina, geo-validacija, lokalne rezervacije.`,
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

  // === Zimska potovanja po Sloveniji (SLO-WINTER-1: zimski vodniki) ===
  sections.push(
    [
      "## Zimska potovanja po Sloveniji",
      "",
      ...SLOVENIA_WINTER_GUIDES.map(
        (g) =>
          `- [${g.metaTitle}](${base}/vodici/${g.slug}): zimski road trip vodnik — ${g.days} dni, ${g.km} km, ` +
          `${g.countries.map((c) => COUNTRY_LABELS[c] ?? c).join(", ")}. ${g.description}`,
      ),
      "",
    ].join("\n"),
  );

  // === Potovanja po Sloveniji (SLO-LOOP-1: domači krožni vodniki) ===
  sections.push(
    [
      "## Krožna potovanja po Sloveniji",
      "",
      ...SLOVENIA_LOOP_GUIDES.map(
        (g) =>
          `- [${g.metaTitle}](${base}/vodici/${g.slug}): krožni road trip vodnik — ${g.days} dni, ${g.km} km, ` +
          `${g.countries.map((c) => COUNTRY_LABELS[c] ?? c).join(", ")}. ${g.description}`,
      ),
      "",
    ].join("\n"),
  );

  // === Jadranska potovanja (ADRIA-1: cross-border) ===
  sections.push(
    [
      "## Jadranska potovanja (cross-border)",
      "",
      ...ADRIA_GUIDES.filter((g) => g.countries.length > 1 || g.countries[0] !== "SI").map(
        (g) =>
          `- [${g.metaTitle}](${base}/vodici/${g.slug}): road trip vodnik — ${g.days} dni, ${g.km} km, ` +
          `${g.countries.map((c) => COUNTRY_LABELS[c] ?? c).join(", ")}. ${g.description}`,
      ),
      "",
    ].join("\n"),
  );

  // === Slovenia in winter (SLO-WINTER-EN: angleške različice) ===
  sections.push(
    [
      "## Slovenia in winter (English)",
      "",
      ...SLOVENIA_WINTER_GUIDES_EN.map(
        (g) =>
          `- [${g.metaTitle}](${base}/en/vodici/${g.slug}): winter road trip guide — ${g.days} days, ${g.km.toLocaleString("en-GB")} km, ` +
          `${g.countries.map((c) => COUNTRY_LABELS_EN[c] ?? c).join(", ")}. ${g.description}`,
      ),
      "",
    ].join("\n"),
  );

  // === Slovenia loops (SLO-LOOP-EN: angleške različice) ===
  sections.push(
    [
      "## Slovenia loops (English)",
      "",
      ...SLOVENIA_LOOP_GUIDES_EN.map(
        (g) =>
          `- [${g.metaTitle}](${base}/en/vodici/${g.slug}): circular road trip guide — ${g.days} days, ${g.km.toLocaleString("en-GB")} km, ` +
          `${g.countries.map((c) => COUNTRY_LABELS_EN[c] ?? c).join(", ")}. ${g.description}`,
      ),
      "",
    ].join("\n"),
  );

  // === Adriatic road trips (ADRIA-EN: angleške različice) ===
  sections.push(
    [
      "## Adriatic road trips (English)",
      "",
      `- [Guides hub](${base}/en/vodici): all road trip guides in English — Slovenia loops and cross-border Adriatic trips.`,
      ...ADRIA_GUIDES_EN.filter((g) => g.countries.length > 1 || g.countries[0] !== "SI").map(
        (g) =>
          `- [${g.metaTitle}](${base}/en/vodici/${g.slug}): road trip guide — ${g.days} days, ${g.km.toLocaleString("en-GB")} km, ` +
          `${g.countries.map((c) => COUNTRY_LABELS_EN[c] ?? c).join(", ")}. ${g.description}`,
      ),
      "",
    ].join("\n"),
  );

  const body = [
    "# Discover Slovenia AI",
    "",
    "> AI načrtovalec potovanj po Sloveniji: " +
        `${DESTINATIONS.length} destinacij, interaktivni zemljevid s točkami zanimivosti (OpenStreetMap), itinererji po trajanju, ` +
        "vodniki po tipu potovanja, kaj početi, najboljši čas obiska, krožna " +
        "potovanja po Sloveniji, zimska potovanja, jadranska cross-border " +
        "potovanja in neposredne rezervacije (hoteli, izleti, transferji, eSIM, " +
        "transport, vstopnice). Jedro lijaka, zemljevid, krožni in jadranski " +
        "vodniki so na voljo tudi v angleščini (/en).",
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
