import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { ChevronDown, ShieldCheck, Sigma } from "lucide-react";

import { Navigation } from "@/components/sections/navigation";
import { Hero } from "@/components/sections/hero";
import { StatsSection } from "@/components/sections/stats";
import { PlanCheckSection } from "@/components/sections/plan-check-section";
import { ValidatorTelemetrySection } from "@/components/sections/validator-telemetry-section";
import { DestinationsSection } from "@/components/sections/destinations";
import { ExperiencesSection } from "@/components/sections/experiences";
import { ExploreHub } from "@/components/sections/explore-hub";
import { AffiliateSection } from "@/components/sections/affiliate-section";
import { Footer } from "@/components/sections/footer";
import { BetaBanner } from "@/components/beta-banner";
import { Chatbot } from "@/components/chatbot";
import { WelcomeBackWrapper } from "@/components/welcome-back-wrapper";
import { DemoScenariosWrapper } from "@/components/demo-scenarios-wrapper";
import { PreGeneratedItinerariesWrapper } from "@/components/pre-generated-itineraries-wrapper";
import { NewsletterSection } from "@/components/newsletter-section";
import { FunnelTracker } from "@/components/funnel-tracker";
import { HomeEntryRow } from "@/components/home-entry-row";
import { LegacyHashRedirect } from "@/components/legacy-hash-redirect";
import { Reveal } from "@/components/reveal";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";
import { localePrefix } from "@/i18n/routing";
import { SITE_NAME } from "@/lib/seo";

/**
 * Homepage — TASK 8 / D8-F (issue #7): hierarhija po D8-B §7.
 *
 * Prej: ~13 enakovrednih blokov ("velik turistični portal z AI funkcijo").
 * Zdaj (progresivno razkrivanje — HIDE ≠ DELETE, vseh 13 blokov ostaja):
 *  1. Hero — AI Concierge (naravni jezik + HeroQuickInput intent chipi)
 *  2. Nadaljuj svojo pot — WelcomeBackWrapper (neposredno pod herojem:
 *     kontinuacija na vrhu, D8-B §7 točka 2)
 *  3. Vstopna vrstica — HomeEntryRow (Narava · Hrana · Mesta · Doživetja ·
 *     Dogodki → obstoječe strani)
 *  4. Priljubljene destinacije — 6 kartic + CTA na vseh 22
 *  5. Doživetja (kategorije) + Priljubljene AI poti — uredniško odkrivanje
 *  6. Razišči Slovenijo — hub na nivo-2 funkcije
 *  7. Preveri svoj načrt + telemetrija validatorja — ZLOŽENA <details>
 *     (zmožnost 100 % ohranjena, hrup odstranjen)
 *  8. Zakaj Slovenija, demo scenariji, rezerviraj, novice, beta pasica —
 *     pod prečko
 *  9. Footer, Chatbot, LegacyHashRedirect
 *
 * StickyMobileCTA: UPOKOJEN na domači strani (D8-B §6.2 — mobilno tab
 * bar ostalih površin pokriva "Načrtuj"; "Za ponudnike" živi v nogi +
 * meniju). Komponenta sama ostaja za ostale strani, ki je še uporabljajo.
 */
const PATH = "/";

// FW4.3-2: EN metapodatki homepage-a (SL pade nazaj na layout buildSiteMetadata)
const EN_TAGLINE = "AI travel planner";
const EN_DESCRIPTION =
  "Discover Slovenia with an AI-powered travel planner. 22 of the most beautiful destinations from Bled to Piran, with an interactive map, weather and direct bookings.";

// W1 (Issue #15): IT/DE metapodatki homepage-a (ista zgradba kot EN).
const LOCALE_META: Record<
  string,
  { tagline: string; description: string; og: string }
