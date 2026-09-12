import type { Metadata } from "next";
import { ShoppingBag } from "lucide-react";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { StickyMobileCTA } from "@/components/sticky-mobile-cta";
import { MarketplaceSection } from "@/components/sections/marketplace";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";

/**
 * /trznica — tržnica lokalnih izdelkov in doživetij (FW3: AI-first
 * hierarhija).
 *
 * Tržnica je preseljena z homepagea na lastno stran. Odpre se s privzetim
 * zavihkom izdelkov; zavihek izkušenj vodi na /dozivetja, kjer je pripet.
 */
export const metadata: Metadata = {
  title: "Tržnica lokalnih izdelkov in doživetij",
  description:
    "Lokalni izdelki in doživetja neposredno od slovenskih ponudnikov — med, vina, obrti, rafting in gastro doživetja.",
  alternates: { canonical: "/trznica" },
};

export default function MarketplacePage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <main className="flex-grow">
        {/* Glava strani */}
        <section
          className="py-12 sm:py-16"
          aria-labelledby="trznica-page-title"
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
              <ShoppingBag className="size-3.5 text-primary" aria-hidden="true" />
              Tržnica
            </Badge>
            <h1
              id="trznica-page-title"
              className="text-balance text-3xl font-bold tracking-tight sm:text-5xl"
            >
              Tržnica lokalnih izdelkov in doživetij
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              Med, vina, obrti, rafting in gastro doživetja — izdelki in
              doživetja neposredno od slovenskih ponudnikov, brez posrednikov.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ShoppingBag className="size-3.5 text-primary" aria-hidden="true" />
              Neposredno od slovenskih ponudnikov · Brez skritih stroškov
            </p>
          </div>
        </section>

        {/* Tržnica: izdelki in doživetja s filtri */}
        <Reveal>
          <MarketplaceSection />
        </Reveal>
      </main>
      <Footer />
      <Chatbot />
      <StickyMobileCTA />
    </div>
  );
}
