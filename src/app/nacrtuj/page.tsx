import type { Metadata } from "next";
import { Sparkles, Wand2 } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { StickyMobileCTA } from "@/components/sticky-mobile-cta";
import { ItineraryPlanner } from "@/components/sections/itinerary-planner";
import { TravelStyleQuiz } from "@/components/travel-style-quiz";
import { CommunityTrips } from "@/components/sections/community-trips";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";
import { localePrefix } from "@/i18n/routing";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";

/**
 * /načrtuj — AI načrtovalec (FW3: AI-first hierarhija).
 *
 * Jedrna stran produkta: uporabnik pove AI, kaj želi doživeti (hero input
 * na homepageu ga sem prenese prek sessionStorage), kviz ponuja alternativni
 * vstop, skupnostne poti pa social proof. Vse ostale funkcije platforme so
 * dostopne prek navigacije — ta stran je posvečena izključno načrtovanju.
 *
 * FW4.3-2: glava strani + metadata prek fragmentov plannerPage.{sl,en}.json
 * (vzorec o-strani: locale-zaveden canonical/hreflang/og:locale).
 */
const PATH = "/nacrtuj";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("plannerPage");
  const locale = await getLocale();
  const base = await currentBaseUrl();
  const prefixed = `${localePrefix(locale)}${PATH}`;

  return {
    title: t("meta.title"),
    description: t("meta.description"),
    alternates: {
      canonical: `${base}${prefixed}`,
      languages: hreflangForPath(PATH, base),
    },
    openGraph: {
      title: `${t("meta.title")} — Discover Slovenia AI`,
      description: t("meta.description"),
      url: `${base}${prefixed}`,
      type: "website",
      locale: locale === "en" ? "en_US" : "sl_SI",
    },
  };
}

export default async function PlanPage() {
  const t = await getTranslations("plannerPage");

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
              {t("badge")}
            </Badge>
            <h1
              id="nacrtuj-page-title"
              className="text-balance text-3xl font-bold tracking-tight sm:text-5xl"
            >
              {t("title")}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              {t("subtitle")}
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Wand2 className="size-3.5 text-primary" aria-hidden="true" />
              {t("usp")}
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
