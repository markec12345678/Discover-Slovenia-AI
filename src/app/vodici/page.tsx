import type { Metadata } from "next";
import { BookOpen } from "lucide-react";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { StickyMobileCTA } from "@/components/sticky-mobile-cta";
import { BlogSection } from "@/components/sections/blog";
import { AskLocal } from "@/components/sections/ask-local";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";

/**
 * /vodici — vodiči in nasveti (FW3: AI-first hierarhija).
 *
 * Blog (zgodbe in vodičniki s filtri po kategorijah) je preseljen s
 * homepagea. Pod njim je "Vprašaj lokalca" — za obiskovalce, ki raje
 * vprašajo kot iščejo.
 */
export const metadata: Metadata = {
  title: "Vodiči in nasveti za Slovenijo",
  description:
    "Kaj početi na Bledu, 3 dni v Sloveniji, najlepši izleti in lokalna hrana — vodiči, nasveti in odgovori lokalcev.",
  alternates: { canonical: "/vodici" },
};

export default function GuidesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <main className="flex-grow">
        {/* Glava strani */}
        <section
          className="py-12 sm:py-16"
          aria-labelledby="vodici-page-title"
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
              <BookOpen className="size-3.5 text-primary" aria-hidden="true" />
              Vodiči
            </Badge>
            <h1
              id="vodici-page-title"
              className="text-balance text-3xl font-bold tracking-tight sm:text-5xl"
            >
              Vodiči in nasveti za Slovenijo
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              Kaj početi na Bledu, kako preživeti 3 dni po Sloveniji, najlepši
              izleti in kje jesti lokalno — vodiči, nasveti in odgovori
              lokalcev.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <BookOpen className="size-3.5 text-primary" aria-hidden="true" />
              Zgodbe in nasveti urednikov · Vprašajte lokalce
            </p>
          </div>
        </section>

        {/* Blog z vodičiniki in zgodbami */}
        <BlogSection />

        {/* Vprašaj lokalca — odgovori skupnosti */}
        <Reveal>
          <AskLocal />
        </Reveal>
      </main>
      <Footer />
      <Chatbot />
      <StickyMobileCTA />
    </div>
  );
}
