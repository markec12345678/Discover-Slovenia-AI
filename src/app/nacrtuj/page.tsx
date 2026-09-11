import type { Metadata } from "next";
import { Sparkles, Wand2 } from "lucide-react";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { StickyMobileCTA } from "@/components/sticky-mobile-cta";
import { ItineraryPlanner } from "@/components/sections/itinerary-planner";
import { TravelStyleQuiz } from "@/components/travel-style-quiz";
import { CommunityTrips } from "@/components/sections/community-trips";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";

/**
 * /načrtuj — AI načrtovalec (FW3: AI-first hierarhija).
 *
 * Jedrna stran produkta: uporabnik pove AI, kaj želi doživeti (hero input
 * na homepageu ga sem prenese prek sessionStorage), kviz ponuja alternativni
 * vstop, skupnostne poti pa social proof. Vse ostale funkcije platforme so
 * dostopne prek navigacije — ta stran je posvečena izključno načrtovanju.
 */
export const metadata: Metadata = {
  title: "AI načrtovalec potovanj",
  description:
    "Povej AI, kaj želiš doživeti v Sloveniji — dnevi, proračun, družina, interesi. V nekaj sekundah dobiš osebni itinerer z zemljevidom, realnimi lokalnimi ponudniki in možnostjo rezervacije.",
  alternates: { canonical: "https://discoverslovenia.ai/nacrtuj" },
};

export default function PlanPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <main className="flex-grow">
        {/* Glava strani — umirjena, usmerjena v dejanje */}
        <section
          className="py-12 sm:py-16"
          aria-labelledby="nacrtuj-page-title"
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
              <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
              AI Concierge
            </Badge>
            <h1
              id="nacrtuj-page-title"
              className="text-balance text-3xl font-bold tracking-tight sm:text-5xl"
            >
              Načrtuj svojo pot po Sloveniji
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              Povej AI, kaj želiš doživeti. V nekaj sekundah dobiš osebni
              itinerer z realnimi lokalnimi ponudniki, zemljevidom in
              možnostjo rezervacije.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Wand2 className="size-3.5 text-primary" aria-hidden="true" />
              Brez prijave · Brezplačno · Grounded na realnih ponudnikih
            </p>
          </div>
        </section>

        {/* Jedro: AI načrtovalec (ob mountu prevzame heroQuery iz sessionStorage) */}
        <ItineraryPlanner />

        {/* Alternativni vstop: kviz potovalnega stila (event na isti strani) */}
        <TravelStyleQuiz />

        {/* Social proof: javne skupnostne poti */}
        <Reveal>
          <CommunityTrips />
        </Reveal>
      </main>
      <Footer />
      <Chatbot />
      <StickyMobileCTA />
    </div>
  );
}
