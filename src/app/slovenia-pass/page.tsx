import type { Metadata } from "next";
import { Award } from "lucide-react";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { StickyMobileCTA } from "@/components/sticky-mobile-cta";
import { SloveniaPassSection } from "@/components/slovenia-pass-section";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";

/**
 * /slovenia-pass — gamifikacija potovanj (FW3: AI-first hierarhija).
 *
 * Slovenia Pass (digitalni potni list) je preseljen z homepagea. Vsak AI
 * načrt prinese točke in značke — obiskovalci regijske značke odklenjujejo
 * kot igro skozi Slovenijo.
 */
export const metadata: Metadata = {
  title: "Slovenia Pass — zbiraj značke",
  description:
    "Obiščite slovenske regije, zbirajte značke in odklenite nagrade — potovanje skozi Slovenijo kot igra.",
  alternates: { canonical: "/slovenia-pass" },
};

export default function SloveniaPassPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <main className="flex-grow">
        {/* Glava strani */}
        <section
          className="py-12 sm:py-16"
          aria-labelledby="slovenia-pass-page-title"
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
              <Award className="size-3.5 text-primary" aria-hidden="true" />
              Slovenia Pass
            </Badge>
            <h1
              id="slovenia-pass-page-title"
              className="text-balance text-3xl font-bold tracking-tight sm:text-5xl"
            >
              Slovenia Pass — zbiraj značke
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              Obiščite slovenske regije, zbirajte značke in odklenite nagrade —
              potovanje skozi Slovenijo kot igra.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Award className="size-3.5 text-primary" aria-hidden="true" />
              Brezplačno · Točke za vsak AI načrt
            </p>
          </div>
        </section>

        {/* Digitalni potni list z značkami in nagradami */}
        <Reveal>
          <SloveniaPassSection />
        </Reveal>
      </main>
      <Footer />
      <Chatbot />
      <StickyMobileCTA />
    </div>
  );
}
