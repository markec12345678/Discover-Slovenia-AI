"use client";

import { useMemo, useState } from "react";
import {
  Car,
  ChevronDown,
  Euro,
  Gauge,
  HelpCircle,
  Lightbulb,
  Trees,
  Wine,
  type LucideIcon,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import {
  computeItineraryQuality,
  formatDrivingMinutes,
} from "@/lib/itinerary-quality";
import type { Itinerary, PlannerInput } from "@/lib/types";
import { cn } from "@/lib/utils";

// ============================================================================
// ITINERARY QUALITY CARD — "Tvoja pot" (FW4.1)
// ============================================================================
//
// Namen: nov obiskovalec v 5 sekundah razume ZNAČAJ poti, ne samo njeno
// vsebino. Metrike so DETERMINISTIČNO izračunane (vožnja iz koordinat,
// strošek iz cen lokacij …) — AI prispeva samo utemeljitev "Zakaj ta pot?".
//
// Zasnovno pravilo uporabnika: BREZ arbitrarnega "AI Score: 94/100" —
// strukturne metrike + razlaga namesto marketing številke.
//
// Starejši shranjeni/restavrirani načrti (brez quality polja): kartica
// metrike izračuna na mestu uporabe iz ISTE čiste funkcije kot API.
// ============================================================================

interface ItineraryQualityCardProps {
  itinerary: Itinerary;
  input: PlannerInput;
  /** Proračun potnika (EUR) — za prikaz "≈ €X od €Y" */
  className?: string;
}

interface MetricDef {
  key: string;
  label: string;
  value: string;
  icon: LucideIcon;
  /** Kratek razlaga vrstici v "Kako smo izračunali?" */
  how: string;
  /** Označi metrike, kjer visoka vrednost ni nujno "boljša" (brez barvnega pristranskosti) */
  neutral?: boolean;
}

/** "5/5" → pet pik (polne + prazne) — vizualno hitrejše branje kot besedilo. */
function ScoreDots({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={cn(
            "size-1.5 rounded-full",
            i < score ? "bg-primary" : "bg-muted-foreground/25"
          )}
        />
      ))}
    </span>
  );
}

export function ItineraryQualityCard({
  itinerary,
  input,
  className,
}: ItineraryQualityCardProps) {
  const [howOpen, setHowOpen] = useState(false);

  // Metrike: shranjene (API) ali izračunane na mestu uporabe (stari načrti) —
  // ista čista funkcija, enak rezultat.
  const quality = useMemo(
    () => itinerary.quality ?? computeItineraryQuality(itinerary, input),
    [itinerary, input]
  );

  // Utemeljitev: AI (sanitizirana) ali deterministična sestava; za stare
  // načrte brez rationale pade na prazno (ne izmišljujemo).
  const rationale = typeof itinerary.rationale === "string" ? itinerary.rationale : null;

  // Vrstica "3 dni · 2 osebi · narava + hrana"
  const metaParts = [
    `${quality.days} ${quality.days === 1 ? "dan" : quality.days === 2 ? "dneva" : "dni"}`,
    `${quality.groupSize} ${quality.groupSize === 1 ? "oseba" : quality.groupSize === 2 ? "osebi" : "oseb"}`,
  ];
  const interestPreview = input.interests.slice(0, 3).join(" + ");
  if (interestPreview) metaParts.push(interestPreview);

  const metrics: MetricDef[] = [
    {
      key: "driving",
      label: "Vožnja",
      value: formatDrivingMinutes(quality.drivingMinutes),
      icon: Car,
      how: "Seštevek cestnih razdalj (geografske koordinate × 1,3 za dejanske ceste, povprečje 55 km/h) med zaporednimi lokacijami na poti.",
      neutral: true,
    },
    {
      key: "cost",
      label: "Predviden strošek",
      value: `${quality.budgetTier}`,
      icon: Euro,
      how: `Seštevek cen vseh lokacij na poti (≈ €${Math.round(quality.estimatedCost)}${input.budget ? ` od ${input.budget} € proračuna` : ""}) — €€€ pomeni nad 160 € na osebo na dan.`,
      neutral: true,
    },
    {
      key: "tempo",
      label: "Tempo",
      value: quality.tempo,
      icon: Gauge,
      how: "Povprečno število obiskov na dan: do 2 = miren, 3 = umirjen, 4 ali več = poln program.",
      neutral: true,
    },
    {
      key: "nature",
      label: "Narava",
      value: `${quality.natureScore}/5`,
      icon: Trees,
      how: "Delež naravnih destinacij na poti (jezerske, gorske, rečne, jame, soteske, obala) med vsemi obiskanimi.",
    },
    {
      key: "food",
      label: "Hrana",
      value: `${quality.foodScore}/5`,
      icon: Wine,
      how: "Kombinacija kulinaričnih želja potnika in restavracij/gostiln/vinotek, ki jih pot vključuje.",
    },
  ];

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="space-y-4 p-4 sm:p-5">
        {/* Glava — "Tvoja pot" + meta vrstica */}
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Tvoja pot
          </p>
          <h4 className="mt-0.5 text-base font-semibold leading-snug">
            {metaParts.join(" · ")}
          </h4>
        </div>

        {/* Metrike — grid 2×3 (mobile 2 stolpca) */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {metrics.map((m) => (
            <div key={m.key} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <m.icon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate">{m.label}</span>
              </dt>
              <dd className="mt-1 flex items-center gap-2 text-sm font-semibold">
                <span className={cn(m.neutral && "text-foreground")}>
                  {m.value}
                </span>
                {!m.neutral && (
                  <ScoreDots
                    score={
                      m.key === "nature" ? quality.natureScore : quality.foodScore
                    }
                  />
                )}
              </dd>
            </div>
          ))}
        </dl>

        {/* Utemeljitev — AI ali deterministična; jasno ločena od meritev */}
        {rationale && (
          <div className="flex gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <Lightbulb
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary">Zakaj ta pot?</p>
              <p className="mt-0.5 text-sm leading-relaxed text-foreground/85">
                {rationale}
              </p>
            </div>
          </div>
        )}

        {/* Transparentnost — "Kako smo izračunali?" */}
        <Collapsible open={howOpen} onOpenChange={setHowOpen}>
          <CollapsibleTrigger
            className="group flex w-full items-center justify-between rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-expanded={howOpen}
          >
            <span className="inline-flex items-center gap-1.5">
              <HelpCircle className="size-3.5" aria-hidden="true" />
              Kako smo izračunali?
            </span>
            <ChevronDown
              className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180"
              aria-hidden="true"
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
            {metrics.map((m) => (
              <p key={m.key}>
                <span className="font-medium text-foreground/80">
                  {m.label}:
                </span>{" "}
                {m.how}
              </p>
            ))}
            <p className="pt-1 border-t border-border/60">
              Vrednosti so izračunane iz realnih podatkov poti (koordinate,
              cene, tipi destinacij) — niso ocena AI.
            </p>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

export default ItineraryQualityCard;
