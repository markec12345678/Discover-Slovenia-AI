import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { StickyMobileCTA } from "@/components/sticky-mobile-cta";
import { EventsCalendar } from "@/components/sections/events-calendar";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";

/**
 * /dogodki — koledar dogodkov in prireditev (FW3: AI-first hierarhija).
 *
 * Sekcija je preseljena z homepagea, kjer je bila zadnja v hierarhiji.
 * Koledar ima filtre po mesecu, regiji in kategoriji ter kartice z
 * datumi, lokacijami in povezavo na destinacijo.
 */
export const metadata: Metadata = {
  title: "Dogodki in prireditve v Sloveniji",
  description:
    "Koledar festivalov, sejemov, športnih in kulturnih dogodkov po Sloveniji — z datumi, lokacijami in kategorijami.",
  alternates: { canonical: "https://discoverslovenia.ai/dogodki" },
};

export default function EventsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <main className="flex-grow">
        {/* Glava strani */}
        <section
          className="py-12 sm:py-16"
          aria-labelledby="dogodki-page-title"
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
              <CalendarDays className="size-3.5 text-primary" aria-hidden="true" />
              Dogodki
            </Badge>
            <h1
              id="dogodki-page-title"
              className="text-balance text-3xl font-bold tracking-tight sm:text-5xl"
            >
              Dogodki in prireditve v Sloveniji
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              Od festivalov in sejemov do športa in kulture — koledar dogodkov
              po vsej Sloveniji z datumi, lokacijami in kategorijami.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CalendarDays className="size-3.5 text-primary" aria-hidden="true" />
              Filtri po mesecu, regiji in kategoriji · Brez prijave
            </p>
          </div>
        </section>

        {/* Koledar dogodkov s filtri */}
        <Reveal>
          <EventsCalendar />
        </Reveal>
      </main>
      <Footer />
      <Chatbot />
      <StickyMobileCTA />
    </div>
  );
}
