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
// ISSUE #24 Sklop 8 (1.170.0): 6-jezična besedila (faza 2).
import { GL, GFn, type GoLang } from "@/lib/journey/go-lang";

export interface TripCompleteProps {
  lang: GoLang;
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
  title: {
    sl: "POT ZAKLJUČENA",
    en: "TRIP COMPLETE",
    it: "VIAGGIO COMPLETATO",
    de: "REISE ABGESCHLOSSEN",
    fr: "VOYAGE TERMINÉ",
    es: "VIAJE COMPLETADO",
  } as const,
  heading: {
    sl: "Vsi postanki so opravljeni — čestitamo! 🎉",
    en: "All stops are done — congratulations! 🎉",
    it: "Tutte le tappe sono completate — complimenti! 🎉",
    de: "Alle Stationen sind erledigt — Glückwunsch! 🎉",
    fr: "Tous les arrêts sont terminés — félicitations ! 🎉",
    es: "Todas las paradas están completadas — ¡enhorabuena! 🎉",
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
    it: (d: number, done: number, skipped: number) =>
      `${d} ${d === 1 ? "giorno" : "giorni"} · ${done} completate${
        skipped > 0 ? ` · ${skipped} saltate` : ""
      }`,
    de: (d: number, done: number, skipped: number) =>
      `${d} ${d === 1 ? "Tag" : "Tage"} · ${done} erledigt${
        skipped > 0 ? ` · ${skipped} übersprungen` : ""
      }`,
    fr: (d: number, done: number, skipped: number) =>
      `${d} ${d === 1 ? "jour" : "jours"} · ${done} terminés${
        skipped > 0 ? ` · ${skipped} passés` : ""
      }`,
    es: (d: number, done: number, skipped: number) =>
      `${d} ${d === 1 ? "día" : "días"} · ${done} completadas${
        skipped > 0 ? ` · ${skipped} omitidas` : ""
      }`,
  } as const,
  next: {
    sl: "Kaj zdaj? Poglej svojo pot, jo deli s prijatelji ali načrtuj novo.",
    en: "What now? Review your trip, share it with friends or plan a new one.",
    it: "E adesso? Rivedi il tuo viaggio, condividilo con gli amici o pianifica il prossimo.",
    de: "Was nun? Sieh dir deine Reise an, teile sie mit Freunden oder plane eine neue.",
    fr: "Et maintenant ? Revois ton voyage, partage-le avec tes amis ou planifie-en un nouveau.",
    es: "¿Y ahora? Repasa tu viaje, compártelo con amigos o planifica uno nuevo.",
  } as const,
  openTrip: {
    sl: "Odpri shranjeno pot",
    en: "Open saved trip",
    it: "Apri il viaggio salvato",
    de: "Gespeicherte Reise öffnen",
    fr: "Ouvrir le voyage enregistré",
    es: "Abrir el viaje guardado",
  } as const,
  myTravels: {
    sl: "Moja potovanja",
    en: "My travels",
    it: "I miei viaggi",
    de: "Meine Reisen",
    fr: "Mes voyages",
    es: "Mis viajes",
  } as const,
  newTrip: {
    sl: "Načrtuj novo pot",
    en: "Plan a new trip",
    it: "Pianifica un nuovo viaggio",
    de: "Eine neue Reise planen",
    fr: "Planifier un nouveau voyage",
    es: "Planificar un nuevo viaje",
  } as const,
} as const;

export function TripComplete({
  lang,
  days,
  doneTotal,
  skippedTotal,
  savedTripHref,
}: TripCompleteProps) {
  const t = (o: { sl: string; en: string; it?: string; de?: string; fr?: string; es?: string }) =>
    GL(lang, o);

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
              {GFn(lang, L.stats)(days, doneTotal, skippedTotal)}
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
