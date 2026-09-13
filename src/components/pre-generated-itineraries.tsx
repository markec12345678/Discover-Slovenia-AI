"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  Clock,
  MapPin,
  ArrowRight,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// PRE-GENERATED ITINERARIES — priljubljeni načrti (Layla.ai inspiracija)
// ============================================================================
//
// Za nižji barrier — uporabnik ne mora napisati, lahko izbere
// preverjen itinerer in ga AI še dodatno personalizira.
//
// FW4.3-2: naslovi/poizvedbe/destinacije/poudarki živijo v fragmentih
// pregenTrips.{sl,en}.json (ključi po id-ju poti); budget (€xx-yy) je
// krajevno nevtralen in ostaja v podatkih.
//
// PREMIUM-VIZ: emoji/gradient kartice → fotografske uredniške kartice
// (lokalne slike iz public/content/, next/image). Funkcionalnost,
// kliki (onSelect → /načrtuj prek sessionStorage) in vsi prevodi
// ostajajo nespremenjeni.
// ============================================================================

interface PreGeneratedTrip {
  id: string;
  /** lokalna fotografija (public/content/) — naslovnica poti */
  image: string;
  days: number;
  /** število prikazanih destinacijskih chipov (dest1..destN) */
  destinationCount: number;
  budget: string;
}

const TRIPS: PreGeneratedTrip[] = [
  {
    id: "bled-1-day",
    image: "/content/bled.jpg",
    days: 1,
    destinationCount: 2,
    budget: "€50-80",
  },
  {
    id: "ljubljana-2-days",
    image: "/content/ljubljana.jpg",
    days: 2,
    destinationCount: 1,
    budget: "€100-150",
  },
  {
    id: "soca-3-days",
    image: "/content/reka-soca.jpg",
    days: 3,
    destinationCount: 3,
    budget: "€200-300",
  },
  {
    id: "piran-coast",
    image: "/content/piran.jpg",
    days: 2,
    destinationCount: 2,
    budget: "€120-180",
  },
  {
    id: "bela-krajina",
    image: "/content/jurjevanje-bela-krajina.jpg",
    days: 2,
    destinationCount: 1,
    budget: "€80-120",
  },
  {
    id: "triglav-park",
    image: "/content/triglav.jpg",
    days: 3,
    destinationCount: 2,
    budget: "€150-250",
  },
];

interface PreGeneratedItinerariesProps {
  onSelect?: (query: string) => void;
}

export function PreGeneratedItineraries({ onSelect }: PreGeneratedItinerariesProps) {
  const t = useTranslations("pregenTrips");

  return (
    <section className="py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
          <span className="mb-3 inline-block text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            {t("badge")}
          </span>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-3 text-balance text-base text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {TRIPS.map((trip) => (
            <button
              key={trip.id}
              type="button"
              onClick={() => onSelect?.(t(`trips.${trip.id}.query`))}
              className={cn(
                "group flex h-full flex-col overflow-hidden rounded-2xl border bg-card text-left",
                "border-border/60 transition-all duration-300",
                "hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            >
              {/* Fotografija poti — naslovnica */}
              <span className="relative block aspect-[4/3] w-full overflow-hidden bg-muted">
                <Image
                  src={trip.image}
                  alt={t(`trips.${trip.id}.alt`)}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
                {/* Funkcionalni scrim za berljivost dneva na sliki */}
                <span
                  className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent"
                  aria-hidden="true"
                />
                {/* Trajanje — diskretno na fotografiji */}
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                  <Clock className="size-3" aria-hidden="true" />
                  {trip.days} {trip.days === 1 ? t("dayOne") : t("dayOther")}
                </span>
              </span>

              {/* Vsebina */}
              <span className="flex flex-1 flex-col p-5">
                <span className="text-lg font-semibold leading-tight text-foreground">
                  {t(`trips.${trip.id}.title`)}
                </span>

                {/* Destinacije — tiha vrstica z ločili */}
                <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                  <MapPin className="size-3 shrink-0" aria-hidden="true" />
                  {Array.from({ length: trip.destinationCount }, (_, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5">
                      {i > 0 ? (
                        <span className="text-muted-foreground/50" aria-hidden="true">
                          ·
                        </span>
                      ) : null}
                      {t(`trips.${trip.id}.dest${i + 1}`)}
                    </span>
                  ))}
                </span>

                {/* Poudarki */}
                <span className="mt-3 block space-y-1">
                  {[1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <Star
                        className="size-2.5 shrink-0 fill-amber-400 text-amber-400"
                        aria-hidden="true"
                      />
                      {t(`trips.${trip.id}.hl${i}`)}
                    </span>
                  ))}
                </span>

                {/* Budžet + CTA — vedno viden (ne le ob hoverju, tudi na dotik) */}
                <span className="mt-auto flex items-center justify-between border-t border-border/40 pt-3">
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    {trip.budget}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    {t("planCta")}
                    <ArrowRight
                      className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
