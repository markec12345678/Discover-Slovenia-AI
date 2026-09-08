import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { safeJsonLd } from "@/lib/security";
import { PageViewTracker } from "@/components/page-view-tracker";
import { SharedTrip } from "@/components/shared-trip";
import type { Itinerary } from "@/lib/types";

// Javna stran deljenega itinererja: /pot/[shareId]
// RSC — bere SavedItinerary direktno iz baze (brez API klica), SSR na vsak
// zahtevek (views statistika + sveži ogledi za SEO).

export const dynamic = "force-dynamic";

// Validna dolžina shareId (hex, 10 znakov) — zavrnemo očitno neveljavne
// zahteve brez DB klica.
const SHARE_ID_RE = /^[a-z0-9]{1,32}$/;

interface PageProps {
  params: Promise<{ shareId: string }>;
}

async function getSharedItinerary(shareId: string) {
  if (!SHARE_ID_RE.test(shareId)) return null;

  const saved = await db.savedItinerary.findUnique({
    where: { shareId },
    select: {
      name: true,
      itinerary: true,
      views: true,
      createdAt: true,
    },
  });

  if (!saved) return null;

  // Parse itinererja — ob pokvarjenem JSON-u se obnašamo kot da ne obstaja
  let itinerary: Itinerary;
  try {
    itinerary = JSON.parse(saved.itinerary) as Itinerary;
  } catch {
    console.error("[pot] pokvarjen JSON itinererja:", shareId);
    return null;
  }

  if (!Array.isArray(itinerary?.days) || itinerary.days.length === 0) {
    return null;
  }

  // Hardening: obdrži samo dneve z veljavnim seznamom lokacij
  itinerary.days = itinerary.days.filter(
    (d) => typeof d === "object" && d !== null && Array.isArray(d.locations)
  );
  if (itinerary.days.length === 0) return null;

  return { ...saved, itinerary };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { shareId } = await params;
  const saved = await getSharedItinerary(shareId);

  if (!saved) {
    return {
      title: "Itinerer ne obstaja | Discover Slovenia AI",
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
    title: `${name} | Discover Slovenia AI`,
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
  const saved = await getSharedItinerary(shareId);

  if (!saved) notFound();

  // Inkrementiraj števec ogledov (SAMO tu — ne v generateMetadata, ki deli
  // getSharedItinerary — sicer bi double-countal). Ne-critical: ob napaki
  // prikažemo shranjeno vrednost.
  let views = saved.views;
  try {
    const updated = await db.savedItinerary.update({
      where: { shareId },
      data: { views: { increment: 1 } },
      select: { views: true },
    });
    views = updated.views;
  } catch (e) {
    console.error("[pot] views increment napaka:", e);
  }

  const name = saved.name || "AI načrt potovanja po Sloveniji";
  const totalBudget =
    typeof saved.itinerary.total_budget === "number"
      ? saved.itinerary.total_budget
      : 0;

  // === JSON-LD: TouristTrip ===
  const dayCount = saved.itinerary.days.length;
  const destNames = saved.itinerary.days
    .flatMap((d) => d.locations?.map((l) => l.destination_name) ?? [])
    .filter(Boolean)
    .slice(0, 8);

  const touristTrip = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name,
    description: `${dayCount}-dnevni AI načrt potovanja po Sloveniji. Skupni proračun ~€${totalBudget}.`,
    itinerary: {
      "@type": "ItemList",
      numberOfItems: dayCount,
      itemListElement: saved.itinerary.days.map((day, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: `Dan ${day.day}`,
        item: (day.locations ?? [])
          .map((l) => l.destination_name)
          .filter(Boolean)
          .join(" → "),
      })),
    },
    touristDestination: destNames.map((n) => ({
      "@type": "TouristDestination",
      name: n,
      address: { "@type": "PostalAddress", addressCountry: "SI" },
    })),
    offers: {
      "@type": "Offer",
      price: totalBudget,
      priceCurrency: "EUR",
    },
  };

  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(touristTrip) }}
      />

      {/* PageView tracking — beleži ogled v PageView tabelo */}
      <PageViewTracker path={`/pot/${shareId}`} title={name} />

      <SharedTrip
        itinerary={saved.itinerary}
        shareId={shareId}
        name={saved.name}
        views={views}
        createdAt={saved.createdAt.toISOString()}
      />
    </div>
  );
}
