import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { safeJsonLd } from "@/lib/security";
import { matchEventsForItinerary } from "@/lib/events-match";
import { PageViewTracker } from "@/components/page-view-tracker";
import { SharedTrip } from "@/components/shared-trip";
import { TripSocial } from "@/components/trip-social";
import { TripPushCard } from "@/components/trip-push-card";
import { PrintQr } from "./print-qr";
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

export default async function SharedTripPage({
  params,
}: PageProps) {
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

  // === Dogodki — SVEŽE ob vsakem renderju (datumi v shranjenem JSON-u so
  // lahko zastareli; matchEventsForItinerary upošteva današnji datum) ===
  const events = matchEventsForItinerary(saved.itinerary.days, 6);

  // === Začetni glasovi (locationKey → število) — izhodišče za UI (7-b) ===
  let initialVotes: Record<string, number> = {};
  try {
    const grouped = await db.tripVote.groupBy({
      by: ["locationKey"],
      where: { shareId },
      _count: { _all: true },
    });
    initialVotes = Object.fromEntries(
      grouped.map((g) => [g.locationKey, g._count._all])
    );
  } catch (e) {
    // Glasovanje ni kritično za prikaz strani — nadaljuj s praznimi glasovi
    console.error("[pot] tripVote groupBy napaka:", e);
  }

  // === Začetni komentarji in všečki (P1-2a social layer) — ne-kritično:
  // ob napaki nadaljujemo s praznimi (stran se mora izrisati). ===
  let initialComments: {
    id: string;
    authorName: string;
    text: string;
    createdAt: string;
  }[] = [];
  try {
    const comments = await db.tripComment.findMany({
      where: { shareId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, authorName: true, text: true, createdAt: true },
    });
    initialComments = comments.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
    }));
  } catch (e) {
    console.error("[pot] tripComment findMany napaka:", e);
  }

  let initialLikes = 0;
  try {
    initialLikes = await db.tripLike.count({ where: { shareId } });
  } catch (e) {
    console.error("[pot] tripLike count napaka:", e);
  }

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
    <div className="pot-page min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(touristTrip) }}
      />

      {/* PageView tracking — beleži ogled v PageView tabelo (rendera null) */}
      <PageViewTracker path={`/pot/${shareId}`} title={name} />

      <SharedTrip
        itinerary={saved.itinerary}
        shareId={shareId}
        name={saved.name}
        views={views}
        createdAt={saved.createdAt.toISOString()}
        events={events}
        initialVotes={initialVotes}
      />

      {/* === KOMENTARJI IN VŠEČKI (skupinsko planiranje, P1-2a) === */}
      <div className="mx-auto max-w-5xl px-4 pb-10 sm:px-6 lg:px-8">
        <TripSocial
          shareId={shareId}
          initialComments={initialComments}
          initialLikes={initialLikes}
          createdAt={saved.createdAt.toISOString()}
        />
      </div>

      {/* === DNEVNI OPOMNIKI ZA TO POTOVANJE (retencijski motor, 3b) === */}
      <div className="mx-auto max-w-5xl px-4 pb-10 sm:px-6 lg:px-8">
        <TripPushCard shareId={shareId} days={saved.itinerary.days.length} />
      </div>

      {/* === PRINT NOGICA — vidna SAMO ob tiskanju (Natisni → Shrani kot PDF) === */}
      <p
        className="mt-6 hidden border-t border-border pt-3 text-center text-xs text-muted-foreground print:block"
        aria-hidden="true"
      >
        Izvoženo z Discover Slovenia AI · https://discoverslovenia.ai/pot/{shareId}
      </p>

      {/* === PRINT QR (FW2-A) — QR deljive povezave v PDF izhodu; UI za
              deljenje ima print-hide, zato ta blok nosi QR na papirju === */}
      <PrintQr shareId={shareId} />
    </div>
  );
}