> = {
  it: {
    tagline: "Pianificatore di viaggi AI",
    description:
      "Scopri la Slovenia con un pianificatore di viaggi basato sull'IA. Le destinazioni più belle da Bled a Pirano, con mappa interattiva, meteo e prenotazioni dirette.",
    og: "it_IT",
  },
  de: {
    tagline: "KI-Reiseplaner",
    description:
      "Entdecke Slowenien mit einem KI-gestützten Reiseplaner. Die schönsten Destinationen von Bled bis Piran, mit interaktiver Karte, Wetter und direkten Buchungen.",
    og: "de_DE",
  },
  // W12 (smer 2, faza 1): FR/ES metapodatki homepage-a (ista zgradba kot IT/DE).
  fr: {
    tagline: "Planificateur de voyages IA",
    description:
      "Découvrez la Slovénie avec un planificateur de voyages propulsé par l'IA. Les plus belles destinations de Bled à Piran, avec carte interactive, météo et réservations directes.",
    og: "fr_FR",
  },
  es: {
    tagline: "Planificador de viajes con IA",
    description:
      "Descubre Eslovenia con un planificador de viajes con IA. Los destinos más bellos de Bled a Piran, con mapa interactivo, meteorología y reservas directas.",
    og: "es_ES",
  },
};

