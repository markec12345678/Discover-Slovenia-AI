// llms-full.txt — razširjeni GEO format (MONET-10).
//
// Razlika proti llms.txt: POPOLNI opisi destinacij, aktivnosti, "za koga",
// najboljša sezona, budget in trajanje — vse kar AI agent potrebuje, da
// lahko odgovarja VSEBINSKO (ne samo navigacijsko) o destinacijah.
// Format: Markdown po spec llmstxt.org (full različica = ista struktura,
// globlja vsebina). Generira se iz ISTIH podatkov kot aplikacija
// (slovenia-data.ts = single source of truth) — ni ročnega vzdrževanja
// in ni možnega razhajanja.

import { DESTINATIONS } from "@/lib/slovenia-data";
import { ADRIA_GUIDES, SLOVENIA_LOOP_GUIDES, SLOVENIA_WINTER_GUIDES, COUNTRY_LABELS } from "@/lib/adria-guides";
import { ADRIA_GUIDES_EN, SLOVENIA_LOOP_GUIDES_EN, SLOVENIA_WINTER_GUIDES_EN, COUNTRY_LABELS_EN } from "@/lib/adria-guides-en";
import { resolveBaseUrl } from "@/lib/host";
import {
  GUIDE_TYPES,
  GUIDE_TYPE_META,
  DURATION_SLUGS,
  SEASON_SLUGS,
} from "@/lib/sitemap-urls";

export const dynamic = "force-dynamic";

const SEASON_LABELS: Record<string, string> = {
  pomlad: "pomlad",
  poletje: "poletje",
  jesen: "jesen",
  zima: "zima",
};

