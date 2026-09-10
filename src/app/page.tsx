import { Navigation } from "@/components/sections/navigation";
import { Hero } from "@/components/sections/hero";
import { VlmVerifiedBadge } from "@/components/vlm-verified-badge";
import { StatsSection } from "@/components/sections/stats";
import { CollectionsSection } from "@/components/sections/collections";
import { DestinationsSection } from "@/components/sections/destinations";
import { ItineraryPlanner } from "@/components/sections/itinerary-planner";
import { MapSection } from "@/components/sections/map-section";
import { ListingsSection } from "@/components/sections/listings";
import { MarketplaceSection } from "@/components/sections/marketplace";
import { ExperiencesSection } from "@/components/sections/experiences";
import { EventsCalendar } from "@/components/sections/events-calendar";
import { CommunityTrips } from "@/components/sections/community-trips";
import { AskLocal } from "@/components/sections/ask-local";
import { BlogSection } from "@/components/sections/blog";
import { AffiliateSection } from "@/components/sections/affiliate-section";
import { JoinUs } from "@/components/sections/join-us";
import { PitchDeckSection } from "@/components/sections/pitch-deck";
import { Footer } from "@/components/sections/footer";
import { BetaBanner } from "@/components/beta-banner";
import { Chatbot } from "@/components/chatbot";
import { WelcomeBackWrapper } from "@/components/welcome-back-wrapper";
import { SloveniaPassSection } from "@/components/slovenia-pass-section";
import { DemoScenariosWrapper } from "@/components/demo-scenarios-wrapper";
import { PreGeneratedItinerariesWrapper } from "@/components/pre-generated-itineraries-wrapper";
import { TravelStyleQuiz } from "@/components/travel-style-quiz";
import { NewsletterSection } from "@/components/newsletter-section";
import { FunnelTracker } from "@/components/funnel-tracker";
import { StickyMobileCTA } from "@/components/sticky-mobile-cta";
import { Reveal } from "@/components/reveal";

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
        <WelcomeBackWrapper />
        <DemoScenariosWrapper />
        <TravelStyleQuiz />
        <PreGeneratedItinerariesWrapper />
        <div className="flex justify-center py-4 bg-muted/30">
          <VlmVerifiedBadge />
        </div>
        <StatsSection />
        <CollectionsSection />
        <Reveal>
          <DestinationsSection />
        </Reveal>
        <ItineraryPlanner />
        <SloveniaPassSection />
        <Reveal>
          <MapSection />
        </Reveal>
        <Reveal>
          <ListingsSection />
        </Reveal>
        <Reveal>
          <MarketplaceSection />
        </Reveal>
        <ExperiencesSection />
        <EventsCalendar />
        {/* Javna galerija skupnostnih potovanj — viralni loop: deljeni načrti
            prinesejo nov promet, ki konvertira prek tržnice/rezervacij zgoraj;
            social proof takoj pred newsletterjem. Skrije se, če ni javnih poti. */}
        <CommunityTrips />
        {/* "Vprašaj lokalca" — grounded AI Q&A točko za galerijo social
            proofa in pred vsebinskimi sekcijami: javna vprašanja + odgovori
            delujejo kot social proof (ljudje sprašujejo!) in vsebinski SEO
            material, hkrati pa gradijo obljubo "zero hallucination"
            (odgovori samo iz naše baze). */}
        <AskLocal />
        <BlogSection />
        <AffiliateSection />
        <JoinUs />
        <PitchDeckSection />
        <Reveal>
          <NewsletterSection />
        </Reveal>
      </main>
      <Footer />
      <Chatbot />
      {/* P4-5: mobilna konverzijska vrstica — pojavi se po prečku heroja */}
      <StickyMobileCTA />
    </div>
  );
}
