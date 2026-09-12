// robots.txt — GOSTITELJU-PRILAGOJEN route handler (MONET-10).
//
// ZAKAJ route handler in ne app/robots.ts (MetadataRoute):
//   1. MetadataRoute ne vidi zahteve → "Sitemap:" je moral kazati na
//      statično domeno, ki ne streže (discoverslovenia.ai ne obstaja),
//      Google pa IGNORIRA cross-host sitemap direktive.
//   2. Prej je public/robots.txt (brez Sitemap direktive, brez /admin
//      disallow) NEMOČNO preglašal generator na Renderu — na Vercelu je
//      zmagal generator → isti commit, DVA RAZLIČNA robots.txt.
//      Zdaj: en sam vir resnice, isto vedenje povsod.
//
// Vsebina: dovoli vse crawlerje (naš cilj je vidnost), zaščiti admin/
// owner/api, ter EKSPlicitno dovoli AI iskalne crawlerje (GEO 2026 —
// ločeni "training" vs "search" agenti; za promet štejeta obe, naš
// interes je citiranost v AI odgovorih, ne blokada).

import { resolveBaseUrl } from "@/lib/host";

export const dynamic = "force-dynamic";

const BLOCKED_PATHS = ["/admin", "/owner", "/api/"];

// AI crawlerji, ki nas lahko citirajo v odgovorih ali učijo entitete.
// Eksplicitna pravila so odporne proti prihodnjim privzetim omejitvam
// platform in pošiljajo jasen signal namena (2026 praksa).
const AI_AGENTS = [
  "GPTBot", // OpenAI — trening (poznavanje entitet)
  "OAI-SearchBot", // OpenAI — iskanje (ChatGPT search)
  "ChatGPT-User", // OpenAI — uporabniško brskanje
  "ClaudeBot", // Anthropic — trening
  "Claude-Web", // Anthropic — uporabniško brskanje
  "Claude-SearchBot", // Anthropic — iskanje
  "PerplexityBot", // Perplexity — indeksiranje/iskanje
  "Perplexity-User", // Perplexity — uporabniško brskanje
  "Google-Extended", // Google — Gemini grounding
  "Applebot", // Apple — Siri/Spotlight
  "Applebot-Extended", // Apple — AI trening
  "CCBot", // Common Crawl — odprti korpusi
  "Meta-ExternalAgent", // Meta — AI agenti
  "cohere-ai", // Cohere
];

function group(userAgents: string[]): string {
  const lines = [
    `User-agent: ${userAgents.join("\nUser-agent: ")}`,
    "Allow: /",
    ...BLOCKED_PATHS.map((p) => `Disallow: ${p}`),
  ];
  return lines.join("\n");
}

export async function GET(req: Request) {
  const base = resolveBaseUrl(req);

  const body = [
    "# Discover Slovenia AI — robots.txt (dinamično, prilagojeno gostitelju; rev2 — marker 0f35+1)",
    "# Zasebni deli (admin/lastniki/API) so zaprti za vse crawlerje.",
    "# AI iskalni agenti so dobrodošli — cilj platforme je citiranost v AI odgovorih.",
    "",
    group(["*"]),
    "",
    "# --- AI crawlerji (GEO 2026): eksplicitna dovoljenja ---",
    group(AI_AGENTS),
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Edge mora vedno preveriti izvor (incident: zastareli 26-bajtni
      // "Disallow: /" cache vnos na Render CDNju).
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
