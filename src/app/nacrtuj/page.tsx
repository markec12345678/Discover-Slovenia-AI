import type { Metadata } from "next";
import { Sparkles, Wand2, FileUp } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { ItineraryPlanner } from "@/components/sections/itinerary-planner";
import { TravelStyleQuiz } from "@/components/travel-style-quiz";
import { CommunityTrips } from "@/components/sections/community-trips";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";
import { localePrefix } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
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
  // TASK 8 / F3-C (issue #8 §25, audit §3 rec 4): druga UTIŠANA USP vrstica
  // z ISTIM besedilom kot sekundarna vrstica heroja (hero.startAnywhere —
  // en slovar čez površine) → /nacrtuj#start-kjerkoli. Prevod ključa se
  // bere v strežniškem kontekstu strani (getTranslations("hero")); NI novih
  // i18n ključev. Klik: svež prihod sproži mount razširitev obrazca;
  // istostranski klik pokrije hashchange listener v načrtovalniku (F3-C).
  const tHero = await getTranslations("hero");

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
            {/* F3-C: "Imaš že svoje vire?" — tiha vrstica pod USP (isti vir
                besedila kot hero). Uvoz virov je SEKUNDARNA akcija — ne
                tekmuje z AI vprašanjem (issue #25: import ≠ glavna akcija). */}
            <p className="mt-1.5">
              <Link
                href="/nacrtuj#start-kjerkoli"
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-sm text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary hover:decoration-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <FileUp className="size-3.5 text-primary/70" aria-hidden="true" />
                {tHero("startAnywhere")}
              </Link>
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
    </div>
  );
}
