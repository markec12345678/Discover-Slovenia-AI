import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { CalendarDays } from "lucide-react";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { EventsCalendar } from "@/components/sections/events-calendar";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";

/**
 * /dogodki — koledar dogodkov in prireditev (FW3: AI-first hierarhija).
 *
 * Sekcija je preseljena z homepagea, kjer je bila zadnja v hierarhiji.
 * Koledar ima filtre po mesecu, regiji in kategoriji ter kartice z
 * datumi, lokacijami in povezavo na destinacijo.
 *
 * TASK 8 / F4-D (issue #8 Faza 4 / F3-E): glava strani + metadata v
 * L-pattern (server komponenta — getLocale, isti kanon kot /potovanje).
 * Sam koledar (EventsCalendar) pije EN podatkovno plast EVENTS_EN.
 */

const PATH = "/dogodki";

/** Dvojezični nizi heroja + metadata (server komponenta — getLocale). */
const L = {
  badge: { sl: "Dogodki", en: "Events" },
  title: {
    sl: "Dogodki in prireditve v Sloveniji",
    en: "Events and happenings in Slovenia",
  },
  subtitle: {
    sl: "Od festivalov in sejemov do športa in kulture — koledar dogodkov po vsej Sloveniji z datumi, lokacijami in kategorijami.",
    en: "From festivals and fairs to sport and culture — a calendar of events across Slovenia with dates, locations and categories.",
  },
  hint: {
    sl: "Filtri po mesecu, regiji in kategoriji · Brez prijave",
    en: "Filter by month, region and category · No sign-up required",
  },
  metaTitle: {
    sl: "Dogodki in prireditve v Sloveniji",
    en: "Events and happenings in Slovenia",
  },
  metaDescription: {
    sl: "Koledar festivalov, sejemov, športnih in kulturnih dogodkov po Sloveniji — z datumi, lokacijami in kategorijami.",
    en: "A calendar of festivals, fairs, sporting and cultural events across Slovenia — with dates, locations and categories.",
  },
} as const;

type PageLang = keyof typeof L.badge;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const lang: PageLang = locale === "en" ? "en" : "sl";
  const base = await currentBaseUrl();

  return {
    title: L.metaTitle[lang],
    description: L.metaDescription[lang],
    alternates: {
      canonical: `${base}${PATH}`,
      languages: hreflangForPath(PATH, base),
    },
  };
}

export default async function EventsPage() {
  const locale = await getLocale();
  const lang: PageLang = locale === "en" ? "en" : "sl";
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <main className="flex-grow">
        {/* Glava strani — F4-D: hero v jeziku zahteve */}
        <section
          className="py-12 sm:py-16"
          aria-labelledby="dogodki-page-title"
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
              <CalendarDays className="size-3.5 text-primary" aria-hidden="true" />
              {L.badge[lang]}
            </Badge>
            <h1
              id="dogodki-page-title"
              className="text-balance text-3xl font-bold tracking-tight sm:text-5xl"
            >
              {L.title[lang]}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              {L.subtitle[lang]}
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CalendarDays className="size-3.5 text-primary" aria-hidden="true" />
              {L.hint[lang]}
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
    </div>
  );
}
