"use client";

import {
  Sparkles,
  Check,
  Navigation,
  Bookmark,
  Star,
  MapPin,
  Clock,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PartnerBadge, type PartnerStatus } from "@/components/partner-badge";
import { cn } from "@/lib/utils";

// ============================================================================
// AI RECOMMENDATION CARD — premium kartica za vsak AI predlog
// ============================================================================
//
// ┌─────────────────────────┐
// │ ⭐ 94% AI MATCH         │
// │                         │
// │ Gostilna Bela Krajina   │
// │                         │
// │ Zakaj priporočam:       │
// │ ✓ lokalna hrana         │
// │ ✓ blizu poti            │
// │ ✓ preverjen partner     │
// │                         │
// │ [Rezerviraj] [Navigacija]│
// └─────────────────────────┘
// ============================================================================

export interface AIRecommendation {
  name: string;
  category: string;
  destinationName?: string;
  description?: string;
  rating?: number;
  priceRange?: string;
  matchScore: number;       // 0-100
  reasons: string[];        // zakaj priporočamo
  partnerStatus?: PartnerStatus;
  timeSlot?: string;
  duration?: number;
  estimatedCost?: number;
  website?: string;
  phone?: string;
  image?: string;
}

interface RecommendationCardProps {
  rec: AIRecommendation;
  onNavigate?: () => void;
  onSave?: () => void;
  onBook?: () => void;
  variant?: "default" | "compact";
}

// Match score → barva
function getMatchColor(score: number): string {
  if (score >= 90) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 75) return "text-primary";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function getMatchBg(score: number): string {
  if (score >= 90) return "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40";
  if (score >= 75) return "bg-primary/5 border-primary/20";
  if (score >= 60) return "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40";
  return "bg-muted/30 border-border/60";
}

const CATEGORY_EMOJI: Record<string, string> = {
  restaurant: "🍽️",
  hotel: "🏨",
  activity: "🏔️",
  shop: "🛒",
  bar: "☕",
  transport: "🚗",
  default: "📍",
};

export function RecommendationCard({
  rec,
  onNavigate,
  onSave,
  onBook,
  variant = "default",
}: RecommendationCardProps) {
  const matchColor = getMatchColor(rec.matchScore);
  const cardBg = getMatchBg(rec.matchScore);
  const emoji = CATEGORY_EMOJI[rec.category] || CATEGORY_EMOJI.default;
  const isCompact = variant === "compact";

  return (
    <Card className={cn("overflow-hidden transition-all hover:shadow-lg", cardBg)}>
      <CardContent className={cn(isCompact ? "p-3" : "p-4")}>
        {/* VRSTICA 1: Match score + badge */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className={cn("flex items-center gap-1.5", matchColor)}>
            <div className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold",
              rec.matchScore >= 90 ? "bg-emerald-100 dark:bg-emerald-950/40" : "bg-primary/10"
            )}>
              <Sparkles className="size-3" aria-hidden="true" />
              {rec.matchScore}% AI MATCH
            </div>
          </div>
          {rec.partnerStatus && rec.partnerStatus !== "standard" && (
            <PartnerBadge status={rec.partnerStatus} size="sm" />
          )}
        </div>

        {/* VRSTICA 2: Ime + emoji */}
        <div className="flex items-start gap-2">
          <span className="text-2xl shrink-0" aria-hidden="true">{emoji}</span>
          <div className="flex-1 min-w-0">
            <h4 className="text-base font-bold leading-tight">{rec.name}</h4>
            {rec.destinationName && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <MapPin className="size-3" aria-hidden="true" />
                {rec.destinationName}
              </div>
            )}
          </div>
        </div>

        {/* VRSTICA 3: Rating + cena + čas */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {rec.rating && rec.rating > 0 && (
            <span className="flex items-center gap-0.5 font-medium">
              <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />
              {rec.rating.toFixed(1)}
            </span>
          )}
          {rec.priceRange && (
            <Badge variant="secondary" className="text-[10px]">{rec.priceRange}</Badge>
          )}
          {rec.timeSlot && (
            <span className="flex items-center gap-0.5 text-muted-foreground">
              <Clock className="size-3" aria-hidden="true" />
              {rec.timeSlot}
            </span>
          )}
          {rec.estimatedCost !== undefined && rec.estimatedCost > 0 && (
            <span className="text-muted-foreground">~€{rec.estimatedCost}</span>
          )}
        </div>

        {/* VRSTICA 4: Zakaj priporočam */}
        {!isCompact && rec.reasons.length > 0 && (
          <div className="mt-3 rounded-lg bg-background/60 backdrop-blur-sm p-2.5 border border-border/40">
            <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">
              Zakaj priporočamo?
            </p>
            <ul className="space-y-1">
              {rec.reasons.slice(0, 4).map((reason, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs">
                  <Check className="mt-0.5 size-3 shrink-0 text-emerald-500" aria-hidden="true" />
                  <span className="text-foreground/80">{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* VRSTICA 5: Akcijski gumbi */}
        <div className="mt-3 flex items-center gap-2">
          {onBook && (
            <Button
              size="sm"
              className="gap-1.5 text-xs"
              onClick={onBook}
            >
              <Sparkles className="size-3" aria-hidden="true" />
              Rezerviraj
            </Button>
          )}
          {onNavigate && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={onNavigate}
            >
              <Navigation className="size-3" aria-hidden="true" />
              Navigacija
            </Button>
          )}
          {onSave && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={onSave}
              aria-label="Shrani"
            >
              <Bookmark className="size-3.5" aria-hidden="true" />
            </Button>
          )}
          {rec.website && !onBook && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs ml-auto"
              asChild
            >
              <a href={rec.website} target="_blank" rel="noopener noreferrer">
                Obišči
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
