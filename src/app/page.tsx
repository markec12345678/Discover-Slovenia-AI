import { Navigation } from "@/components/sections/navigation";
import { Hero } from "@/components/sections/hero";
import { StatsSection } from "@/components/sections/stats";
import { DestinationsSection } from "@/components/sections/destinations";
import { ItineraryPlanner } from "@/components/sections/itinerary-planner";
import { MapSection } from "@/components/sections/map-section";
import { ListingsSection } from "@/components/sections/listings";
import { ExperiencesSection } from "@/components/sections/experiences";
import { EventsCalendar } from "@/components/sections/events-calendar";
import { BlogSection } from "@/components/sections/blog";
import { AffiliateSection } from "@/components/sections/affiliate-section";
import { JoinUs } from "@/components/sections/join-us";
import { Footer } from "@/components/sections/footer";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation />
      <main className="flex-grow">
        <Hero />
        <StatsSection />
        <DestinationsSection />
        <ItineraryPlanner />
        <MapSection />
        <ListingsSection />
        <ExperiencesSection />
        <EventsCalendar />
        <BlogSection />
        <AffiliateSection />
        <JoinUs />
      </main>
      <Footer />
    </div>
  );
}
