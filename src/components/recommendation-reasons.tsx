"use client";

import { useState } from "react";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Check,
  Star,
  MapPin,
  ShieldCheck,
  Crown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// RECOMMENDATION REASONS — "Zakaj to priporočamo?"
// ============================================================================
//
// Prikazuje razloge zakaj je AI priporočil določenega partnerja.
// Gradient: relevantnost, kakovost, preverjenost, bližina, premium.
// ============================================================================

export interface RecommendationReason {
  icon: "relevance" | "quality" | "verified" | "distance" | "premium" | "rating" | "sponsored";
  text: string;
}

interface RecommendationReasonsProps {
  reasons: RecommendationReason[];
  qualityScore?: number; // 0-100
  className?: string;
  defaultOpen?: boolean;
}

const REASON_ICONS = {
  relevance: Check,
  quality: TrendingUp,
  verified: ShieldCheck,
  distance: MapPin,
  premium: Crown,
  rating: Star,
  sponsored: Sparkles,
};

const REASON_COLORS = {
  relevance: "text-emerald-600 dark:text-emerald-400",
  quality: "text-blue-600 dark:text-blue-400",
  verified: "text-emerald-600 dark:text-emerald-400",
  distance: "text-amber-600 dark:text-amber-400",
  premium: "text-violet-600 dark:text-violet-400",
  rating: "text-amber-500",
  sponsored: "text-amber-500",
};

export function RecommendationReasons({
  reasons,
  qualityScore,
  className,
  defaultOpen = false,
}: RecommendationReasonsProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!reasons || reasons.length === 0) return null;

  return (
    <div className={cn("rounded-lg border border-border/60 bg-muted/30", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span className="flex-1 text-xs font-medium text-foreground">
          Zakaj to priporočamo?
        </span>
        {qualityScore !== undefined && (
          <span className="text-[10px] text-muted-foreground">
            Q: {qualityScore}/100
          </span>
        )}
        {open ? (
          <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="border-t border-border/60 px-3 py-2">
          <ul className="space-y-1.5">
            {reasons.map((reason, i) => {
              const Icon = REASON_ICONS[reason.icon];
              const color = REASON_COLORS[reason.icon];
              return (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <Icon
                    className={cn("mt-0.5 size-3.5 shrink-0", color)}
                    aria-hidden="true"
                  />
                  <span className="text-muted-foreground">{reason.text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HELPER — generiraj razloge iz ranked listinga
// ============================================================================

export function generateReasons(params: {
  relevanceScore: number;  // 0-1
  qualityScore: number;    // 0-100
  rating: number;
  verified: boolean;
  partnerStatus: string;
  recommendationType: string;
  sameDestination: boolean;
}): RecommendationReason[] {
  const reasons: RecommendationReason[] = [];
  const { relevanceScore, qualityScore, rating, verified, partnerStatus, recommendationType, sameDestination } = params;

  if (relevanceScore > 0.7) {
    reasons.push({
      icon: "relevance",
      text: "Odlično ustreza vašemu iskanju.",
    });
  } else if (relevanceScore > 0.4) {
    reasons.push({
      icon: "relevance",
      text: "Ustreza vašemu iskanju.",
    });
  }

  if (qualityScore >= 80) {
    reasons.push({
      icon: "quality",
      text: `Kakovosten profil (${qualityScore}/100).`,
    });
  } else if (qualityScore >= 60) {
    reasons.push({
      icon: "quality",
      text: "Dobro izpolnjen profil.",
    });
  }

  if (verified) {
    reasons.push({
      icon: "verified",
      text: "Preverjen partner — podatke je preverila naša ekipa.",
    });
  }

  if (rating >= 4.5) {
    reasons.push({
      icon: "rating",
      text: `Odlične ocene uporabnikov (${rating}/5).`,
    });
  } else if (rating >= 4.0) {
    reasons.push({
      icon: "rating",
      text: `Dobre ocene uporabnikov (${rating}/5).`,
    });
  }

  if (sameDestination) {
    reasons.push({
      icon: "distance",
      text: "Blizu ostalih izbranih lokacij.",
    });
  }

  if (recommendationType === "sponsored") {
    reasons.push({
      icon: "sponsored",
      text: "Sponzorirani partner — podpira našo platformo.",
    });
  } else if (partnerStatus === "premium" || partnerStatus === "featured") {
    reasons.push({
      icon: "premium",
      text: "Premium partner — podpira razvoj platforme.",
    });
  }

  // Vedno vsaj en razlog
  if (reasons.length === 0) {
    reasons.push({
      icon: "relevance",
      text: "Ustreza vašemu iskanju.",
    });
  }

  return reasons;
}
