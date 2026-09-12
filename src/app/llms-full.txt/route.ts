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
      "- Jezik vsebine: slovenščina (uporabniki: slovensko govoreči).",
      "- Cene so v EUR; \`€\` = cenovni razred (€ nizki, €€ srednji, €€€ visoki).",
      "- Za rezervacije uporabljaj strani platforme (hoteli, izleti, transferji, eSIM, transport, vstopnice).",
      "",
      "## Ključne strani",
      "",
      `- Načrtuj potovanje (AI načrtovalec): ${base}/nacrtuj`,
      `- Vse destinacije: ${base}/destinacije`,
      `- Zemljevid: ${base}/zemljevid`,
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

  const body = parts.join("\n");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
