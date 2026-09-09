"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CalendarCheck,
  Clock,
  ExternalLink,
  MapPin,
  Star,
  Users,
} from "lucide-react";
import { ExperienceModal } from "@/components/sections/experience-modal";
import { BookingAssistant } from "@/components/booking-assistant";
import {
  EXPERIENCE_CATEGORY_LABELS,
  type Experience,
} from "@/lib/marketplace-types";
import type { PartnerStatus } from "@/components/partner-badge";

// ============================================================================
// SEO KONVERZIJSKE KARTICE — povezujejo organski promet (322 strani) z
// realnimi monetizacijskimi potmi:
//   • SeoExperienceCard → ExperienceModal → POST /api/bookings (rezervacija)
//   • SeoListingCard   → BookingAssistant → POST /api/listing-inquiry (lead)
//
// Prej so SEO strani prikazovale le statične kartice / zunanje povezave —
// zdaj vsak obisk organskega prometa konvergira v dokazljivo transakcijo
// (bookingCount / leadCount — B2B dokaz vrednosti za Premium paket).
// ============================================================================

interface SeoExperienceCardProps {
  /** Popolnoma serializiran Experience (images/languages že parsed array-i). */
  experience: Experience;
  /** Opcijsko skrij gumb "Pri ponudniku" (npr. ko želimo čistejši CTA). */
  hideProviderLink?: boolean;
}

/**
 * SeoExperienceCard — kartica izkušnje z REALNIM rezervacijskim CTA.
 * Uporabljena na things-to-do in guide SEO straneh.
 */
export function SeoExperienceCard({
  experience,
  hideProviderLink = false,
}: SeoExperienceCardProps) {
  const [selected, setSelected] = useState<Experience | null>(null);

  const firstImage = experience.images?.[0];
  const categoryLabel =
    EXPERIENCE_CATEGORY_LABELS[experience.category] ?? experience.category;

  return (
    <>
      <Card className="group h-full overflow-hidden transition-all hover:shadow-md">
        <button
          type="button"
          onClick={() => setSelected(experience)}
          className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={`Odpri podrobnosti: ${experience.name}`}
        >
          <div className="relative aspect-video w-full overflow-hidden">
            {firstImage ? (
              <img
                src={firstImage}
                alt={experience.name}
                loading="lazy"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-muted">
                <CalendarCheck className="size-8 text-muted-foreground" aria-hidden="true" />
              </div>
            )}
          </div>
        </button>
        <CardContent className="flex h-[calc(100%-aspect-video)] flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <Badge variant="secondary" className="text-xs">
              {categoryLabel}
            </Badge>
            {experience.rating > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                {experience.rating.toFixed(1)}
              </span>
            )}
          </div>
          <h3 className="line-clamp-2 text-sm font-semibold">
            {experience.name}
          </h3>
          <p className="line-clamp-2 flex-1 text-xs text-muted-foreground">
            {experience.description}
          </p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="size-3" aria-hidden="true" />
              {experience.durationHours} h
            </span>
            <span className="flex items-center gap-1">
              <Users className="size-3" aria-hidden="true" />
              {experience.maxGroupSize}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-sm font-bold text-primary">
              od {experience.pricePerPerson} €
            </span>
            <Button size="sm" className="h-9" onClick={() => setSelected(experience)}>
              <CalendarCheck className="size-3.5" aria-hidden="true" />
              Rezerviraj
            </Button>
          </div>
          {!hideProviderLink && experience.providerWebsite && (
            <a
              href={experience.providerWebsite}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="flex items-center justify-center gap-1 pt-0.5 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              <ExternalLink className="size-3" aria-hidden="true" />
              Pri ponudniku
            </a>
          )}
        </CardContent>
      </Card>

      {/* Rezervacijski modal — enaka pot kot homepage (realna rezervacija) */}
      {selected && (
        <ExperienceModal
          experience={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

export interface SeoListingInput {
  id: string;
  name: string;
  category: string;
  description: string;
  address: string;
  rating: number;
  reviewCount: number;
  plan: string;
  featured: boolean;
  partnerStatus: PartnerStatus;
  destinationName?: string | null;
}

interface SeoListingCardProps {
  listing: SeoListingInput;
}

/**
 * SeoListingCard — kartica lokala z REALNIM lead capture CTA
 * ("Pošlji povpraševanje" → BookingAssistant → POST /api/listing-inquiry).
 */
export function SeoListingCard({ listing }: SeoListingCardProps) {
  return (
    <Card
      className={`h-full transition-all hover:shadow-md ${
        listing.plan === "premium" || listing.plan === "enterprise"
          ? "border-primary/60"
          : ""
      }`}
    >
      <CardContent className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <Badge variant="secondary" className="text-xs">
            {listing.category}
          </Badge>
          {listing.featured && (
            <Badge className="bg-amber-400 text-xs text-amber-950">
              <Star className="mr-0.5 size-3 fill-amber-950 text-amber-950" aria-hidden="true" />
              Priporočeno
            </Badge>
          )}
        </div>
        <h3 className="text-sm font-semibold">{listing.name}</h3>
        <p className="line-clamp-2 flex-1 text-xs text-muted-foreground">
          {listing.description}
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {listing.rating > 0 && (
            <span className="flex items-center gap-1 font-medium text-foreground">
              <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
              {listing.rating.toFixed(1)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden="true" />
            {listing.destinationName ?? listing.address}
          </span>
        </div>
        {/* Lead capture — realno povpraševanje ponudniku */}
        <BookingAssistant
          listingId={listing.id}
          listingName={listing.name}
          partnerStatus={listing.partnerStatus}
          className="mt-1 w-full"
        />
      </CardContent>
    </Card>
  );
}
