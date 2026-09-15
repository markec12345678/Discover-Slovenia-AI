import type { Metadata } from "next";
import { Compass } from "lucide-react";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { StickyMobileCTA } from "@/components/sticky-mobile-cta";
import { ExperiencesSection } from "@/components/sections/experiences";
import { MarketplaceSection } from "@/components/sections/marketplace";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";

/**
 * /dozivetja — doživetja v Sloveniji (FW3: AI-first hierarhija).
 *
 * Polni imenik doživetij (pohodi, vodne avanture, kultura, kulinarika) z
 * razdelkom "skritih biserov". Tržnica pod njim se odpre s pripetim
 * zavihkom izkušenj (defaultTab="experiences"), da je pot do rezervacije
 * čim krajša.
 */
export const metadata: Metadata = {
  title: "Doživetja v Sloveniji",
  description:
    "Pohodništvo, vodne avanture, kultura, kulinarika in skriti biseri — doživetja neposredno pri preverjenih lokalnih ponudnikih.",
  alternates: { canonical: "/dozivetja" },
};

export default function ExperiencesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <main className="flex-grow">
        {/* Glava strani */}
        <section
          className="py-12 sm:py-16"
          aria-labelledby="dozivetja-page-title"
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
              <Compass className="size-3.5 text-primary" aria-hidden="true" />
              Doživetja
            </Badge>
            <h1
              id="dozivetja-page-title"
              className="text-balance text-3xl font-bold tracking-tight sm:text-5xl"
            >
              Doživetja v Sloveniji
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              Pohodništvo, vodne avanture, kultura in kulinarika — raziščite
              in rezervirajte doživetja neposredno pri preverjenih lokalnih
              ponudnikih.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Compass className="size-3.5 text-primary" aria-hidden="true" />
              Preverjeni lokalni ponudniki · Rezervacija brez posrednika
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
      <StickyMobileCTA />
    </div>
  );
}
