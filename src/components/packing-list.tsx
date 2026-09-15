"use client";

import { useId, useState } from "react";
import { Backpack } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

// ============================================================================
// PACKING LIST — "Kaj pakirati"
// ============================================================================
//
// Skupna sekcija packing liste za itinerer (glej /api/itinerary —
// itinerary.packingList: string[]). Uporabljena v itinerary-planner
// (rezultati) in na javni strani /pot/[shareId] (shared-trip).
//
// Odkljukanje je ČISTO lokalno stanje (UX delight pri pakiranju) — se NE
// persistira (celoten itinerer se shrani prek obstoječega "Shrani in deli"
// flow-a). Hidratacija varna: prvi paint brez odkljukov.
// ============================================================================

interface PackingListSectionProps {
  /** Seznam stvari za pakiranje (itinerary.packingList) */
  items?: string[];
  /** Naslov sekcije */
  title?: string;
  /** "card" = naslov znotraj kartice (planner), "section" = h2 nad karticami (/pot) */
  variant?: "card" | "section";
  /** Dodatni razred za koren sekcije (npr. mb-10 na /pot) */
  className?: string;
}

export function PackingListSection({
  items,
  title = "Kaj pakirati",
  variant = "card",
  className,
}: PackingListSectionProps) {
  // useId → unikanten prefix tudi če je sekcija uporabljena večkrat na strani
  const listId = useId();
  // Lokalno stanje odkljukov (index → checked); NE persistiramo
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  // Prazna/undefined sekcija se ne renderira
  if (!items || items.length === 0) return null;

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const allPacked = checkedCount === items.length;

  const progressBadge = (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 font-medium",
        allPacked &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      )}
      aria-live="polite"
    >
      {checkedCount}/{items.length}
      {allPacked ? " — spakirano!" : " spakirano"}
    </Badge>
  );

  const checklist = (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((item, index) => {
        const isChecked = Boolean(checked[index]);
        return (
          <li key={`${listId}-${index}`}>
            <label
              htmlFor={`${listId}-${index}`}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 bg-card/50 p-3 text-sm transition-colors hover:border-primary/30",
                isChecked && "border-primary/40 bg-primary/5"
              )}
            >
              <Checkbox
                id={`${listId}-${index}`}
                checked={isChecked}
                onCheckedChange={(state) =>
                  setChecked((prev) => ({
                    ...prev,
                    [index]: state === true,
                  }))
                }
                aria-label={item}
              />
              <span
                className={cn(
                  "leading-snug",
                  isChecked && "text-muted-foreground line-through"
                )}
              >
                {item}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );

  const hint = (
    <p className="mt-3 text-xs text-muted-foreground">
      Odkljukaj, ko stvar spakiraš — seznam je tvoj osebni čeklist.
    </p>
  );

  if (variant === "section") {
    return (
      <section className={className} aria-label={title}>
        <h2 className="mb-4 flex flex-wrap items-center gap-2 text-xl font-bold sm:text-2xl">
          <Backpack className="size-5 text-primary" aria-hidden="true" />
          {title}
          {progressBadge}
        </h2>
        <Card>
          <CardContent className="p-4 sm:p-6">
            {checklist}
            {hint}
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className={className} aria-label={title}>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
            <Backpack className="size-5 text-primary" aria-hidden="true" />
            {title}
            <span className="ml-auto">{progressBadge}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {checklist}
          {hint}
        </CardContent>
      </Card>
    </section>
  );
}

export default PackingListSection;
