import type { Metadata } from "next";
import { BookOpen, Compass, Calendar, Route } from "lucide-react";
import Link from "next/link";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { StickyMobileCTA } from "@/components/sticky-mobile-cta";
import { BlogSection } from "@/components/sections/blog";
import { AskLocal } from "@/components/sections/ask-local";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";
import { ADRIA_GUIDES } from "@/lib/adria-guides";

/**
 * /vodici — vodiči in nasveti (FW3: AI-first hierarhija).
 *
 * Blog (zgodbe in vodičniki s filtri po kategorijah) je preseljen s
 * homepagea. Nad njim je "Jadranska potovanja" (ADRIA-1): cross-border
 * vodniki, ki iz slovenske blagovne znamke zajamejo jadranske poizvedbe.
 * Pod njim je "Vprašaj lokalca" — za obiskovalce, ki raje vprašajo kot iščejo.
 */

const COUNTRY_FLAG: Record<string, string> = {
  SI: "🇸🇮",
  HR: "🇭🇷",
  BA: "🇧🇦",
  ME: "🇲🇪",
  AL: "🇦🇱",
};

function fmtKm(km: number): string {
  return km.toLocaleString("sl-SI");
}

export const metadata: Metadata = {
  title: "Vodiči in nasveti za Slovenijo",
  description:
    "Kaj početi na Bledu, 3 dni v Sloveniji, najlepši izleti in lokalna hrana — vodiči, nasveti, jadranska potovanja in odgovori lokalcev.",
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

        {/* Jadranska potovanja — cross-border vodniki (ADRIA-1) */}
        <section
          aria-labelledby="adria-list-title"
          className="bg-accent/40 py-12 sm:py-16"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8 text-center">
              <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
                <Compass className="size-3.5 text-primary" aria-hidden="true" />
                🇸🇮🇭🇷🇧🇦🇲🇪🇦🇱 Cross-border
              </Badge>
              <h2
                id="adria-list-title"
                className="text-balance text-2xl font-bold tracking-tight sm:text-3xl"
              >
                Jadranska potovanja iz Slovenije
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-balance text-sm text-muted-foreground sm:text-base">
                Road trip vodniki čez mejo — Hrvaška, Bosna, Črna gora in
                Albanija z osebnim avtom iz Slovenije: poti, cestnine, mejne
                formalnosti in kam vsak večer parkirati.
              </p>
            </div>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ADRIA_GUIDES.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`/vodici/${g.slug}`}
                    className="group flex h-full flex-col rounded-xl border bg-background p-5 transition-colors hover:border-primary/40 hover:shadow-sm"
                  >
                    <div
                      className="mb-2 flex items-center gap-1.5 text-lg"
                      aria-label={`Potovanje skozi: ${g.countries.join(", ")}`}
                    >
                      {g.countries.map((c) => (
                        <span key={c}>{COUNTRY_FLAG[c]}</span>
                      ))}
                    </div>
                    <h3 className="font-semibold leading-snug group-hover:text-primary">
                      {g.metaTitle}
                    </h3>
                    <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                      {g.excerpt}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3.5 text-primary" aria-hidden="true" />
                        {g.days} dni
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Route className="size-3.5 text-primary" aria-hidden="true" />
                        {fmtKm(g.km)} km
                      </span>
                      <span className="ml-auto font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                        Preberi →
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
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
