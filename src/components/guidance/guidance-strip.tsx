"use client";

// ============================================================================
// ISSUE #23 — GUIDANCE STRIP: univerzalni vodeni trak (1.163.0)
// ============================================================================
// "PRAVILEN KONTEKST → KRATKA RAZLAGA → EN GLAVNI NASLEDNJI KORAK" (§4).
// Izrisuje IZKLJUČNO izhod determinističnega jedra (useGuidance →
// selectGuidance) — komponenta nikoli sama ne odloča o stanju (§33: ena
// resnica o "kaj je naslednji korak").
//
// a11y (§29): role="status" + aria-live="polite" (obnovljeno ob spremembi
// stanja), verižni napredek z aria-current, touch targeti ≥ 44 px (h-11),
// dismiss samo za ne-kritična stanja (jedro določa — §40.20).
//
// i18n: ns `guidance` — 6 jezikov (pariteta testno izsiljena).
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { X } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trackPlannerEvent } from "@/lib/planner-analytics";
import { useGuidance } from "@/hooks/use-guidance";
import type { GuidanceAction, GuidanceState } from "@/lib/guidance/types";

const CHAIN_KEYS = ["discover", "plan", "book", "go", "finish"] as const;

function dismissKey(surface: string, state: GuidanceState): string {
  return `dai:guidance-strip:${surface}:${state}`;
}

/** ICU parametri po sporočilu (jedro določi ključ; preslikava je čista). */
function messageParams(
  messageKey: string,
  facts: {
    myTripCount: number;
    savedTripsCount: number;
    nextStopTitle: string | null;
    laterDayStops: number;
    doneToday: number;
    skippedToday: number;
    freeTimeMinutes: number | null;
  },
): Record<string, string | number> {
  switch (messageKey) {
    case "building":
      return { count: facts.myTripCount };
    case "started":
      return { next: facts.nextStopTitle ?? "" };
    case "startedNextDay":
      return { count: facts.laterDayStops };
    case "freeTime":
      return { minutes: facts.freeTimeMinutes ?? 0 };
    case "completed":
      return { done: facts.doneToday, skipped: facts.skippedToday };
    default:
      return {};
  }
}

const ACTION_LABEL_KEYS: Record<GuidanceAction["id"], string> = {
  discover: "actions.discover",
  plan: "actions.plan",
  open_trips: "actions.openTrips",
  book: "actions.book",
  start_trip: "actions.startTrip",
  go_mode: "actions.goMode",
  navigate: "actions.navigate",
  complete_stop: "actions.completeStop",
  free_time: "actions.freeTime",
  recovery: "actions.recovery",
  new_trip: "actions.newTrip",
  ask_discover: "actions.askDiscover",
};

