"use client";

// TASK 8 / D8-D (§3.3): strežniški hub strani destinacije (destinacija/[slug]
// + things-to-do) so server komponente (SSG) — ta majhen client ovojnik
// prinese kanonski AddToTripButton v hero območje BREZ pretvorbe strani.
// Enak vzorec kot WeatherWidget / PageViewTracker (client otok v server
// straneh).

import { AddToTripButton } from "@/components/add-to-trip-button";
import type { MyTripInput } from "@/lib/my-trip";

interface DestinationAddToTripProps {
  /** Kanonski slug (segment /destinacija/[slug] + identiteta v zbirki). */
  slug: string;
  name: string;
  /** Human berljiva oznaka regije (subtitle vrstice v "Moja pot"). */
  region?: string;
  image?: string;
  /** Privzeto `/destinacija/[slug]` (en vir resnice hub strani). */
  href?: string;
  /** Kje je bil predmet dodan (privzeto 'destinacija-hub'). */
  source?: string;
}

export function DestinationAddToTrip({
  slug,
  name,
  region,
  image,
  href,
  source,
}: DestinationAddToTripProps) {
  const item: MyTripInput = {
    kind: "destination",
    refId: slug,
    title: name,
    subtitle: region,
    href: href ?? `/destinacija/${encodeURIComponent(slug)}`,
    image,
    source: source ?? "destinacija-hub",
  };
  return <AddToTripButton variant="full" item={item} />;
}

export default DestinationAddToTrip;
