"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useLocale } from "next-intl";
import {
  Car,
  ChevronDown,
  Landmark,
  Minus,
  Plus,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { computeItineraryQuality } from "@/lib/itinerary-quality";
import { computeTripDriveCosts } from "@/lib/trip-costs";
import { trackPlannerEvent } from "@/lib/planner-analytics";
import {
  getBudgetGoalSnapshot,
  getServerBudgetGoalSnapshot,
  setBudgetGoal,
  subscribeBudgetGoal,
} from "@/lib/ui-persist";
import type { DriveCosts, Itinerary, PlannerInput } from "@/lib/types";
import { cn } from "@/lib/utils";

// ============================================================================
// PRORAČUNSKI PANEL (F6.2) — stroški načrta + razdelitev na osebo + cilj
// ============================================================================
//
// Primerjalni kontekst (docs/COMPETITIVE-ANALYSIS-MINDTRIP.md): Stippl ima
// budget planner + expense splitting kot jedro; naš odgovor je POŠTENEJŠI:
// stroške izračunamo IZ DEJANSKEGA NAČRTA (vnosi atrakcij + gorivo + vinjeta
// iz F5.3) in odkrito pokažemo, česa ocena NE vključuje (nočitev/hrana) —
// ker načrt teh postavk nima, jih ne izmišljujemo.
//
// Stanje: velikost skupine (lokalno), proračunski cilj (localStorage prek
// useSyncExternalStore — hidracijsko varno; vnos je nekontroliran s key-em
// cilja, da se po nalaganju prikaže persistirana vrednost brez efekta).
// ============================================================================

interface BudgetPanelProps {
  itinerary: Itinerary;
  /** Planner input (za fallback izračun kvalitete) — opcijsko */
  input?: PlannerInput | null;
  variant?: "card" | "section";
  className?: string;
}

/** Minimalen input za computeItineraryQuality (shranjeni načrti brez inputa). */
function fallbackInput(itinerary: Itinerary): PlannerInput {
  return {
    budget: 0,
    days: Array.isArray(itinerary.days) ? itinerary.days.length : 0,
    interests: [],
    season: "summer",
    groupSize: 2,
  };
}

export function BudgetPanel({
  itinerary,
  input,
  variant = "card",
  className,
}: BudgetPanelProps) {
  const locale = useLocale();
  const isEn = locale === "en";

  const quality = useMemo(
    () =>
      itinerary.quality ??
      computeItineraryQuality(itinerary, input ?? fallbackInput(itinerary)),
    [itinerary, input]
  );
  const driveCosts: DriveCosts | null = useMemo(
    () => quality.driveCosts ?? computeTripDriveCosts(itinerary) ?? null,
    [quality, itinerary]
  );

  const attractionsEur = Math.max(0, Math.round(quality.estimatedCost));
  const driveEur = driveCosts ? Math.round(driveCosts.totalEur) : 0;
  const totalEur = attractionsEur + driveEur;

  // Velikost skupine: iz načrta (quality) + uporabnikova prilagoditev
  const defaultGroup = Math.max(1, Math.min(12, quality.groupSize || 2));
  const [groupSize, setGroupSize] = useState(defaultGroup);
  const [howOpen, setHowOpen] = useState(false);

  // Proračunski cilj — persistiran (zunanja shramba, hidracijsko varna)
  const goalValue = useSyncExternalStore(
    subscribeBudgetGoal,
    getBudgetGoalSnapshot,
    getServerBudgetGoalSnapshot
  );
  const [goalDraft, setGoalDraft] = useState<string | null>(null);

  const perPerson =
    groupSize > 0 ? Math.round(totalEur / groupSize) : totalEur;

  const applyGoal = (raw: string) => {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      setBudgetGoal(Math.round(n));
      setGoalDraft(null);
      trackPlannerEvent("budget_goal_set", {
        goal_eur: Math.round(n),
        plan_total_eur: totalEur,
        group_size: groupSize,
      });
    } else {
      setBudgetGoal(null);
      setGoalDraft(null);
    }
  };

  const delta = goalValue !== null ? totalEur - goalValue : null;
  const overBudget = delta !== null && delta > 0;

  // TASK 48 (§12): strežniško izračunan status proračuna iz ZNANIH stroškov —
  // "within" zahteva dokazljive cene (brez "od"/neznanosti), sicer
  // "uncertain" (nikoli "znotraj", česar ne moremo dokazati). Prikazano samo,
  // kadar ga načrt nosi (novi načrti 1.53.0+; stari shranjeni ga nimajo).
  const bv = itinerary.budgetValidation;
  const budgetStatusBlock =
    bv && bv.budget !== null
      ? (() => {
          const numberFmt2 = (n: number) => (isEn ? `€${n}` : `${n} €`);
          if (bv.status === "exceeded") {
            return (
              <div
                className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-300"
                role="status"
              >
                {isEn
                  ? `Known costs (${numberFmt2(bv.knownTotal)}) already exceed your trip budget of ${numberFmt2(bv.budget as number)}.`
                  : `Znani stroški (${numberFmt2(bv.knownTotal)}) že presegajo proračun potovanja ${numberFmt2(bv.budget as number)}.`}
              </div>
            );
          }
          if (bv.status === "within") {
            return (
              <div
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300"
                role="status"
              >
                {isEn
                  ? `Within budget: all planned costs are verified — ${numberFmt2(bv.knownTotal)} of ${numberFmt2(bv.budget as number)}.`
                  : `Znotraj proračuna: vsi načrtovani stroški so preverjeni — ${numberFmt2(bv.knownTotal)} od ${numberFmt2(bv.budget as number)}.`}
              </div>
            );
          }
          const reason =
            bv.fromPriceCount > 0 && bv.unknownCostStops > 0
              ? isEn
                ? `${bv.fromPriceCount} "from" price(s) and ${bv.unknownCostStops} stop(s) without a verified price`
                : `${bv.fromPriceCount} „od“ cena/e in ${bv.unknownCostStops} postankov brez preverjene cene`
              : bv.fromPriceCount > 0
                ? isEn
                  ? `${bv.fromPriceCount} "from" price(s) — the final total may be higher`
                  : `${bv.fromPriceCount} „od“ cena/e — končni znesek je lahko višji`
                : isEn
                  ? `${bv.unknownCostStops} stop(s) without a verified price`
                  : `${bv.unknownCostStops} postankov brez preverjene cene`;
          return (
            <div
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
              role="status"
            >
              {isEn
                ? `Known costs so far: ${numberFmt2(bv.knownTotal)} of ${numberFmt2(bv.budget as number)} — the final total is not fully provable (${reason}).`
                : `Znani stroški doslej: ${numberFmt2(bv.knownTotal)} od ${numberFmt2(bv.budget as number)} — končnega zneska ni mogoče v celoti dokazati (${reason}).`}
            </div>
          );
        })()
      : null;

  const title = isEn ? "Trip budget" : "Proračun potovanja";

  const numberFmt = (n: number) => (isEn ? `€${n}` : `${n} €`);

  // --- Vrstice stroškov ---
  const rows = (
    <ul className="space-y-1.5 text-sm">
      <li className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Landmark className="size-3.5" aria-hidden="true" />
          {isEn ? "Activities on the plan" : "Atrakcije na načrtu"}
        </span>
        <span className="font-medium tabular-nums">{numberFmt(attractionsEur)}</span>
      </li>
      {driveCosts && (
        <li className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Car className="size-3.5" aria-hidden="true" />
            {isEn ? "Driving (fuel + vignette)" : "Vožnja (gorivo + vinjeta)"}
          </span>
          <span className="font-medium tabular-nums">{numberFmt(driveEur)}</span>
        </li>
      )}
      <li className="flex items-center justify-between gap-2 border-t border-border/60 pt-1.5">
        <span className="font-semibold">
          {isEn ? "Plan total" : "Skupaj (načrt)"}
        </span>
        <span className="font-bold tabular-nums">{numberFmt(totalEur)}</span>
      </li>
    </ul>
  );

  // --- Razdelitev na osebo ---
  const splitter = (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/50 p-3">
      <div className="flex items-center gap-2">
        <Users className="size-4 text-primary" aria-hidden="true" />
        <span className="text-sm font-medium">
          {isEn ? "Split per person" : "Razdelitev na osebo"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1" role="group" aria-label={isEn ? "Group size" : "Velikost skupine"}>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => setGroupSize((g) => Math.max(1, g - 1))}
            aria-label={isEn ? "Fewer people" : "Manj oseb"}
            disabled={groupSize <= 1}
          >
            <Minus className="size-3.5" />
          </Button>
          <span className="w-8 text-center text-sm font-semibold tabular-nums">
            {groupSize}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => setGroupSize((g) => Math.min(12, g + 1))}
            aria-label={isEn ? "More people" : "Več oseb"}
            disabled={groupSize >= 12}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
        <span className="text-sm">
          <span className="font-bold tabular-nums">{numberFmt(perPerson)}</span>{" "}
          <span className="text-muted-foreground">
            {isEn ? "/ person" : "/ osebo"}
          </span>
        </span>
      </div>
    </div>
  );

  // --- Osebni cilj (nekontroliran vnos; key = persistirana vrednost, da se
  //     po nalaganju iz localStorage prikaže brez efekta) ---
  const goalBlock = (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          key={goalValue === null ? "no-goal" : `goal-${goalValue}`}
          type="number"
          inputMode="numeric"
          min={0}
          max={100000}
          defaultValue={
            goalDraft !== null ? goalDraft : goalValue !== null ? String(goalValue) : ""
          }
          onChange={(e) => setGoalDraft(e.target.value)}
          onBlur={(e) => applyGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          placeholder={isEn ? "Your budget (€)" : "Tvoj proračun (€)"}
          className="w-40"
          aria-label={isEn ? "Your total budget in euros" : "Tvoj skupni proračun v evrih"}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={(e) => {
            const input = e.currentTarget.previousElementSibling as HTMLInputElement | null;
            applyGoal(input?.value ?? "");
          }}
        >
          {isEn ? "Compare" : "Primerjaj"}
        </Button>
      </div>
      {delta !== null && (
        <div
          className={cn(
            "rounded-lg border p-3 text-sm",
            overBudget
              ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
          )}
          role="status"
        >
          {overBudget
            ? isEn
              ? `Plan is €${Math.abs(delta)} over your budget of €${goalValue}.`
              : `Načrt je ${Math.abs(delta)} € nad tvojim proračunom (${goalValue} €).`
            : isEn
              ? `Plan fits — €${Math.abs(delta)} under your budget of €${goalValue}.`
              : `Načrt se izide — ${Math.abs(delta)} € pod tvojim proračunom (${goalValue} €).`}
        </div>
      )}
    </div>
  );

  // --- Iskrena razkrivnost ---
  const howBlock = (
    <Collapsible open={howOpen} onOpenChange={setHowOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform", howOpen && "rotate-180")}
            aria-hidden="true"
          />
          {isEn ? "How was this calculated — and what it does NOT include" : "Kako smo izračunali — in česar NE vključuje"}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
          <p>
            {isEn
              ? "Activities: sum of the per-person cost estimates of every stop on this plan."
              : "Atrakcije: seštevek ocen cene na osebo vseh postankov na tem načrtu."}
          </p>
          {driveCosts && (
            <p>
              {isEn
                ? `Driving: ${driveCosts.km} km × 6.5 l/100 km × €1.60/l + vignette (€${driveCosts.vignetteEur}) — published Slovenian price lists (AMZS/DARS).`
                : `Vožnja: ${driveCosts.km} km × 6,5 l/100 km × 1,60 €/l + vinjeta (${driveCosts.vignetteEur} €) — objavljeni slovenski ceniki (AMZS/DARS).`}
            </p>
          )}
          <p className="font-medium text-foreground/80">
            {isEn
              ? "Not included (the plan contains no such items, so we don't guess): accommodation, meals, shopping."
              : "NI vključeno (načrt teh postavk ne vsebuje, zato ne ugibamo): nočitev, hrana, nakupi."}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );

  const badge = (
    <Badge variant="secondary" className="font-medium">
      {isEn ? "estimate" : "ocena"}
    </Badge>
  );

  const body = (
    <>
      {rows}
      {budgetStatusBlock && <div className="mt-3">{budgetStatusBlock}</div>}
      {splitter}
      {goalBlock}
      {howBlock}
    </>
  );

  if (variant === "section") {
    return (
      <section className={className} aria-label={title}>
        <h2 className="mb-4 flex flex-wrap items-center gap-2 text-xl font-bold sm:text-2xl">
          {title}
          {badge}
        </h2>
        <Card>
          <CardContent className="p-4 sm:p-6">{body}</CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className={className} aria-label={title}>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
            {title}
            {badge}
          </CardTitle>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </section>
  );
}

export default BudgetPanel;