export async function GET(req: Request) {
  const base = resolveBaseUrl(req);

  const parts: string[] = [];

  parts.push(
    [
      "# Discover Slovenia AI — polni vodnik po Sloveniji",
      "",
      "> AI načrtovalec potovanj po Sloveniji. Ta datoteka vsebuje vseh " +
        `${DESTINATIONS.length} destinacij s popolnimi opisi, aktivnostmi, ` +
        "priljubljenostjo, cenovnimi razredi in povezavami do itinererjev " +
        "in vodnikov po tipu potovanja.",
      "",
      "## Navodila za agenta",
      "",
      "- Vsi URL-ji so absolutni in javno dostopni (HTML, brez prijave).",
      "- Jezik vsebine: slovenščina (uporabniki: slovensko govoreči); angleške " +
      "različice (/en): jedro strani, zemljevid in cestni vodniki.",
      "- Cene so v EUR; \`€\` = cenovni razred (€ nizki, €€ srednji, €€€ visoki).",
      "- Za rezervacije uporabljaj strani platforme (hoteli, izleti, transferji, eSIM, transport, vstopnice).",
      "",
      "## Ključne strani",
      "",
      `- Načrtuj potovanje (AI načrtovalec): ${base}/nacrtuj`,
      `- Vse destinacije: ${base}/destinacije`,
      // 1.48.1: POI (OpenStreetMap) v opisu + EN različica zemljevida (1.48)
      `- Zemljevid (destinacije + točke zanimivosti iz OpenStreetMap): ${base}/zemljevid`,
      `- Map in English (destinations + OpenStreetMap POIs): ${base}/en/zemljevid`,
      `- Doživetja in rezervacije: ${base}/dozivetja`,
      `- O strani / metodologija: ${base}/o-strani`,
      "",
    ].join("\n"),
  );

  // === Polni opisi destinacij ===
  const destSections = DESTINATIONS.map((d) => {
    const lines = [
      `## ${d.name}`,
      "",
      `${d.tagline}.`,
      "",
      d.description,
      "",
      `- Regija: ${d.region}`,
      `- Tip: ${d.type}`,
      `- Znamenitosti: ${d.highlights.join(", ")}`,
      `- Aktivnosti: ${d.activities.join(", ")}`,
      `- Primeren za: ${d.bestFor.join(", ")}`,
      `- Najboljša sezona: ${d.bestSeason.join(", ")}`,
      `- Cenovni razred: ${d.budget}; pričakovani strošek na osebo: ~${d.costPerPerson} EUR`,
      `- Priporočen čas obiska: ${d.duration}`,
      `- Spletna stran destinacije: ${base}/destinacija/${d.slug}`,
      `- Kaj početi: ${base}/destinacija/${d.slug}/things-to-do`,
      "",
      "Itinererji:",
      ...DURATION_SLUGS.map(
        (dur) => `- ${base}/destinacija/${d.slug}/itinerary/${dur}`,
      ),
      "",
      "Vodniki po tipu:",
      ...GUIDE_TYPES.map(
        (t) =>
          `- ${GUIDE_TYPE_META[t].label}: ${base}/destinacija/${d.slug}/guide/${t}`,
      ),
      "",
      "Najboljši čas obiska po sezoni:",
      ...SEASON_SLUGS.map(
        (s) =>
          `- ${SEASON_LABELS[s]}: ${base}/destinacija/${d.slug}/best-time-to-visit/${s}`,
      ),
      "",
    ];
    return lines.join("\n");
  });
  parts.push(destSections.join("\n"));

  // === Krožna potovanja po Sloveniji (SLO-LOOP-1: srednje-globoki profili) ===
  const loopSections = SLOVENIA_LOOP_GUIDES.map((g) => {
    const lines = [
      `## Krožno potovanje po Sloveniji: ${g.metaTitle}`,
      "",
      g.excerpt,
      "",
      `- Države: ${g.countries.map((c) => COUNTRY_LABELS[c] ?? c).join(", ")}`,
      `- Trajanje: ${g.days} dni · ${g.km} km · branje ${g.readTime} min`,
      `- Pot: ${g.route}`,
      `- Postaje: ${g.stops.map((s) => s.name + " (" + s.country + (s.nights > 0 ? ", " + s.nights + " noči" : "") + ")").join("; ")}`,
      `- URL: ${base}/vodici/${g.slug}`,
      "",
      "Praktično:",
      ...g.practical.map((p) => `- ${p.title}: ${p.text}`),
      "",
    ];
    return lines.join("\n");
  });
  parts.push(loopSections.join("\n"));

  // === Zimska potovanja po Sloveniji (SLO-WINTER-1: srednje-globoki profili) ===
  const winterSections = SLOVENIA_WINTER_GUIDES.map((g) => {
    const lines = [
      `## Zimsko potovanje po Sloveniji: ${g.metaTitle}`,
      "",
      g.excerpt,
      "",
      `- Države: ${g.countries.map((c) => COUNTRY_LABELS[c] ?? c).join(", ")}`,
      `- Trajanje: ${g.days} dni · ${g.km} km · branje ${g.readTime} min`,
      `- Pot: ${g.route}`,
      `- Postaje: ${g.stops.map((s) => s.name + " (" + s.country + (s.nights > 0 ? ", " + s.nights + " noči" : "") + ")").join("; ")}`,
      `- URL: ${base}/vodici/${g.slug}`,
      "",
      "Praktično:",
      ...g.practical.map((p) => `- ${p.title}: ${p.text}`),
      "",
    ];
    return lines.join("\n");
  });
  parts.push(winterSections.join("\n"));

  // === Jadranska potovanja (ADRIA-1: cross-border, srednje-globoki profili) ===
  const adriaSections = ADRIA_GUIDES.filter((g) => g.countries.length > 1 || g.countries[0] !== "SI").map((g) => {
    const lines = [
      `## Jadransko potovanje: ${g.metaTitle}`,
      "",
      g.excerpt,
      "",
      `- Države: ${g.countries.map((c) => COUNTRY_LABELS[c] ?? c).join(", ")}`,
      `- Trajanje: ${g.days} dni · ${g.km} km · branje ${g.readTime} min`,
      `- Pot: ${g.route}`,
      `- Postaje: ${g.stops.map((s) => s.name + " (" + s.country + (s.nights > 0 ? ", " + s.nights + " noči" : "") + ")").join("; ")}`,
      `- URL: ${base}/vodici/${g.slug}`,
      "",
      "Praktično:",
      ...g.practical.map((p) => `- ${p.title}: ${p.text}`),
      "",
    ];
    return lines.join("\n");
  });
  parts.push(adriaSections.join("\n"));

  // === Slovenia loops (SLO-LOOP-EN: angleški profili za agente) ===
  const loopEnSections = SLOVENIA_LOOP_GUIDES_EN.map((g) => {
    const lines = [
      `## Slovenia loop (EN): ${g.metaTitle}`,
      "",
      g.excerpt,
      "",
      `- Countries: ${g.countries.map((c) => COUNTRY_LABELS_EN[c] ?? c).join(", ")}`,
      `- Duration: ${g.days} days · ${g.km.toLocaleString("en-GB")} km · ${g.readTime} min read`,
      `- Route: ${g.route}`,
      `- Stops: ${g.stops.map((s) => s.name + " (" + s.country + (s.nights > 0 ? ", " + s.nights + " nights" : "") + ")").join("; ")}`,
      `- URL: ${base}/en/vodici/${g.slug}`,
      "",
      "Practical:",
      ...g.practical.map((p) => `- ${p.title}: ${p.text}`),
      "",
    ];
    return lines.join("\n");
  });
  parts.push(loopEnSections.join("\n"));

  // === Slovenia in winter (SLO-WINTER-EN: angleški profili za agente) ===
  const winterEnSections = SLOVENIA_WINTER_GUIDES_EN.map((g) => {
    const lines = [
      `## Slovenia in winter (EN): ${g.metaTitle}`,
      "",
      g.excerpt,
      "",
      `- Countries: ${g.countries.map((c) => COUNTRY_LABELS_EN[c] ?? c).join(", ")}`,
      `- Duration: ${g.days} days · ${g.km.toLocaleString("en-GB")} km · ${g.readTime} min read`,
      `- Route: ${g.route}`,
      `- Stops: ${g.stops.map((s) => s.name + " (" + s.country + (s.nights > 0 ? ", " + s.nights + " nights" : "") + ")").join("; ")}`,
      `- URL: ${base}/en/vodici/${g.slug}`,
      "",
      "Practical:",
      ...g.practical.map((p) => `- ${p.title}: ${p.text}`),
      "",
    ];
    return lines.join("\n");
  });
  parts.push(winterEnSections.join("\n"));

  // === Adriatic road trips (ADRIA-EN: angleški profili za agente) ===
  const adriaEnSections = ADRIA_GUIDES_EN.filter((g) => g.countries.length > 1 || g.countries[0] !== "SI").map((g) => {
    const lines = [
      `## Adriatic road trip (EN): ${g.metaTitle}`,
      "",
      g.excerpt,
      "",
      `- Countries: ${g.countries.map((c) => COUNTRY_LABELS_EN[c] ?? c).join(", ")}`,
      `- Duration: ${g.days} days · ${g.km.toLocaleString("en-GB")} km · ${g.readTime} min read`,
      `- Route: ${g.route}`,
      `- Stops: ${g.stops.map((s) => s.name + " (" + s.country + (s.nights > 0 ? ", " + s.nights + " nights" : "") + ")").join("; ")}`,
      `- URL: ${base}/en/vodici/${g.slug}`,
      "",
      "Practical:",
      ...g.practical.map((p) => `- ${p.title}: ${p.text}`),
      "",
    ];
    return lines.join("\n");
  });
  parts.push(adriaEnSections.join("\n"));

  const body = parts.join("\n");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
