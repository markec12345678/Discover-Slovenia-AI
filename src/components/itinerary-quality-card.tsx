"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import {
  Car,
  ChevronDown,
  Euro,
  Fuel,
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
import { INTEREST_LABELS_EN } from "@/lib/stop-insights";
import {
  computeTripDriveCosts,
  FUEL_CONSUMPTION_L_PER_100,
  FUEL_PRICE_EUR_PER_L,
} from "@/lib/trip-costs";
import type { DriveCosts, Itinerary, PlannerInput } from "@/lib/types";
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
  const locale = useLocale();
  const isEn = locale === "en";

  // Metrike: shranjene (API) ali izračunane na mestu uporabe (stari načrti) —
  // ista čista funkcija, enak rezultat.
  const quality = useMemo(
    () => itinerary.quality ?? computeItineraryQuality(itinerary, input),
    [itinerary, input]
  );

  // F5.3: stroški vožnje ( gorivo + e-vinjeta) — shranjeno ali izračun na
  // mestu uporabe ( ISTA čista funkcija kot v API); null → brez vrstice
  // ( ne izmišljujemo, če koordinate niso znane).
  const driveCosts: DriveCosts | null = useMemo(
    () => quality.driveCosts ?? computeTripDriveCosts(itinerary) ?? null,
    [quality, itinerary]
  );

  // Utemeljitev: AI (sanitizirana) ali deterministična sestava; za stare
  // načrte brez rationale pade na prazno (ne izmišljujemo).
  const rationale = typeof itinerary.rationale === "string" ? itinerary.rationale : null;

  // Vrstica "3 dni · 2 osebi · narava + hrana" (F15: EN različica)
  const metaParts = [
    `${quality.days} ${
      isEn
        ? quality.days === 1 ? "day" : "days"
        : quality.days === 1 ? "dan" : quality.days === 2 ? "dneva" : "dni"
    }`,
    `${quality.groupSize} ${
      isEn
        ? quality.groupSize === 1 ? "person" : "people"
        : quality.groupSize === 1 ? "oseba" : quality.groupSize === 2 ? "osebi" : "oseb"
    }`,
  ];
  // Interesi v meta vrstici: SL kanonične vrednosti → EN preslikava
  // (F15: prej je EN stran kazala surove ključe "narava + kultura")
  const interestPreview = (isEn
    ? input.interests.slice(0, 3).map((i) => INTEREST_LABELS_EN[i] ?? i)
    : input.interests.slice(0, 3)
  ).join(" + ");
  if (interestPreview) metaParts.push(interestPreview);

  // F15: vrednost tempa je shranjena kot SL oznaka (TempoLabel) — na EN
  // strani jo preslikamo (obstoječa vrzel, vidna zdaj, ko je tempo izbira)
  const tempoValue = isEn
    ? quality.tempo === "Miren"
      ? "Relaxed"
      : quality.tempo === "Umirjen"
        ? "Balanced"
        : "Full"
    : quality.tempo;

  const metrics: MetricDef[] = [
    {
      key: "driving",
      label: isEn ? "Driving" : "Vožnja",
      value: formatDrivingMinutes(quality.drivingMinutes),
      icon: Car,
      // F5.6 (road routing): razkritje metode — realne ceste (OSRM) ali
      // hevristika (haversine × 1,3); nikoli ne pretvarjamo, da je ocena
      // realna cesta (in obratno).
      how:
        quality.routingMethod === "osrm"
          ? isEn
            ? "Sum of actual road distances and drive times between consecutive stops (OSRM / OpenStreetMap)."
            : "Seštevek realnih cestnih razdalj in časov vožnje med zaporednimi postanki (OSRM / OpenStreetMap)."
          : quality.routingMethod === "mixed"
            ? isEn
              ? "Mostly actual road distances (OSRM / OpenStreetMap); some legs without road data use a straight-line estimate (× 1.3, 55 km/h)."
              : "Večinoma realne cestne razdalje (OSRM / OpenStreetMap); noge brez cestnih podatkov so ocenjene po premici (× 1,3, 55 km/h)."
            : isEn
              ? "Sum of straight-line distances between consecutive stops (× 1.3 for actual roads, 55 km/h average)."
              : "Seštevek cestnih razdalj (geografske koordinate × 1,3 za dejanske ceste, povprečje 55 km/h) med zaporednimi lokacijami na poti.",
      neutral: true,
    },
    {
      key: "cost",
      label: isEn ? "Est. cost" : "Predviden strošek",
      value: `${quality.budgetTier}`,
      icon: Euro,
      how: isEn
        ? `Sum of all location prices on the route (≈ €${Math.round(quality.estimatedCost)}${input.budget ? ` of €${input.budget} budget` : ""}) — €€€ means above €160 per person per day.`
        : `Seštevek cen vseh lokacij na poti (≈ €${Math.round(quality.estimatedCost)}${input.budget ? ` od ${input.budget} € proračuna` : ""}) — €€€ pomeni nad 160 € na osebo na dan.`,
      neutral: true,
    },
    {
      key: "tempo",
      label: isEn ? "Pace" : "Tempo",
      value: tempoValue,
      icon: Gauge,
      how: isEn
        ? "Average stops per day: up to 2 = relaxed, 3 = balanced, 4 or more = a full schedule."
        : "Povprečno število obiskov na dan: do 2 = miren, 3 = umirjen, 4 ali več = poln program.",
      neutral: true,
    },
    {
      key: "nature",
      label: isEn ? "Nature" : "Narava",
      value: `${quality.natureScore}/5`,
      icon: Trees,
      how: isEn
        ? "Share of natural destinations on the route (lakes, mountains, rivers, caves, gorges, coast) among all visits."
        : "Delež naravnih destinacij na poti (jezerske, gorske, rečne, jame, soteske, obala) med vsemi obiskanimi.",
    },
    {
      key: "food",
      label: isEn ? "Food" : "Hrana",
      value: `${quality.foodScore}/5`,
      icon: Wine,
      how: isEn
        ? "Combination of the traveller's culinary wishes and the restaurants/inns/wine bars the route includes."
        : "Kombinacija kulinaričnih želja potnika in restavracij/gostiln/vinotek, ki jih pot vključuje.",
    },
  ];

  // F5.3: vinjeta — veljavnost po dolžini potovanja ( oznaka lokalizirana)
  const vignetteLabel =
    driveCosts == null
      ? ""
      : isEn
        ? driveCosts.vignetteDays === 1
          ? "1-day"
          : driveCosts.vignetteDays === 10
            ? "10-day"
            : driveCosts.vignetteDays === 62
              ? "2-month"
              : "annual"
        : driveCosts.vignetteDays === 1
          ? "1-dnevna"
          : driveCosts.vignetteDays === 10
            ? "10-dnevna"
            : driveCosts.vignetteDays === 62
              ? "dvomesečna"
              : "letna";

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="space-y-4 p-4 sm:p-5">
        {/* Glava — "Tvoja pot" + meta vrstica */}
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {isEn ? "Your trip" : "Tvoja pot"}
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

          {/* F5.3 (primerjalna analiza MindTrip): STROŠKI VOŽNJE — gorivo +
              e-vinjeta. Ocena, ne rezervacija: vsaka predpostavka je razkrita
              v "Kako smo izračunali" ( viri AMZS/DARS, regulirana cena goriva).
              Prikazano ločeno od vnosev atrakcij ( ki ostanejo v "Predvidenem
              strošku") — mešanje obeh bi zavajalo. */}
          {driveCosts && (
            <div className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Fuel className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate">
                  {isEn ? "Fuel + motorway vignette" : "Gorivo + avtocestna vinjeta"}
                </span>
              </dt>
              <dd className="mt-1 flex items-baseline gap-1.5 text-sm font-semibold">
                ≈ {driveCosts.totalEur} €
                <span className="text-[11px] font-normal text-muted-foreground">
                  ({isEn
                    ? `fuel ${driveCosts.fuelEur} € + ${vignetteLabel} vignette ${driveCosts.vignetteEur} €`
                    : `gorivo ${driveCosts.fuelEur} € + ${vignetteLabel} vinjeta ${driveCosts.vignetteEur} €`})
                </span>
              </dd>
            </div>
          )}
        </dl>

        {/* Utemeljitev — AI ali deterministična; jasno ločena od meritev */}
        {rationale && (
          <div className="flex gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <Lightbulb
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary">
                {isEn ? "Why this route?" : "Zakaj ta pot?"}
              </p>
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
              {isEn ? "How did we compute this?" : "Kako smo izračunali?"}
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
            {driveCosts && (
              <p>
                <span className="font-medium text-foreground/80">
                  {isEn ? "Fuel + vignette" : "Gorivo + vinjeta"}:
                </span>{" "}
                {isEn ? (
                  <>
                    ≈ {driveCosts.km} km of driving
                    {quality.routingMethod === "osrm"
                      ? " on actual roads (OSRM/OpenStreetMap)"
                      : quality.routingMethod === "mixed"
                        ? " (mostly actual roads, OSRM)"
                        : ""}{" "}
                    × {FUEL_CONSUMPTION_L_PER_100} l/100 km
                    × {FUEL_PRICE_EUR_PER_L.toFixed(2)} €/l (regulated NMB-95
                    price band, gov.si/AMZS) ≈ {driveCosts.fuelEur} €. E-vignette
                    for vehicles up to 3.5 t: {vignetteLabel} {driveCosts.vignetteEur} €
                    (DARS/AMZS price list, valid for the whole trip length of{" "}
                    {driveCosts.vignetteDays === 1
                      ? "1 day"
                      : `${driveCosts.vignetteDays === 62 ? "up to 2 months" : driveCosts.vignetteDays === 365 ? "a year" : "up to 10 days"}`}
                    ). The vignette is only needed if you use motorways — local
                    roads are free and usually only minutes slower. Verify
                    current prices at evinjeta.dars.si before buying.
                  </>
                ) : (
                  <>
                    ≈ {driveCosts.km} km vožnje
                    {quality.routingMethod === "osrm"
                      ? " po realnih cestah (OSRM/OpenStreetMap)"
                      : quality.routingMethod === "mixed"
                        ? " (večinoma realne ceste, OSRM)"
                        : ""}{" "}
                    × {FUEL_CONSUMPTION_L_PER_100} l/100 km
                    × {FUEL_PRICE_EUR_PER_L.toFixed(2)} €/l ( regulirana cena
                    NMB-95, pas gov.si/AMZS) ≈ {driveCosts.fuelEur} €. E-vinjeta
                    za vozila do 3,5 t: {vignetteLabel} {driveCosts.vignetteEur} €
                    ( cenik DARS/AMZS; pokriva {driveCosts.vignetteDays === 1
                      ? "1 dan potovanja"
                      : driveCosts.vignetteDays === 10
                        ? "do 10 dni potovanja"
                        : driveCosts.vignetteDays === 62
                          ? "do 2 meseca potovanja"
                          : "celo leto"}
                    ). Vinjeta je potrebna LE ob vožnji po avtocestah —
                    obcestne ceste so brezplačne in običajno le nekaj minut
                    počasnejše. Pred nakupom preveri aktualne cene na
                    evinjeta.dars.si.
                  </>
                )}
              </p>
            )}
            <p className="pt-1 border-t border-border/60">
              {isEn
                ? "Values are computed from real trip data (coordinates, prices, destination types) — not AI guesses."
                : "Vrednosti so izračunane iz realnih podatkov poti (koordinate, cene, tipi destinacij) — niso ocena AI."}
            </p>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

export default ItineraryQualityCard;
