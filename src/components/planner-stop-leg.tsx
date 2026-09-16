import { Car } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  DESTINATION_COORDS,
  heuristicLeg,
  legKey,
} from "@/lib/road-routing";
import type { Itinerary, LocationVisit } from "@/lib/types";

interface PlannerStopLegProps {
  from: LocationVisit;
  to: LocationVisit;
  /**
   * UI sprint (točka D smeri): cestne noge, serializirane iz strežniškega
   * indeksa (OSRM, kjer je na voljo). Stari načrti brez polja → hevristika
   * (ista formula kot fallback geo-validacije: premica × 1,3 ÷ 55 km/h).
   */
  legs?: Itinerary["legs"];
}

/**
 * UI sprint — "premik med postanki": vizualni povezovalnik med zaporednima
 * postankoma dneva ("🚗 ~X km · ~Y min"). Povezuje časovni trak z zemljevidom
 * — številke PRIHAJAJO iz istega vira kot značke ~km dni (geo-validacija),
 * zato se povezovalniki seštevajo v dnevni kilometri. Vedno z "~" (ocena).
 */
export function PlannerStopLeg({ from, to, legs }: PlannerStopLegProps) {
  const t = useTranslations("planner");

  const a = DESTINATION_COORDS.get(from.destination_id);
  const b = DESTINATION_COORDS.get(to.destination_id);
  // Neznani ID-ji (izven dataseta) — brez lažnega povezovalnika
  if (!a || !b) return null;

  const leg =
    legs?.[legKey(from.destination_id, to.destination_id)] ??
    heuristicLeg(a, b);

  return (
    <div className="flex items-center gap-2 py-1">
      <span
        className="h-px flex-1 border-t border-dashed border-border/70"
        aria-hidden="true"
      />
      <p
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground"
        aria-label={t("legAria", {
          from: from.destination_name,
          to: to.destination_name,
          km: leg.km,
          min: leg.min,
        })}
      >
        <Car className="size-3.5 shrink-0" aria-hidden="true" />
        ~{leg.km} km · ~{leg.min} min
      </p>
      <span
        className="h-px flex-1 border-t border-dashed border-border/70"
        aria-hidden="true"
      />
    </div>
  );
}
