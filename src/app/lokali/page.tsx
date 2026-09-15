import type { Metadata } from "next";
import { Store } from "lucide-react";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { StickyMobileCTA } from "@/components/sticky-mobile-cta";
import { ListingsSection } from "@/components/sections/listings";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";

/**
 * /lokali — lokalni ponudniki (FW3: AI-first hierarhija).
 *
 * Imenik preverjenih lokalov (hoteli, restavracije, znamenitosti,
 * aktivnosti) je preseljen z homepagea. Rezervacija poteka direktno pri
 * ponudniku — brez posrednikov in brez provizije.
 */
export const metadata: Metadata = {
  title: "Lokalni ponudniki",
  description:
    "Hoteli, restavracije, znamenitosti in aktivnosti preverjenih lokalnih partnerjev — rezervacija direktno pri ponudniku, brez provizije.",
  alternates: { canonical: "/lokali" },
};

export default function ListingsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <main className="flex-grow">
        {/* Glava strani */}
        <section
          className="py-12 sm:py-16"
          aria-labelledby="lokali-page-title"
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
              <Store className="size-3.5 text-primary" aria-hidden="true" />
              Lokalni ponudniki
            </Badge>
            <h1
              id="lokali-page-title"
              className="text-balance text-3xl font-bold tracking-tight sm:text-5xl"
            >
              Lokalni ponudniki
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              Hoteli, restavracije, znamenitosti in aktivnosti preverjenih
              lokalnih partnerjev — rezervirajte direktno pri ponudniku, brez
              provizije.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Store className="size-3.5 text-primary" aria-hidden="true" />
              Rezervacija direktno pri ponudniku · 0 % provizije
            </p>
          </div>
        </section>

        {/* Imenik lokalov s filtri in modalom */}
        <Reveal>
          <ListingsSection />
        </Reveal>
      </main>
      <Footer />
      <Chatbot />
      <StickyMobileCTA />
    </div>
  );
}