export function GuidanceStrip({
  surface,
  /** Stanja, ki jih ta površina namerno skrije (npr. home pod first-run). */
  hideStates = [],
}: {
  surface: "home" | "hub" | "planner" | "go";
  hideStates?: GuidanceState[];
}) {
  const t = useTranslations("guidance");
  const { guidance, tourActive, endTour } = useGuidance(surface);
  const [dismissedStates, setDismissedStates] = useState<ReadonlySet<GuidanceState>>(new Set());
  const shownRef = useRef<string | null>(null);
  const tourDoneRef = useRef(false);

  // Preberi obstoječe dismissalje ob mountu (session-scoped, §7 —
  // naslednja seja trak ponudi znova: progresivno, ne nadležno).
  // queueMicrotask: setState NI sinhrono v telesu efekta (isti vzorec
  // kot use-wake-lock.ts — react-hooks/set-state-in-effect disciplina).
  useEffect(() => {
    const readDismissed = () => {
      try {
        const found = new Set<GuidanceState>();
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key?.startsWith(`dai:guidance-strip:${surface}:`)) {
            found.add(key.split(":")[3] as GuidanceState);
          }
        }
        setDismissedStates(found);
      } catch {
        // zasebni način — brez pomnjenja (iskrena meja)
      }
    };
    queueMicrotask(readDismissed);
  }, [surface]);

  // guidance_shown — 1× na (seja-komponenta, stanje) brez štetja remountov
  // znotraj istega stanja (ref guard; brez PII — samo ključi).
  useEffect(() => {
    if (!guidance) return;
    if (shownRef.current === guidance.state) return;
    shownRef.current = guidance.state;
    trackPlannerEvent("guidance_shown", {
      state: guidance.state,
      surface,
    });
  }, [guidance, surface]);

  // Vodena pot („Ne vem — pokaži mi") se SAMODEJNO zaključi, ko uporabnik
  // doseže zagon poti (TRIP_STARTED ali višje) — first_run_completed §35.
  useEffect(() => {
    if (!tourActive || !guidance || tourDoneRef.current) return;
    const reached =
      guidance.state === "TRIP_STARTED" ||
      guidance.state === "COMPLETED" ||
      ["NAVIGATING", "ARRIVED", "FREE_TIME", "NEEDS_ATTENTION", "BLOCKED", "RECOVERY"].includes(
        guidance.state,
      );
    if (reached) {
      tourDoneRef.current = true;
      trackPlannerEvent("first_run_completed", {});
      endTour();
    }
  }, [tourActive, guidance, endTour]);

  if (!guidance || hideStates.includes(guidance.state)) return null;
  if (dismissedStates.has(guidance.state)) return null;

  const params = messageParams(guidance.messageKey, guidance.facts);
  const chain = guidance.chain;

  const handleAction = (action: GuidanceAction) => {
    trackPlannerEvent("guidance_action_clicked", {
      state: guidance.state,
      surface,
      action: action.id,
    });
  };

  const handleDismiss = () => {
    trackPlannerEvent("guidance_dismissed", {
      state: guidance.state,
      surface,
    });
    if (guidance.dismissible) {
      try {
        sessionStorage.setItem(dismissKey(surface, guidance.state), "1");
      } catch {
        // zasebni način — velja samo za trenutni prikaz
      }
      setDismissedStates((prev) => new Set(prev).add(guidance.state));
    }
  };

  return (
    <Card
      className={
        tourActive
          ? "border-emerald-500 ring-1 ring-emerald-500/40"
          : "border-muted-foreground/25"
      }
      role="status"
      aria-live="polite"
      data-testid="guidance-strip"
      data-guidance-state={guidance.state}
    >
      <CardContent className="space-y-3 p-4 sm:p-5">
        {/* Veriga ODKRIJ → NAČRTUJ → REZERVIRAJ → NA POTI → ZAKLJUČI (§13) */}
        <div className="flex items-center gap-1.5" aria-label={t("chain.label")}>
          {CHAIN_KEYS.map((step, i) => {
            const isCurrent = chain.current === step;
            const isPast = i + 1 < chain.index;
            return (
              <span key={step} className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    isCurrent
                      ? "bg-primary text-primary-foreground"
                      : isPast
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <span aria-hidden="true">{isPast ? "✓" : i + 1}</span>
                  <span className="hidden sm:inline">{t(`chain.${step}`)}</span>
                  <span className="sr-only sm:hidden">{t(`chain.${step}`)}</span>
                </span>
                {i < CHAIN_KEYS.length - 1 && (
                  <span aria-hidden="true" className="h-px w-2 bg-muted-foreground/30 sm:w-3" />
                )}
              </span>
            );
          })}
          <span className="sr-only">
            {t("a11y.stepOf", { index: chain.index, total: chain.total })}
          </span>
        </div>

        {/* Vodena pot (tour) oznaka */}
        {tourActive && (
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            <span aria-hidden="true">🧭</span> {t("tour.badge")}
          </p>
        )}

        {/* ENA kratka razlaga (sporočilo jedra — nikoli hardcodeano) */}
        <p className="text-sm font-medium leading-relaxed">
          {t(`msg.${guidance.messageKey}`, params)}
        </p>
        {tourActive && <p className="text-xs text-muted-foreground">{t("tour.hint")}</p>}

        {/* ENA primarna akcija + relevantne sekundarne (§10/§20) */}
        <div className="flex flex-wrap items-center gap-2">
          {guidance.primaryAction && (
            <Button asChild size="default" className="h-11" onClick={() => handleAction(guidance.primaryAction!)}>
              <Link href={guidance.primaryAction.href ?? "#"}>
                {t(ACTION_LABEL_KEYS[guidance.primaryAction.id])}
              </Link>
            </Button>
          )}
          {guidance.secondaryActions.map((action) => (
            <Button
              key={action.id}
              asChild
              variant="outline"
              size="default"
              className="h-11"
              onClick={() => handleAction(action)}
            >
              <Link href={action.href ?? "#"}>{t(ACTION_LABEL_KEYS[action.id])}</Link>
            </Button>
          ))}
          {guidance.dismissible && (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-11 w-11"
              aria-label={t("a11y.dismiss")}
              onClick={handleDismiss}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