// TASK 8 / D8-F (issue #7): oznake zloženih <details> povzetkov (SL/EN) —
// zmožnosti validatorja so ohranjene V CELÓTI, privzeto pa ne tekmujejo z
// primarno AI zgodbo. Native <details> = brez JS, deluje tudi ob napaki.
const COLLAPSIBLE = {
  sl: {
    planCheck: "Preveri svoj obstoječi načrt",
    telemetry: "Telemetrija validatorja",
  },
  en: {
    planCheck: "Verify an existing plan",
    telemetry: "Validator telemetry",
  },
  // W4 (Issue #15): 4 javni jeziki (W1 doslednost — prej so it/de
  // uporabniki na domači strani videli slovenske oznake)
  it: {
    planCheck: "Verifica un piano esistente",
    telemetry: "Telemetria del validatore",
  },
  de: {
    planCheck: "Bestehenden Plan prüfen",
    telemetry: "Validator-Telemetrie",
  },
  // W12 (smer 2, faza 1): FR/ES oznake zloženih povzetkov (ista doslednost
  // kot W4 — francoski/španski uporabnik NE vidi slovenskih oznak).
  fr: {
    planCheck: "Vérifier un plan existant",
    telemetry: "Télémétrie du validateur",
  },
  es: {
    planCheck: "Verificar un plan existente",
    telemetry: "Telemetría del validador",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const base = await currentBaseUrl();
  const isEn = locale === "en";
  // W1: IT/DE uporabita svoja metapodatka (LOCALE_META); SL pade na layout.
  const w1 = LOCALE_META[locale];
  const canonical = `${base}${localePrefix(locale)}`;

  return {
    ...(isEn
      ? {
          title: `${SITE_NAME} — ${EN_TAGLINE}`,
          description: EN_DESCRIPTION,
          openGraph: {
            title: `${SITE_NAME} — ${EN_TAGLINE}`,
            description: EN_DESCRIPTION,
            url: canonical,
            locale: "en_US",
          },
        }
      : w1
        ? {
            title: `${SITE_NAME} — ${w1.tagline}`,
            description: w1.description,
            openGraph: {
              title: `${SITE_NAME} — ${w1.tagline}`,
              description: w1.description,
              url: canonical,
              locale: w1.og,
            },
          }
        : {
            // SL: pusti privzete vrednosti iz layout-a (buildSiteMetadata) —
            // samo canonical/hreflang/og:url naredimo locale-zavedne.
            openGraph: { url: canonical, locale: "sl_SI" },
          }),
    alternates: {
      canonical,
      languages: hreflangForPath(PATH, base),
    },
  };
}
export default async function Home() {
  const locale = await getLocale();
  // W4: 4-jezikovni slovar z iskrenim SL fallbackom (neznani locale → SL,
  // primarni jezik platforme)
  const labels = COLLAPSIBLE[locale] ?? COLLAPSIBLE.sl;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <FunnelTracker />
      <Navigation />
      <main className="flex-grow">
        {/* P4-5: hero se raztega POD navigacijo (-mt-16) — prozorna nav
            nad fotografijo (pattern GYG/Airbnb). Beta pasica je prestavljena
            na DNO strani (D8-B §7 točka 8) — dismiss logika je krajevno
            stanje komponente, premik položaja je ne prizadene. */}
        <Hero />

        {/* 2. Nadaljuj svojo pot — kontinuacija na VRHU (D8-B §7):
            vračajoči uporabnik vidi nadaljevanje takoj pod herojem,
            demo scenariji (za pilotske predstavitve) pa so premaknjeni
            niže — ne tekmujejo z osebnim nadaljevanjem. */}
        <WelcomeBackWrapper />

        {/* 3. Vstopna vrstica — Narava · Hrana · Mesta · Doživetja ·
            Dogodki (vizualni žetoni → obstoječe strani odkrivanja) */}
        <HomeEntryRow />

        {/* 4. Priljubljene destinacije — samo 6 kartic (featured), ostalih
            16 na /destinacije (progresivno razkrivanje, ne vizualni overload) */}
        <Reveal>
          <DestinationsSection featured />
        </Reveal>

        {/* 5. Doživetja — kategorije (pohodi, vodne avanture, kulinarika …) */}
        <ExperiencesSection />

        {/* 5b. Priljubljene AI poti — inspiracija iz predgeneriranih
            itinererjev (klik prenese željo na /načrtuj) */}
        <PreGeneratedItinerariesWrapper />

        {/* 6. Razišči Slovenijo — hub na zemljevid, dogodke, lokale,
            vodiče, tržnico in Slovenia Pass (nivo 2) */}
        <Reveal>
          <ExploreHub />
        </Reveal>

        {/* 7. F13 "Preveri svoj načrt" — validator TUJIH načrtov
            (ChatGPT/Mindtrip/Layla izvozi): diferenciator pred vsemi, ki
            zahtevajo račun; 0 AI žetonov, poročilo z viri.
            TASK 8 / D8-F: ZLOŽENO v native <details> (issue #7 — declutter,
            zero loss): privzeto zaprto, zmožnost v celoti ohranjena. */}
        <Reveal>
          <details className="group border-y border-border/60 bg-muted/30">
            <summary className="flex min-h-11 cursor-pointer select-none list-none items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
              <span className="container mx-auto flex items-center gap-2.5 px-4 py-3 text-sm font-semibold sm:px-6 lg:px-8">
                <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
                {labels.planCheck}
                <ChevronDown
                  className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                  aria-hidden="true"
                />
              </span>
            </summary>
            <PlanCheckSection />
          </details>
        </Reveal>

        {/* 7b. F17 "Javna telemetrija validatorja" — kaj naš preverjevalnik
            DEJANSKO ujame (lastne strežniškoštete številke, javne od 1.21.0)
            + citati javnih študij (MEM/BBC/Tow) — poštenost kot marketing,
            nadaljevanje zgodbe "preveri → glej dokaz".
            TASK 8 / D8-F: prav tako ZLOŽENO v <details> (ista slovnica). */}
        <Reveal>
          <details className="group border-y border-border/60 bg-muted/30">
            <summary className="flex min-h-11 cursor-pointer select-none list-none items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
              <span className="container mx-auto flex items-center gap-2.5 px-4 py-3 text-sm font-semibold sm:px-6 lg:px-8">
                <Sigma className="size-4 shrink-0 text-primary" aria-hidden="true" />
                {labels.telemetry}
                <ChevronDown
                  className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                  aria-hidden="true"
                />
              </span>
            </summary>
            <ValidatorTelemetrySection />
          </details>
        </Reveal>

        {/* 8. Zakaj Slovenija — trust številke (22 destinacij, 0 % provizije,
            preverjeni partnerji) */}
        <StatsSection />

        {/* 8b. Demo scenariji za pilot predstavitve (prenesejo željo na
            /načrtuj prek sessionStorage — ista mehanika kot prej) */}
        <DemoScenariosWrapper />

        {/* 8c. Rezerviraj — booking hub (nastanitve, aktivnosti, prevoz) */}
        <Reveal>
          <AffiliateSection />
        </Reveal>

        <Reveal>
          <NewsletterSection />
        </Reveal>

        {/* Beta pasica — DNO (D8-B §7 točka 8). Preverjeno: dismiss je
            krajevno stanje (useState + gumb X, brez localStorage/scroll
            sklopa), zato premik pod prečko logike ne spreminja. */}
        <BetaBanner />
      </main>
      <Footer />
      <Chatbot />
      {/* FW3: preusmeritev podedovanih hash povezav (/#načrtuj → /načrtuj …) */}
      <LegacyHashRedirect />
    </div>
  );
}
