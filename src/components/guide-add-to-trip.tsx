"use client";

// TASK 8 / F2-D (§3.3, D8-A §9.5 mrtvi konec): strežniški strani vodnikov
// (/vodici/[slug] detail + /vodici seznam kartic) so server komponente
// (SSG) — ta majhen client ovojnik prinese kanonski AddToTripButton BREZ
// pretvorbe strani. Enak vzorec kot destination-add-to-trip.tsx (D8-D):
// client otok v server straneh (kot WeatherWidget / PageViewTracker).
//
// Ovojnik sprejma SAMO PODATKE (naslov, podnaslov, slika) — vsa vidna
// besedila SL/EN nosi primitiva AddToTripButton sama (useLocale).

import { AddToTripButton, type AddToTripVariant } from "@/components/add-to-trip-button";
import type { MyTripInput } from "@/lib/my-trip";

interface GuideAddToTripProps {
  /** Kanonski slug (segment /vodici/[slug] + identiteta v zbirki). */
  slug: string;
  /** Naslov vodiča (H1 na detailu; metaTitle na karticah seznama). */
  title: string;
  /** Ena kontekstualna vrstica (dnevi · km · bralni čas) — izračuna jo stran. */
  subtitle?: string;
  /** Naslovna slika vodiča (lokalna pot /adria/*.png), če obstaja. */
  image?: string;
  /** Privzeto `/vodici/[slug]` (en vir resnice strani). */
  href?: string;
  /** Kje je bil vodič dodan (privzeto 'vodici'; seznam uporablja 'vodici-seznam'). */
  source?: string;
  /** 'full' na detailu (privzeto), 'compact' na karticah seznama. */
  variant?: AddToTripVariant;
  className?: string;
}

export function GuideAddToTrip({
  slug,
  title,
  subtitle,
  image,
  href,
  source,
  variant = "full",
  className,
}: GuideAddToTripProps) {
  const item: MyTripInput = {
    kind: "guide",
    refId: slug,
    title,
    subtitle,
    href: href ?? `/vodici/${encodeURIComponent(slug)}`,
    image,
    source: source ?? "vodici",
  };
  return <AddToTripButton variant={variant} className={className} item={item} />;
}

export default GuideAddToTrip;
