import type { Metadata } from "next";
import { getSharedItinerary } from "../shared-trip-screen";
import { SharedTripScreen } from "../shared-trip-screen";

// Javna stran deljenega itinererja: /pot/[shareId]
// RSC — bere SavedItinerary direktno iz baze (brez API klica), SSR na vsak
// zahtevek (views statistika + sveži ogledi za SEO).
//
// D7 (1.140.0): vsa logika (vrata, poizvedbe, izris) živi v skupnem
// zaslonu ../shared-trip-screen.tsx — ta datoteka je TANAKA ovojnca
// (polna stran, brez embeda); embed različica je v ../embed/[shareId]/.

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ shareId: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { shareId } = await params;
  const saved = await getSharedItinerary(shareId);

  if (!saved) {
    return {
      // template v layoutu sam pripne " | Discover Slovenia AI"
      title: "Itinerer ne obstaja",
      robots: { index: false, follow: false },
    };
  }

  const name = saved.name || "AI načrt potovanja";
  const firstDay = saved.itinerary.days[0];
  const dayCount = saved.itinerary.days.length;
  const totalBudget =
    typeof saved.itinerary.total_budget === "number"
      ? saved.itinerary.total_budget
      : 0;
  const destNames = firstDay?.locations
    ?.map((l) => l.destination_name)
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
  const description = `${dayCount}-dnevni AI načrt potovanja po Sloveniji${destNames ? ` — ${destNames}` : ""}. Skupni proračun ~€${totalBudget}.`;

  return {
    // template v layoutu sam pripne " | Discover Slovenia AI" (sicer se pripona podvoji)
    title: name,
    description,
    robots: {
      // Uporabniško generiran dinamični content — NE indeksiramo sistematično,
      // ampak sledenje povezavam dovolimo (CTA vodi na domačo stran).
      index: false,
      follow: true,
    },
  };
}

export default async function SharedTripPage({ params }: PageProps) {
  const { shareId } = await params;
  return <SharedTripScreen shareId={shareId} />;
}
