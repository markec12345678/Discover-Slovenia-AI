import { Navigation } from "@/components/sections/navigation";
import { Hero } from "@/components/sections/hero";
import { StatsSection } from "@/components/sections/stats";
import { DestinationsSection } from "@/components/sections/destinations";
import { ItineraryPlanner } from "@/components/sections/itinerary-planner";
import { ExperiencesSection } from "@/components/sections/experiences";
import { AffiliateSection } from "@/components/sections/affiliate-section";
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
        <ExperiencesSection />
        <AffiliateSection />
      </main>
      <Footer />
    </div>
  );
}
