import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Compass } from "lucide-react";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { ExperiencesSection } from "@/components/sections/experiences";
import { MarketplaceSection } from "@/components/sections/marketplace";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";

/**
 * /dozivetja — doživetja v Sloveniji (FW3: AI-first hierarhija).
 *
 * Polni imenik doživetij (pohodi, vodne avanture, kultura, kulinarika) z
 * razdelkom "skritih biserov". Tržnica pod njim se odpre s pripetim
 * zavihkom izkušenj (defaultTab="experiences"), da je pot do rezervacije
 * čim krajša.
 *
 * TASK 8 / F4-D (issue #8 Faza 4 / F3-E): glava strani + metadata v
 * L-pattern (server komponenta — getLocale, isti kanon kot /potovanje).
 * ExperiencesSection je dvojezična prek next-intl ključev homeExp.*
 * (polna pariteta SL/EN v messages); MarketplaceSection je lastništvo
 * naloge 4-a in ostaja nedotaknjena.
 */

const PATH = "/dozivetja";

/** Dvojezični nizi heroja + metadata (server komponenta — getLocale). */
const L = {
  badge: { sl: "Doživetja", en: "Experiences" },
  title: { sl: "Doživetja v Sloveniji", en: "Experiences in Slovenia" },
  subtitle: {
    sl: "Pohodništvo, vodne avanture, kultura in kulinarika — raziščite in rezervirajte doživetja neposredno pri preverjenih lokalnih ponudnikih.",
    en: "Hiking, water adventures, culture and cuisine — explore and book experiences directly with verified local providers.",
  },
  hint: {
    sl: "Preverjeni lokalni ponudniki · Rezervacija brez posrednika",
    en: "Verified local providers · Book with no middleman",
  },
  metaTitle: {
    sl: "Doživetja v Sloveniji",
    en: "Experiences in Slovenia",
  },
  metaDescription: {
    sl: "Pohodništvo, vodne avanture, kultura, kulinarika in skriti biseri — doživetja neposredno pri preverjenih lokalnih ponudnikih.",
    en: "Hiking, water adventures, culture, cuisine and hidden gems — experiences directly with verified local providers.",
  },
} as const;

type PageLang = keyof typeof L.badge;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const lang: PageLang = locale === "en" ? "en" : "sl";
  const base = await currentBaseUrl();

  return {
    title: L.metaTitle[lang],
    description: L.metaDescription[lang],
    alternates: {
      canonical: `${base}${PATH}`,
      languages: hreflangForPath(PATH, base),
    },
  };
}

export default async function ExperiencesPage() {
  const locale = await getLocale();
  const lang: PageLang = locale === "en" ? "en" : "sl";
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <main className="flex-grow">
        {/* Glava strani — F4-D: hero v jeziku zahteve */}
        <section
          className="py-12 sm:py-16"
          aria-labelledby="dozivetja-page-title"
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
              <Compass className="size-3.5 text-primary" aria-hidden="true" />
              {L.badge[lang]}
            </Badge>
            <h1
              id="dozivetja-page-title"
              className="text-balance text-3xl font-bold tracking-tight sm:text-5xl"
            >
              {L.title[lang]}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              {L.subtitle[lang]}
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Compass className="size-3.5 text-primary" aria-hidden="true" />
              {L.hint[lang]}
            </p>
          </div>
        </section>

        {/* Polni imenik doživetij + skriti biseri */}
        <ExperiencesSection />

        {/* Tržnica s pripetim zavihkom izkušenj */}
        <Reveal>
          <MarketplaceSection defaultTab="experiences" />
        </Reveal>
      </main>
      <Footer />
      <Chatbot />
    </div>
  );
}
