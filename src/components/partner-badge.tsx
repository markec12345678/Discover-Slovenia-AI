"use client";

import { Star, Crown, BadgeCheck, Info } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// PARTNER BADGE — ena glavna oznaka per partner
// ============================================================================
//
// Prioriteta: Featured > Premium > Verified
// Standard → brez badge-a
//
// Affiliate je LOČEN (uporabi AffiliateBadge komponento)
// ============================================================================

export type PartnerStatus = "standard" | "verified" | "premium" | "featured";

interface PartnerBadgeProps {
  status: PartnerStatus;
  size?: "sm" | "md" | "lg";
  showTooltip?: boolean;
  className?: string;
}

const BADGE_CONFIG: Record<
  PartnerStatus,
  {
    icon: typeof Star;
    label: string;
    shortLabel: string;
    className: string;
    tooltip: string;
  } | null
> = {
  featured: {
    icon: Star,
    label: "Featured Partner",
    shortLabel: "Featured",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border-amber-300/50",
    tooltip:
      "Featured Partner — Preverjen partner z visoko kakovostjo profila in Premium članstvom.",
  },
  premium: {
    icon: Crown,
    label: "Premium Partner",
    shortLabel: "Premium",
    className: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-400 border-violet-300/50",
    tooltip:
      "Premium Partner — Partner podpira razvoj platforme in ima razširjen profil z dodatnimi možnostmi predstavitve.",
  },
  verified: {
    icon: BadgeCheck,
    label: "Preverjen partner",
    shortLabel: "Preverjen",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-300/50",
    tooltip:
      "Preverjen partner — Podatke je preverila ekipa Discover Slovenia AI.",
  },
  standard: null, // brez badge-a
};

export function PartnerBadge({
  status,
  size = "sm",
  showTooltip = true,
  className,
}: PartnerBadgeProps) {
  const config = BADGE_CONFIG[status];

  // Standard partnerji ne dobijo badge-a
  if (!config) return null;

  const Icon = config.icon;

  const sizeClasses = {
    sm: "text-[10px] px-2 py-0.5 gap-0.5",
    md: "text-xs px-2.5 py-1 gap-1",
    lg: "text-sm px-3 py-1.5 gap-1.5",
  };

  const iconSizes = {
    sm: "size-2.5",
    md: "size-3.5",
    lg: "size-4",
  };

  const badge = (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium whitespace-nowrap",
        config.className,
        sizeClasses[size],
        className
      )}
      title={showTooltip ? config.tooltip : undefined}
    >
      <Icon className={iconSizes[size]} aria-hidden="true" />
      {size === "sm" ? config.shortLabel : config.label}
    </span>
  );

  return badge;
}

// ============================================================================
// AFFILIATE BADGE — ločeno od partner statusa
// ============================================================================

export type AffiliateType = "booking" | "viator" | "discovercars" | "skyscanner" | "generic";

interface AffiliateBadgeProps {
  type?: AffiliateType;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const AFFILIATE_LABELS: Record<AffiliateType, string> = {
  booking: "Booking.com",
  viator: "Viator",
  discovercars: "DiscoverCars",
  skyscanner: "Skyscanner",
  generic: "Partner",
};

export function AffiliateBadge({
  type = "generic",
  size = "sm",
  className,
}: AffiliateBadgeProps) {
  const sizeClasses = {
    sm: "text-[10px] px-2 py-0.5 gap-0.5",
    md: "text-xs px-2.5 py-1 gap-1",
    lg: "text-sm px-3 py-1.5 gap-1.5",
  };

  const iconSizes = {
    sm: "size-2.5",
    md: "size-3.5",
    lg: "size-4",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium whitespace-nowrap",
        "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border-blue-300/50",
        sizeClasses[size],
        className
      )}
      title="Partnerska povezava — Preusmerjeni boste na zunanjo stran. Discover Slovenia AI lahko prejeme provizijo."
    >
      <svg
        className={iconSizes[size]}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      {size === "sm" ? "Partner" : AFFILIATE_LABELS[type]}
    </span>
  );
}
