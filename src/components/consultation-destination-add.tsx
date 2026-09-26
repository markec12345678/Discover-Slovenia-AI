"use client";

// TASK 8 / F2-D (§3.3, D8-A §9.9 mrtvi konec): konzultacija (/konzultacija/
// [token]) je strežniška (SSR, force-dynamic) RSC stran — ta majhen client
// ovojnik prinese kanonski AddToTripButton za priporočeno destinacijo BREZ
// pretvorbe strani. Enak vzorec kot destination-add-to-trip.tsx (D8-D).
//
// ZASEBNOST (žeton je edini ključ do vsebine): gumb deluje ČISTO client-side
// na localStorage (dai:my-trip-items) — nikoli ne pokliče strežnika in ne
// razkrije žetona, vprašanja ali odgovora. V zbirki se shrani SAMO javni
// povzetek destinacije (naslov/regija/slug), ki je viden na kartici tako
// ali tako. Brez PII.
//
// Ovojnik sprejma SAMO PODATKE — vsa vidna besedila SL/EN nosi primitiva
// AddToTripButton sama (useLocale).

import { AddToTripButton, type AddToTripVariant } from "@/components/add-to-trip-button";
import type { MyTripInput } from "@/lib/my-trip";

interface ConsultationDestinationAddProps {
  /** Kanonski slug priporočene destinacije (identiteta v zbirki). */
  slug: string;
  /** Ime destinacije (izvira iz vprašanja uporabnika / DB zapisa). */
  name: string;
  /** Ena kontekstualna vrstica (regija / razlog priporočila), če na voljo. */
  subtitle?: string;
  /** Javna slika destinacije (lokalna pot /content/*.jpg), če na voljo. */
  image?: string;
  /** Privzeto `/destinacija/[slug]` (hub destinacije). */
  href?: string;
  /** Kje je bila destinacija dodana (privzeto 'konzultacija'). */
  source?: string;
  /** 'compact' (privzeto) ali 'icon' — kartica CTA je prostorsko okrnjena. */
  variant?: AddToTripVariant;
  className?: string;
}

export function ConsultationDestinationAdd({
  slug,
  name,
  subtitle,
  image,
  href,
  source,
  variant = "compact",
  className,
}: ConsultationDestinationAddProps) {
  const item: MyTripInput = {
    kind: "destination",
    refId: slug,
    title: name,
    subtitle,
    href: href ?? `/destinacija/${encodeURIComponent(slug)}`,
    image,
    source: source ?? "konzultacija",
  };
  return <AddToTripButton variant={variant} className={className} item={item} />;
}

export default ConsultationDestinationAdd;
