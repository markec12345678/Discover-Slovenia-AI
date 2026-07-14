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
import { BlogSection } from "@/components/sections/blog";
import { AffiliateSection } from "@/components/sections/affiliate-section";
import { JoinUs } from "@/components/sections/join-us";
import { PitchDeckSection } from "@/components/sections/pitch-deck";
import { Footer } from "@/components/sections/footer";
import { BetaBanner } from "@/components/beta-banner";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation />
      <BetaBanner />
      <main className="flex-grow">
        <Hero />
        <div className="flex justify-center py-4 bg-muted/30">
          <VlmVerifiedBadge />
        </div>
        <StatsSection />
        <CollectionsSection />
        <DestinationsSection />
        <ItineraryPlanner />
        <MapSection />
        <ListingsSection />
        <MarketplaceSection />
        <ExperiencesSection />
        <EventsCalendar />
        <BlogSection />
        <AffiliateSection />
        <JoinUs />
        <PitchDeckSection />
      </main>
      <Footer />
    </div>
  );
}
