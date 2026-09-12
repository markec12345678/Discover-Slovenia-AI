import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { Navigation } from "@/components/sections/navigation";
import { Hero } from "@/components/sections/hero";
import { StatsSection } from "@/components/sections/stats";
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
import { StickyMobileCTA } from "@/components/sticky-mobile-cta";
import { LegacyHashRedirect } from "@/components/legacy-hash-redirect";
import { Reveal } from "@/components/reveal";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";
import { localePrefix } from "@/i18n/routing";
import { SITE_NAME } from "@/lib/seo";

/**
 * Homepage — FW3: AI-first hierarhija (progresivno razkrivanje).
 *
 * Prej: ~22 enakovrednih sekcij ("velik turistični portal z AI funkcijo").
 * Zdaj: AI concierge kot obljuba št. 1 + zgolj vrhunska vsebina, ostale
 * funkcije pa živijo na lastnih straneh (/načrtuj, /destinacije, /dogodki,
 * /zemljevid, /lokali, /vodici, /trznica, /slovenia-pass) in so odkrite
 * prek ExploreHub ja ter navigacije.
 *
 * Bloki:
 *  1. Hero — AI Concierge (naravni jezik + intent chipi)
 *  2. Tvoj naslednji korak — vračajoči uporabniki + demo scenariji
 *  3. Zakaj Slovenija — trust številke (bento)
 *  4. Priljubljene destinacije — 6 kartic + CTA na vseh 22
 *  5. Priljubljene AI poti — predgenerirani itinererji
 *  6. Doživetja — kategorije
 *  7. Razišči Slovenijo — hub na nivo-2 funkcije
 *  8. Rezerviraj — booking hub (affiliate + direktne rezervacije)
 */
const PATH = "/";

// FW4.3-2: EN metapodatki homepage-a (SL pade nazaj na layout buildSiteMetadata)
const EN_TAGLINE = "AI travel planner";
const EN_DESCRIPTION =
  "Discover Slovenia with an AI-powered travel planner. 22 of the most beautiful destinations from Bled to Piran, with an interactive map, weather and direct bookings.";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const base = await currentBaseUrl();
  const isEn = locale === "en";
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
export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <FunnelTracker />
      <Navigation />
      <main className="flex-grow">
        {/* P4-5: hero se razteza POD navigacijo (-mt-16) — prozorna nav
            nad fotografijo (pattern GYG/Airbnb). Beta in welcome banner
            sta prestavljena POD hero, da ne pokvarita iluzije. */}
        <Hero />
        <BetaBanner />

        {/* 2. Tvoj naslednji korak — vračajoči uporabniki (nadaljuj svojo
            pot) + demo scenariji za pilot predstavitve. Oba preneseta
            željo na /načrtuj prek sessionStorage. */}
        <WelcomeBackWrapper />
        <DemoScenariosWrapper />

        {/* 3. Zakaj Slovenija — trust številke (22 destinacij, 0 % provizije,
            preverjeni partnerji) */}
        <StatsSection />

        {/* 4. Priljubljene destinacije — samo 6 kartic (featured), ostalih
            16 na /destinacije (progresivno razkrivanje, ne vizualni overload) */}
        <Reveal>
          <DestinationsSection featured />
        </Reveal>

        {/* 5. Priljubljene AI poti — inspiracija iz predgeneriranih
            itinererjev (klik prenese željo na /načrtuj) */}
        <PreGeneratedItinerariesWrapper />

        {/* 6. Doživetja — kategorije (pohodi, vodne avanture, kulinarika …) */}
        <ExperiencesSection />

        {/* 7. Razišči Slovenijo — hub na zemljevid, dogodke, lokale,
            vodiče, tržnico in Slovenia Pass (nivo 2) */}
        <Reveal>
          <ExploreHub />
        </Reveal>

        {/* 8. Rezerviraj — booking hub (nastanitve, aktivnosti, prevoz) */}
        <Reveal>
          <AffiliateSection />
        </Reveal>

        <Reveal>
          <NewsletterSection />
        </Reveal>
      </main>
      <Footer />
      <Chatbot />
      {/* P4-5: mobilna konverzijska vrstica — pojavi se po prečku heroja */}
      <StickyMobileCTA />
      {/* FW3: preusmeritev podedovanih hash povezav (/#načrtuj → /načrtuj …) */}
      <LegacyHashRedirect />
    </div>
  );
}
