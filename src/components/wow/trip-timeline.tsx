"use client";

import { useState } from "react";
import {
  Clock,
  MapPin,
  Navigation,
  Phone,
  Bookmark,
  Star,
  Coffee,
  UtensilsCrossed,
  Mountain,
  Camera,
  ShoppingBag,
  Wine,
  Car,
  Sparkles,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PartnerBadge, type PartnerStatus } from "@/components/partner-badge";
import type { DayPlan, LocationVisit, Itinerary } from "@/lib/types";

// ============================================================================
// AI TRIP TIMELINE — vizualni dan z ikonami, lokacijami, akcijami
// ============================================================================

const ACTIVITY_ICONS: Record<string, typeof Coffee> = {
  hotel: Coffee,
  restaurant: UtensilsCrossed,
  activity: Mountain,
  shop: ShoppingBag,
  bar: Wine,
  transport: Car,
  attraction: Camera,
  default: MapPin,
};

const TIME_COLORS: Record<string, string> = {
  morning: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  afternoon: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  evening: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400",
};

function getTimeOfDay(timeSlot: string): "morning" | "afternoon" | "evening" {
  const hour = parseInt(timeSlot.split(":")[0] || "12", 10);
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function renderCategoryIcon(category?: string, className?: string) {
  const Icon = !category ? ACTIVITY_ICONS.default : (ACTIVITY_ICONS[category] || ACTIVITY_ICONS.default);
  return <Icon className={className || "size-5"} aria-hidden="true" />;
}

interface TimelineStopProps {
  visit: LocationVisit & { partnerStatus?: string; aiMatchScore?: number; website?: string; distanceToNext?: string };
  index: number;
  isLast: boolean;
}

function TimelineStop({ visit, index, isLast }: TimelineStopProps) {
  const [saved, setSaved] = useState(false);
  const timeOfDay = getTimeOfDay(visit.time_slot);

  const startHour = visit.time_slot.split("-")[0] || "09:00";

  return (
    <div className="relative flex gap-4 pb-8 last:pb-0">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[27px] top-14 bottom-0 w-0.5 bg-gradient-to-b from-border to-transparent" />
      )}

      {/* Time + Icon circle */}
      <div className="flex flex-col items-center gap-2 shrink-0">
        <div className={cn(
          "flex size-14 items-center justify-center rounded-full border-2 shadow-sm",
          TIME_COLORS[timeOfDay]
        )}>
          {renderCategoryIcon(visit.category || visit.destination_id, "size-5")}
        </div>
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
          {startHour}
        </span>
      </div>

      {/* Content card */}
      <div className="flex-1 min-w-0 pb-2">
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-primary/30">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h4 className="text-base font-semibold leading-tight">
                {visit.destination_name}
              </h4>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="size-3" aria-hidden="true" />
                  {visit.time_slot}
                </span>
                <span className="flex items-center gap-1">
                  <Navigation className="size-3" aria-hidden="true" />
                  {visit.duration}h
                </span>
                <span className="flex items-center gap-1 font-medium text-foreground">
                  €{visit.estimated_cost}
                </span>
              </div>
            </div>
            {visit.partnerStatus && visit.partnerStatus !== "standard" && (
              <PartnerBadge status={visit.partnerStatus as PartnerStatus} size="sm" />
            )}
          </div>

          {/* Notes */}
          {visit.notes && (
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
              {visit.notes}
            </p>
          )}

          {/* AI match score */}
          {visit.aiMatchScore && (
            <div className="mt-2 flex items-center gap-1.5">
              <Sparkles className="size-3 text-primary" aria-hidden="true" />
              <span className="text-xs font-medium text-primary">
                AI Match {visit.aiMatchScore}%
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
              <Navigation className="size-3" aria-hidden="true" />
              Navigacija
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
              <Phone className="size-3" aria-hidden="true" />
              Kliči
            </Button>
            <Button
              size="sm"
              variant={saved ? "default" : "outline"}
              className="h-8 gap-1.5 text-xs"
              onClick={() => setSaved(!saved)}
            >
              <Bookmark className={cn("size-3", saved && "fill-current")} aria-hidden="true" />
              {saved ? "Shranjeno" : "Shrani"}
            </Button>
            {visit.website && (
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" asChild>
                <a href={visit.website} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3" aria-hidden="true" />
                  Spletna stran
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* Distance to next */}
        {!isLast && visit.distanceToNext && (
          <div className="mt-2 flex items-center gap-1 pl-2 text-xs text-muted-foreground">
            <div className="h-px w-4 bg-border" />
            <span>{visit.distanceToNext}</span>
            <ChevronRight className="size-3" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}

interface TripTimelineProps {
  itinerary: Itinerary;
  dayFilter?: number;
}

export function TripTimeline({ itinerary, dayFilter }: TripTimelineProps) {
  const days = dayFilter
    ? itinerary.days.filter((d) => d.day === dayFilter)
    : itinerary.days;

  return (
    <div className="space-y-8">
      {days.map((day: DayPlan) => (
        <div key={day.day}>
          {/* Day header */}
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
              {day.day}
            </div>
            <div>
              <h3 className="text-lg font-bold">Dan {day.day}</h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>☀️ {day.weather.condition}</span>
                <span>·</span>
                <span>{day.weather.temp}°C</span>
              </div>
            </div>
          </div>

          {/* Timeline stops */}
          <div className="pl-1">
            {day.locations.map((visit: LocationVisit, idx: number) => (
              <TimelineStop
                key={`${day.day}-${idx}`}
                visit={visit}
                index={idx}
                isLast={idx === day.locations.length - 1}
              />
            ))}
          </div>
        </div>
      ))}

      {/* AI summary footer */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          <span className="text-sm font-semibold">AI povzetek</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {itinerary.days.length}-dnevni načrt · skupaj €{itinerary.total_budget} ·{" "}
          {itinerary.days.reduce((sum, d) => sum + d.locations.length, 0)} postankov
        </p>
        {itinerary.recommendations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {itinerary.recommendations.slice(0, 3).map((rec, i) => (
              <span key={i} className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                {rec}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SOCIAL SHARE
// ============================================================================

interface SocialShareProps {
  itinerary: Itinerary;
}

export function SocialShare({ itinerary }: SocialShareProps) {
  const shareText = `Moj AI dan v Sloveniji 🇸🇮\n\n${itinerary.days
    .map((d) => `Dan ${d.day}: ${d.locations.map((l) => l.destination_name).join(" → ")}`)
    .join("\n")}\n\nSkupaj: €${itinerary.total_budget}\n\nNačrtuj svoje potovanje: discoverslovenia.ai`;

  const shareUrls = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(shareText)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent("https://discoverslovenia.ai")}&quote=${encodeURIComponent(shareText)}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`,
  };

  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Deli:</span>
      <a
        href={shareUrls.whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        className="flex size-8 items-center justify-center rounded-full bg-green-500/10 text-green-600 transition-colors hover:bg-green-500/20"
        aria-label="Deli na WhatsApp"
      >
        <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
        </svg>
      </a>
      <a
        href={shareUrls.facebook}
        target="_blank"
        rel="noopener noreferrer"
        className="flex size-8 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 transition-colors hover:bg-blue-500/20"
        aria-label="Deli na Facebook"
      >
        <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      </a>
      <a
        href={shareUrls.twitter}
        target="_blank"
        rel="noopener noreferrer"
        className="flex size-8 items-center justify-center rounded-full bg-sky-500/10 text-sky-600 transition-colors hover:bg-sky-500/20"
        aria-label="Deli na X"
      >
        <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </a>
      <button
        onClick={handleCopy}
        className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80"
        aria-label="Kopiraj"
      >
        {copied ? (
          <span className="text-xs">✓</span>
        ) : (
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    </div>
  );
}

// ============================================================================
// AI QUALITY COACH
// ============================================================================

interface QualityCoachProps {
  qualityScore: number;
  signals: {
    profileCompletion: number;
    imageQuality: number;
    descriptionQuality: number;
    aiTags: number;
    adminVerification: number;
    rating: number;
    dataFreshness: number;
  };
  details: {
    completionPercentage: number;
    imageCount: number;
    descriptionLength: number;
    longDescriptionLength: number;
    tagCount: number;
    isVerified: boolean;
    ratingValue: number;
    daysSinceUpdate: number;
  };
}

interface CoachSuggestion {
  icon: typeof Coffee;
  text: string;
  impact: string;
  action: string;
}

export function QualityCoach({ qualityScore, signals, details }: QualityCoachProps) {
  const suggestions: CoachSuggestion[] = [];

  if (details.imageCount < 3) {
    const needed = 3 - details.imageCount;
    suggestions.push({
      icon: Camera,
      text: `Dodajte ${needed} ${needed === 1 ? "fotografijo" : "fotografiji"} (trenutno: ${details.imageCount})`,
      impact: `+${15 - signals.imageQuality} točk`,
      action: "Dodaj slike",
    });
  }

  if (details.descriptionLength < 100) {
    suggestions.push({
      icon: Star,
      text: "Razširite kratek opis (min 100 znakov)",
      impact: `+${8 - Math.min(signals.descriptionQuality, 8)} točk`,
      action: "Uredi opis",
    });
  }

  if (details.longDescriptionLength < 500) {
    suggestions.push({
      icon: Star,
      text: "Dodajte podroben opis (min 500 znakov)",
      impact: "+4 točk",
      action: "Dodaj dolgi opis",
    });
  }

  if (details.tagCount < 3) {
    suggestions.push({
      icon: Sparkles,
      text: `Dodajte AI oznake (trenutno: ${details.tagCount}, idealno: 6+)`,
      impact: `+${10 - signals.aiTags} točk`,
      action: "Generiraj AI oznake",
    });
  }

  if (details.daysSinceUpdate > 30) {
    suggestions.push({
      icon: Clock,
      text: `Posodobite profil (zadnja posodobitev: ${details.daysSinceUpdate} dni nazaj)`,
      impact: `+${10 - signals.dataFreshness} točk`,
      action: "Posodobi profil",
    });
  }

  const potentialGain = suggestions.reduce((sum, s) => {
    const match = s.impact.match(/\+(\d+)/);
    return sum + (match ? parseInt(match[1], 10) : 0);
  }, 0);
  const potentialScore = Math.min(qualityScore + potentialGain, 100);

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-5 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-bold">AI Quality Coach</h3>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">Quality Score</span>
            <span className="font-bold tabular-nums">{qualityScore}/100</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-all"
              style={{ width: `${qualityScore}%` }}
            />
          </div>
          {potentialGain > 0 && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              💡 Z nasveti spodaj lahko dosežete{" "}
              <span className="font-bold text-primary">{potentialScore}/100</span> (+{potentialGain})
            </p>
          )}
        </div>
      </div>

      {suggestions.length > 0 ? (
        <div className="mt-4 space-y-2">
          {suggestions.map((s, i) => {
            const SuggestionIcon = s.icon;
            return (
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg border border-border/60 bg-background p-2.5"
              >
                <SuggestionIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground">{s.text}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      {s.impact}
                    </span>
                    <button className="text-[10px] font-medium text-primary hover:underline">
                      {s.action} →
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-300/50 bg-emerald-50 dark:bg-emerald-950/20 p-3">
          <Star className="size-4 text-emerald-600" aria-hidden="true" />
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            Odlično! Vaš profil je optimalno izpolnjen.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// QR PARTNER CARD — generira QR kodo za lokal
// ============================================================================

interface QRPartnerCardProps {
  listingSlug: string;
  listingName: string;
  destinationName?: string;
}

export function QRPartnerCard({ listingSlug, listingName, destinationName }: QRPartnerCardProps) {
  const profileUrl = `https://discoverslovenia.ai/listing/${listingSlug}`;
  // Using a simple QR code API (goqr.me — free, no API key)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(profileUrl)}&color=2d6a3e&bgcolor=ffffff&margin=10`;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2">
        <svg className="size-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 14h3v3h-3z" />
          <path d="M21 14h-1v3" />
          <path d="M14 21h3v-1" />
          <path d="M21 21v-1h-1" />
        </svg>
        <h3 className="text-sm font-bold">QR Partner Card</h3>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        Natisnite in postavite na mize, recepcijo ali v sobe. Gost skenira in dobi vaš profil.
      </p>

      <div className="mt-3 flex flex-col items-center gap-3 rounded-lg border border-border/40 bg-background p-4">
        <img
          src={qrUrl}
          alt={`QR koda za ${listingName}`}
          className="size-40 rounded-lg"
          width={160}
          height={160}
        />
        <div className="text-center">
          <p className="text-sm font-semibold">{listingName}</p>
          {destinationName && (
            <p className="text-xs text-muted-foreground">{destinationName}</p>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">discoverslovenia.ai</p>
        </div>
      </div>

      <Button
        size="sm"
        variant="outline"
        className="mt-3 w-full"
        onClick={() => window.open(qrUrl, "_blank")}
      >
        Prenesi QR kodo
      </Button>
    </div>
  );
}
