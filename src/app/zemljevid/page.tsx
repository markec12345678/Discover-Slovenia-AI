import type { Metadata } from "next";
import { MapPin } from "lucide-react";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { StickyMobileCTA } from "@/components/sticky-mobile-cta";
import { MapSection } from "@/components/sections/map-section";
import { Badge } from "@/components/ui/badge";

/**
 * /zemljevid — interaktivni zemljevid Slovenije (FW3: AI-first hierarhija).
 *
 * Zemljevid je preseljen z homepagea na lastno stran: prikaže 22 destinacij,
 * lokalne ponudnike in — če je uporabnik ravno sestavil AI itinerer —
 * tudi pot svojega potovanja (routeCoords/routeByDay iz app store).
 */
export const metadata: Metadata = {
  title: "Interaktivni zemljevid Slovenije",
  description:
    "Raziščite Slovenijo na interaktivnem zemljevidu — destinacije, lokalne ponudnike in pot svojega AI itinererja.",
  alternates: { canonical: "/zemljevid" },
};

export default function MapPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <main className="flex-grow">
        {/* Glava strani */}
        <section
          className="py-12 sm:py-16"
          aria-labelledby="zemljevid-page-title"
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
              <MapPin className="size-3.5 text-primary" aria-hidden="true" />
              Zemljevid
            </Badge>
            <h1
              id="zemljevid-page-title"
              className="text-balance text-3xl font-bold tracking-tight sm:text-5xl"
            >
              Interaktivni zemljevid Slovenije
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              22 destinacij od Alp do Jadrana na enem zemljevidu — s podrobnostmi
              o vsaki lokaciji in potjo vašega AI itinererja, ko ga sestavite.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MapPin className="size-3.5 text-primary" aria-hidden="true" />
              Kliknite marker za podrobnosti · Brez prijave
            </p>
          </div>
        </section>

        {/* Interaktivni zemljevid s potjo AI itinererja */}
        <MapSection />
      </main>
      <Footer />
      <Chatbot />
      <StickyMobileCTA />
    </div>
  );
}
