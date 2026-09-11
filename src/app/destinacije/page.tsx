import type { Metadata } from "next";
import { Map } from "lucide-react";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { StickyMobileCTA } from "@/components/sticky-mobile-cta";
import { DestinationsSection } from "@/components/sections/destinations";
import { CollectionsSection } from "@/components/sections/collections";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";

/**
 * /destinacije — vseh 22 slovenskih destinacij (FW3: AI-first hierarhija).
 *
 * Homepage prikaže samo 6 priljubljenih destinacij (featured mode); ta stran
 * je polni imenik s 5 filtri (regija, interesi, tip, cena, ocena) in modali
 * s podrobnostmi. Zbirke (kurirane sezname) pod njim ponudijo alternativni
 * vstop za tiste, ki ne vedo, kje začeti.
 */
export const metadata: Metadata = {
  title: "Vseh 22 destinacij Slovenije",
  description:
    "Raziščite 22 najlepših slovenskih destinacij — od Bledega jezera do Pirana. Filtri po regiji, interesih, tipu in ceni.",
  alternates: { canonical: "https://discoverslovenia.ai/destinacije" },
};

export default function DestinationsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <main className="flex-grow">
        {/* Glava strani */}
        <section
          className="py-12 sm:py-16"
          aria-labelledby="destinacije-page-title"
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
              <Map className="size-3.5 text-primary" aria-hidden="true" />
              Destinacije
            </Badge>
            <h1
              id="destinacije-page-title"
              className="text-balance text-3xl font-bold tracking-tight sm:text-5xl"
            >
              Vseh 22 destinacij Slovenije
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              Od Bledega jezera in vrhov Julijcev do ozkih piranskih ulic —
              filtrirajte po regiji, interesi, tipu in ceni ter poiščite svoj
              kotiček Slovenije.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Map className="size-3.5 text-primary" aria-hidden="true" />
              22 destinacij · 5 filtrov · Brez prijave
            </p>
          </div>
        </section>

        {/* Polni imenik destinacij s filtri in modalom */}
        <DestinationsSection />

        {/* Kurirane zbirke za alternativni vstop */}
        <Reveal>
          <CollectionsSection />
        </Reveal>
      </main>
      <Footer />
      <Chatbot />
      <StickyMobileCTA />
    </div>
  );
}
