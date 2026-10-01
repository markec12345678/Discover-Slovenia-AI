"use client";

// ============================================================================
// ISSUE #23 §9/§13 — TRIP COMPLETE: terminalno stanje Go Mode (1.163.0)
// ============================================================================
// Revizija Faze A je odkrila NAJVEČJO VRZEL verige: ko je zadnji postanek
// zadnjega dne opravljen, je Go Mode do zdaj pokazal samo golo „ni več
// postankov" (GO_LABELS.noEntryLeft). To je bil konec zlate poti BREZ
// zaključka — brez povzetka, brez priložnosti za deljenje/dnevnik/novo pot.
//
// Ta komponenta nadomesti tisto sporočilo SAMO, ko je resnično KONEC POTI
// (remaining 0 + kasnejši dnevi 0 + 1+ obdelanih) — dan z nadaljnjimi dnevi
// še vedno pokaže obstoječe iskreno sporočilo (zero feature loss).
//
// Besedila: {sl, en} L-canon (iskrena meja /na-poti — enaka kot ves Go Mode).
// a11y: role="status" (politen announce), gumbi h-11 (≥ 44 px).
// ============================================================================

import { PartyPopper } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trackPlannerEvent } from "@/lib/planner-analytics";

export interface TripCompleteProps {
  lang: "sl" | "en";
  /** Skupno število dni poti. */
  days: number;
  /** Opravljeni postanki CELE poti (vsota vseh dni). */
  doneTotal: number;
  /** Preskočeni postanki celega potovanja. */
  skippedTotal: number;
  /** Povezava na shranjeno pot (v2) — brez nje iskreno izpustimo gumb. */
  savedTripHref?: string | null;
}

const L = {
  title: { sl: "POT ZAKLJUČENA", en: "TRIP COMPLETE" } as const,
  heading: {
    sl: "Vsi postanki so opravljeni — čestitamo! 🎉",
    en: "All stops are done — congratulations! 🎉",
  } as const,
  stats: {
    sl: (d: number, done: number, skipped: number) =>
      `${d} ${d === 1 ? "dan" : "dni"} · ${done} opravljenih${
        skipped > 0 ? ` · ${skipped} preskočenih` : ""
      }`,
    en: (d: number, done: number, skipped: number) =>
      `${d} ${d === 1 ? "day" : "days"} · ${done} completed${
        skipped > 0 ? ` · ${skipped} skipped` : ""
      }`,
  } as const,
  next: {
    sl: "Kaj zdaj? Poglej svojo pot, jo deli s prijatelji ali načrtuj novo.",
    en: "What now? Review your trip, share it with friends or plan a new one.",
  } as const,
  openTrip: { sl: "Odpri shranjeno pot", en: "Open saved trip" } as const,
  myTravels: { sl: "Moja potovanja", en: "My travels" } as const,
  newTrip: { sl: "Načrtuj novo pot", en: "Plan a new trip" } as const,
} as const;

export function TripComplete({
  lang,
  days,
  doneTotal,
  skippedTotal,
  savedTripHref,
}: TripCompleteProps) {
  const t = (o: { sl: string; en: string }) => o[lang];

  return (
    <Card
      id="pot-zakljucena"
      className="border-emerald-500 ring-1 ring-emerald-500/50"
      role="status"
      data-testid="trip-complete"
    >
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <PartyPopper
            className="mt-1 h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              {t(L.title)}
            </p>
            <p className="text-sm font-medium leading-relaxed">{t(L.heading)}</p>
            <p className="text-sm text-muted-foreground">
              {lang === "sl"
                ? L.stats.sl(days, doneTotal, skippedTotal)
                : L.stats.en(days, doneTotal, skippedTotal)}
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">{t(L.next)}</p>

        <div className="flex flex-wrap items-center gap-2">
          {savedTripHref && (
            <Button
              asChild
              size="default"
              className="h-11"
              onClick={() =>
                trackPlannerEvent("guidance_action_clicked", {
                  state: "COMPLETED",
                  surface: "go",
                  action: "open_trips",
                })
              }
            >
              <Link href={savedTripHref}>{t(L.openTrip)}</Link>
            </Button>
          )}
          <Button
            asChild
            variant="outline"
            size="default"
            className="h-11"
            onClick={() =>
              trackPlannerEvent("guidance_action_clicked", {
                state: "COMPLETED",
                surface: "go",
                action: "open_trips",
              })
            }
          >
            <Link href="/moja-potovanja">{t(L.myTravels)}</Link>
          </Button>
          <Button
            asChild
            variant={savedTripHref ? "outline" : "default"}
            size="default"
            className="h-11"
            onClick={() =>
              trackPlannerEvent("guidance_action_clicked", {
                state: "COMPLETED",
                surface: "go",
                action: "new_trip",
              })
            }
          >
            <Link href="/nacrtuj">{t(L.newTrip)}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
