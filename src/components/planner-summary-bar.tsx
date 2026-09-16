"use client";

import { useTranslations } from "next-intl";
import {
  Calendar,
  Cloud,
  Euro,
  Gauge,
  Pencil,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { INTERESTS } from "@/lib/slovenia-data";
import type { PartyType } from "@/lib/party-types";
import type { Pace } from "@/lib/pace-types";
import type { PlannerInput, Season } from "@/lib/types";

interface PlannerSummaryBarProps {
  formData: PlannerInput;
  onEdit: () => void;
}

const PARTY_LABEL_KEYS: Record<PartyType, string> = {
  couple: "partyCouple",
  family: "partyFamily",
  friends: "partyFriends",
  solo: "partySolo",
};

const SEASON_LABEL_KEYS: Record<Season, string> = {
  spring: "seasonSpring",
  summer: "seasonSummer",
  autumn: "seasonAutumn",
  winter: "seasonWinter",
};

const PACE_LABEL_KEYS: Record<Pace, string> = {
  slow: "paceSlow",
  balanced: "paceBalanced",
  fast: "paceFast",
};

/**
 * UI sprint (točka B smeri): obrazec se PO generiranju zloži v to kompaktno
 * vrstico parametrov (dnevi, skupina, proračun, sezona, tempo, interesi) z
 * gumbom "Uredi" — delovna površina načrta prevzame prvi zaslon, vsi
 * kontrolniki ostanejo en klik stran. Vsa logika obrazca je nespremenjena.
 */
export function PlannerSummaryBar({ formData, onEdit }: PlannerSummaryBarProps) {
  const t = useTranslations("planner");

  const partyLabel = formData.partyType
    ? t(PARTY_LABEL_KEYS[formData.partyType])
    : null;
  const seasonLabel = t(SEASON_LABEL_KEYS[formData.season]);
  const paceLabel = formData.pace ? t(PACE_LABEL_KEYS[formData.pace]) : null;
  const selectedInterests = INTERESTS.filter((i) =>
    formData.interests.includes(i.value)
  );
  const hiddenInterests = formData.interests.length - selectedInterests.length;

  const chipClass =
    "inline-flex min-h-[28px] items-center gap-1 rounded-full border border-border/60 bg-background px-2.5 py-1 text-xs text-muted-foreground";

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-card/60 p-2.5 sm:gap-2 sm:p-3"
      role="group"
      aria-label={t("summaryEditAria")}
    >
      <span className={chipClass} title={t("daysLabel")}>
        <Calendar className="size-3 shrink-0" aria-hidden="true" />
        {t("summaryDaysChip", { days: formData.days })}
      </span>
      <span className={chipClass} title={t("groupSizeLabel")}>
        <Users className="size-3 shrink-0" aria-hidden="true" />
        {partyLabel ? `${partyLabel} · ×${formData.groupSize}` : `×${formData.groupSize}`}
      </span>
      <span className={chipClass} title={t("budgetLabel")}>
        <Euro className="size-3 shrink-0" aria-hidden="true" />
        €{formData.budget}
      </span>
      <span className={chipClass} title={t("seasonLabel")}>
        <Cloud className="size-3 shrink-0" aria-hidden="true" />
        {seasonLabel}
      </span>
      {paceLabel && (
        <span className={chipClass} title={t("paceLabel")}>
          <Gauge className="size-3 shrink-0" aria-hidden="true" />
          {paceLabel}
        </span>
      )}
      {selectedInterests.slice(0, 4).map((interest) => (
        <span key={interest.value} className={chipClass}>
          <span aria-hidden="true">{interest.icon}</span>
          {interest.label}
        </span>
      ))}
      {(hiddenInterests > 0 || selectedInterests.length > 4) && (
        <span className={chipClass}>
          +{Math.max(hiddenInterests, selectedInterests.length - 4)}
        </span>
      )}
      <span className="ml-auto">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onEdit}
          className="gap-1.5"
          aria-label={t("summaryEditAria")}
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          {t("summaryEdit")}
        </Button>
      </span>
    </div>
  );
}
