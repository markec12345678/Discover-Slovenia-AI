"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Send,
  Loader2,
  History,
  ChevronDown,
  ChevronUp,
  Wand2,
  Calendar,
  CarFront,
  CloudRain,
  Leaf,
  UtensilsCrossed,
  UsersRound,
  Gauge,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import type { Itinerary, PlannerInput, RefineChange } from "@/lib/types";
import { QUICK_ACTIONS } from "@/lib/refine-actions";
import { PL, type PlannerLang } from "@/lib/planner-lang";
import {
  trackPlannerEvent,
  markResultEngaged,
} from "@/lib/planner-analytics";

/** W1-2b-2: jezik UI — 4-smerno iz locale (neznano → SL).
 *  W12-faza-2b: 6-smerno — /fr+/es/nacrtuj sta javni planner ploskvi. */
const langOf = (locale: string): PlannerLang =>
  locale === "en" ||
  locale === "it" ||
  locale === "de" ||
  locale === "fr" ||
  locale === "es"
    ? locale
    : "sl";

interface ItineraryRefinerProps {
  itinerary: Itinerary;
  formData: PlannerInput;
  onRefined: (newItinerary: Itinerary) => void;
  /**
   * TASK 4 / K-9 (UX FIX PASS): skrij podvojene hitre akcije v railu, ko je
   * PRIMARNA kontrolna vrstica (PlannerAiControls — Issue #3 §3) vidna v
   * delovni površini. Živi dokaz revizije: 6 čipov + vnos sta se POJAVILA
   * DVAKRAT (a11y inventar: 26 kontrol) — HIDE ≠ DELETE: rail obdrži
   * ZGODOVINO + prosti ukaz (globlja, večturna izkušnja); dnevni čipi so
   * na enem mestu (delovna vrstica z vidnimi oznakami obsega, K-8).
   * Opcijsko: false (privzeto) ohrani dosedanji izgled za ostale klice.
   */
  hideQuickActions?: boolean;
}

interface HistoryEntry {
  instruction: string;
  timestamp: number;
  source: string;
}

// FAZA 4-2 — večjezične oznake (prej komponenta trdo kodirana SL, EN
// uporabniki so videli slovenščino; W1-2b-2: tudi IT/DE;
// W12-faza-2b: tudi FR/ES)
const L = {
  title: { sl: "Prilagodi itinerer", en: "Adjust the itinerary", it: "Adatta l'itinerario", de: "Reiseplan anpassen", fr: "Ajuster l'itinéraire", es: "Ajustar el itinerario" },
  subtitle: {
    sl: "Opiši spremembo ali uporabi hitro akcijo za posamezen dan",
    en: "Describe a change or use a quick action for a specific day",
    it: "Descrivi una modifica o usa un'azione rapida per un giorno specifico",
    de: "Beschreibe eine Änderung oder nutze eine Schnellaktion für einen bestimmten Tag",
    fr: "Décris un changement ou utilise une action rapide pour un jour précis",
    es: "Describe un cambio o usa una acción rápida para un día concreto",
  },
  history: { sl: "Zgodovina sprememb", en: "Change history", it: "Cronologia delle modifiche", de: "Änderungshistorie", fr: "Historique des modifications", es: "Historial de cambios" },
  inputLabel: {
    sl: "Ukaz za prilagoditev itinererja",
    en: "Instruction for adjusting the itinerary",
    it: "Istruzione per adattare l'itinerario",
    de: "Anweisung zum Anpassen des Reiseplans",
    fr: "Instruction pour ajuster l'itinéraire",
    es: "Instrucción para ajustar el itinerario",
  },
  inputPlaceholder: {
    sl: "npr. Dodaj več pohodov v naravo",
    en: "e.g. Add more hikes in nature",
    it: "es. Aggiungi più escursioni nella natura",
    de: "z. B. Mehr Wanderungen in der Natur",
    fr: "ex. Ajoute plus de randonnées en nature",
    es: "ej. Añade más senderismo en la naturaleza",
  },
  send: { sl: "Pošlji ukaz", en: "Send instruction", it: "Invia istruzione", de: "Anweisung senden", fr: "Envoyer l'instruction", es: "Enviar instrucción" },
  loading: {
    sl: "Prilagajam itinerer …",
    en: "Adjusting the itinerary …",
    it: "Adatto l'itinerario …",
    de: "Passe den Reiseplan an …",
    fr: "J'ajuste l'itinéraire …",
    es: "Ajustando el itinerario …",
  },
  // TASK 4 / K-4: IZHOD iz dolgega refine klica — Prekliči + števec (isti
  // kanon kot PlannerAiControls / generacija TASK 77).
  cancel: { sl: "Prekliči", en: "Cancel", it: "Annulla", de: "Abbrechen", fr: "Annuler", es: "Cancelar" },
  seconds: { sl: "s", en: "s", it: "s", de: "s", fr: "s", es: "s" },
  loadingSlowHint: {
    sl: "AI lahko potrebuje do ~60 s — lahko prekličeš.",
    en: "AI can take up to ~60 s — you can cancel.",
    it: "L'AI può richiedere fino a ~60 s — puoi annullare.",
    de: "Die KI kann bis zu ~60 s brauchen — du kannst abbrechen.",
    fr: "L'IA peut prendre jusqu'à ~60 s — tu peux annuler.",
    es: "La IA puede tardar hasta ~60 s — puedes cancelar.",
  },
  toastCancelled: {
    sl: "Prilagoditev preklicana — načrt ni spremenjen",
    en: "Adjustment cancelled — itinerary unchanged",
    it: "Modifica annullata — itinerario invariato",
    de: "Anpassung abgebrochen — Reiseplan unverändert",
    fr: "Ajustement annulé — l'itinéraire est inchangé",
    es: "Ajuste cancelado — el itinerario no ha cambiado",
  },
  toastTimeout: {
    sl: "Prilagoditev je trajala predolgo — poskusi znova",
    en: "The adjustment took too long — try again",
    it: "La modifica ha richiesto troppo tempo — riprova",
    de: "Die Anpassung hat zu lange gedauert — versuche es erneut",
    fr: "L'ajustement a pris trop de temps — réessaie",
    es: "El ajuste ha tardado demasiado — inténtalo de nuevo",
  },
  adjustDay: { sl: "Prilagodi ta dan", en: "Adjust this day", it: "Adatta questo giorno", de: "Diesen Tag anpassen", fr: "Ajuster ce jour", es: "Ajustar este día" },
  day: { sl: "Dan", en: "Day", it: "Giorno", de: "Tag", fr: "Jour", es: "Día" },
  dayPlaceholder: { sl: "izberi dan", en: "pick a day", it: "scegli un giorno", de: "Tag wählen", fr: "choisis un jour", es: "elige un día" },
  quickActionsHint: {
    sl: "Hitre akcije delujejo tudi brez AI (deterministično)",
    en: "Quick actions also work without AI (deterministic)",
    it: "Le azioni rapide funzionano anche senza AI (deterministico)",
    de: "Schnellaktionen funktionieren auch ohne KI (deterministisch)",
    fr: "Les actions rapides fonctionnent aussi sans IA (déterministe)",
    es: "Las acciones rápidas también funcionan sin IA (determinista)",
  },
  toastUpdated: { sl: "Itinerer posodobljen!", en: "Itinerary updated!", it: "Itinerario aggiornato!", de: "Reiseplan aktualisiert!", fr: "Itinéraire mis à jour !", es: "¡Itinerario actualizado!" },
  toastUpdatedDesc: {
    sl: (i: string) => `Upoštevano: "${i}"`,
    en: (i: string) => `Applied: "${i}"`,
    it: (i: string) => `Applicato: "${i}"`,
    de: (i: string) => `Angewendet: "${i}"`,
    fr: (i: string) => `Appliqué : « ${i} »`,
    es: (i: string) => `Aplicado: «${i}»`,
  },
  toastPartial: { sl: "Delna posodobitev", en: "Partial update", it: "Aggiornamento parziale", de: "Teilweise aktualisiert", fr: "Mise à jour partielle", es: "Actualización parcial" },
  toastStillFailing: {
    sl: "Posodobljeno — a dan še vedno ni izvedljiv",
    en: "Updated — but the day is still not doable",
    it: "Aggiornato — ma il giorno non è ancora fattibile",
    de: "Aktualisiert — aber der Tag ist noch nicht machbar",
    fr: "Mis à jour — mais le jour n'est toujours pas faisable",
    es: "Actualizado — pero el día sigue sin ser viable",
  },
  toastFailed: { sl: "Posodobitev ni uspela", en: "Update failed", it: "Aggiornamento non riuscito", de: "Aktualisierung fehlgeschlagen", fr: "Échec de la mise à jour", es: "Error al actualizar" },
  toastFailedDesc: {
    sl: "Napaka pri posodobitvi",
    en: "Error while updating",
    it: "Errore durante l'aggiornamento",
    de: "Fehler beim Aktualisieren",
    fr: "Erreur lors de la mise à jour",
    es: "Error al actualizar",
  },
  toastQuickNoChange: {
    sl: "Ni sprememb",
    en: "No changes",
    it: "Nessuna modifica",
    de: "Keine Änderungen",
    fr: "Aucun changement",
    es: "Sin cambios",
  },
  errorGeneric: {
    sl: "Napaka pri posodobitvi",
    en: "Error while updating",
    it: "Errore durante l'aggiornamento",
    de: "Fehler beim Aktualisieren",
    fr: "Erreur lors de la mise à jour",
    es: "Error al actualizar",
  },
} as const;

/** Ikona hitre akcije. */
const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  less_driving: CarFront,
  rain_suitable: CloudRain,
  slower_pace: Gauge,
  more_nature: Leaf,
  more_food: UtensilsCrossed,
  family_friendly: UsersRound,
};

/**
 * ItineraryRefiner — multi-turn pogovor z itinererjem + hitre akcije.
 *
 * FAZA 4-2 ("Prilagodi ta dan"): poleg klasičnega naravnojezikovnega ukaza
 * (obstoječi mehanizem, nespremenjen) ponudi šest kratkih akcij za izbrani
 * dan. Akcije gredo SKOZI ISTI /api/itinerary/refine endpoint — AI pot jih
 * dobi kot ukaz, fallback pot (deterministično) pa jih izvede z čistimi
 * transformacijami nad datasetom destinacij. Ni nov AI sistem.
 */
export function ItineraryRefiner({
  itinerary,
  formData,
  onRefined,
  hideQuickActions = false,
}: ItineraryRefinerProps) {
  const { toast } = useToast();
  const locale = useLocale();
  const lang = langOf(locale);
  const t = useTranslations("planner");
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [quickDay, setQuickDay] = useState<number>(itinerary.days[0]?.day ?? 1);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  // TASK 4 / K-4: števec + abort (isti vzorec kot PlannerAiControls).
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const timedOutRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Dan hitrih akcij omejen na veljavne dneve trenutnega itinererja
  const dayNumbers = itinerary.days.map((d) => d.day);
  const dayNumbersKey = dayNumbers.join(",");

  useEffect(() => {
    if (!dayNumbers.includes(quickDay)) {
      setQuickDay(dayNumbers[0] ?? 1);
    }
  }, [dayNumbersKey, quickDay]);

  // K-4: števec teka SAMO med nalaganjem (1 Hz).
  useEffect(() => {
    if (!loading) {
      setElapsedSeconds(0);
      return;
    }
    const started = Date.now();
    const tick = setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - started) / 1000)),
      1000
    );
    return () => clearInterval(tick);
  }, [loading]);

  // Focus na input ko komponenta postane vidna
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function recordHistory(instructionText: string, source: string) {
    setHistory((prev) => [
      ...prev,
      {
        instruction: instructionText,
        timestamp: Date.now(),
        source,
      },
    ]);
  }

  /** Analitika elementarnih sprememb (stop_replaced / stop_removed). */
  function reportChanges(changes: RefineChange[], action: string, day: number) {
    for (const ch of changes) {
      if (ch.kind === "stop_removed") {
        trackPlannerEvent("stop_removed", {
          action,
          day,
          destination: ch.destination_id,
        });
      } else if (ch.kind === "stop_replaced") {
        trackPlannerEvent("stop_replaced", {
          action,
          day,
          destination: ch.destination_id,
          replacement: ch.replacement_id,
        });
      } else if (ch.kind === "cannot_transform") {
        // P0.3 (recenzija): akcija zavrnjena zaradi pomanjkljivih podatkov —
        // merjeno ločeno (načrt NI bil spremenjen)
        trackPlannerEvent("refine_failed", {
          via: "quick_action",
          action,
          day,
          reason: ch.reason ?? "cannot_transform",
        });
      }
    }
    if (action === "rain_suitable" && changes.some((c) => c.kind === "stop_replaced")) {
      trackPlannerEvent("weather_alternative_used", { day, via: "quick_action" });
    }
  }

  // TASK 4 / K-4: Prekliči — uporabnikov izhod iz čakalne vrste AI.
  function handleCancel() {
    abortRef.current?.abort();
  }

  async function handleRefine(
    instructionText: string,
    quick?: { action: string; day: number }
  ) {
    const trimmed = instructionText.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setBusyAction(quick?.action ?? null);
    // K-4: klient ima SVOJ abort signal (strežniška trda meja 60 s;
    // klient varovalka 90 s — usklajeno z GENERATION_TIMEOUT_SECONDS).
    const controller = new AbortController();
    abortRef.current = controller;
    timedOutRef.current = false;
    const clientTimeout = setTimeout(() => {
      timedOutRef.current = true;
      controller.abort();
    }, 90_000);
    try {
      const res = await fetch("/api/itinerary/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          itinerary,
          // P4-8 (isti razred buga kot nav.tagline): formData STATE nima polja
          // language (vstavi se šele ob generiranju fetch-u) — brez tega je
          // refine na EN straneh poganjal SL prompt + SL validacijske opombe.
          // Vstavimo ga iz locale strani, da je refine vedno v jeziku uporabnika.
          formData: {
            ...formData,
            language: lang,
            // TASK 48 (§14 — P0 refinement bypass fix): kanonska izbira z
            // zemljevida gre TUDI z refine zahtevo — strežnik jo potrebuje kot
            // avtoriteto za supply revalidacijo (FIXED izbire, cene, koordinate).
            // Isti vzorec kot generacija (itinerary-planner generateItinerary).
            ...(useAppStore.getState().selectedProducts.length > 0
              ? {
                  selectedProviderProducts: useAppStore.getState().selectedProducts,
                }
              : {}),
          },
          instruction: trimmed,
          history: history.map((h) => h.instruction),
          ...(quick ? { action: quick.action, day: quick.day } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || L.errorGeneric[lang]);
      }

      const data = await res.json();

      if (data.itinerary) {
        onRefined(data.itinerary);
        markResultEngaged();

        // P0.1 (recenzija): struktuirani validacijski dokaz strežnika —
        // before/after geo stanje + status pass | warn | still_failing.
        // Toast NI samo "uspešen 200 in lep nov tekst": če dan po spremembi
        // še vedno ni realno izvedljiv, uporabnik to izve TAKOJ.
        const validation = data.validation as
          | {
              scope: "day" | "trip";
              day?: number;
              status: "pass" | "warn" | "still_failing";
              statusNote?: string;
              before: { km: number; worst: string; issues: number; errors: number };
              after: { km: number; worst: string; issues: number; errors: number };
            }
          | undefined;
        // Učinkovite spremembe: AI pot ne poroča changes[] (načrt je bil
        // zamenjan kot celota) → šteje kot sprememba; deterministična pot
        // poroča changes[], kjer cannot_transform NI sprememba (pošteno)
        const effectiveChanges = Array.isArray(data.changes)
          ? data.changes.filter(
              (c: { kind?: string }) => c.kind !== "cannot_transform"
            ).length
          : 1;

        if (quick) {
          // Hitra akcija — deterministična ali AI izvedba
          trackPlannerEvent("planner_refined", {
            via: "quick_action",
            action: quick.action,
            day: quick.day,
            source: data.source,
            changes: effectiveChanges,
          });
          trackPlannerEvent("day_adjusted", {
            action: quick.action,
            day: quick.day,
            source: data.source,
            // P0.1: geo dokaz v analitiko (isti vir kot prikaz)
            geo_status: validation?.status ?? "unknown",
            km_before: validation?.before?.km,
            km_after: validation?.after?.km,
          });
          if (Array.isArray(data.changes)) {
            reportChanges(data.changes, quick.action, quick.day);
          }

          recordHistory(trimmed, data.source || "ai");

          const statusNote = validation?.statusNote;
          const toastDescription = [data.note, statusNote]
            .filter(Boolean)
            .join(" — ");
          // P0.1: povratna informacija OBVEZNO tudi na AI poti (prej: AI pot ni
          // vrnila note → brez toast-a → "uspešen 200 in lep tekst" brez dokaza)
          if (effectiveChanges > 0 && (data.note || statusNote)) {
            toast({
              title:
                validation?.status === "still_failing"
                  ? L.toastStillFailing[lang]
                  : L.toastUpdated[lang],
              description: toastDescription,
              variant:
                validation?.status === "still_failing" ? "destructive" : "default",
            });
          } else if (data.note || statusNote) {
            // Akcija se ni izvedla (cannot_transform / ničesar ni bilo mogoče
            // spremeniti) — pošteno, z razlago
            toast({
              title: L.toastQuickNoChange[lang],
              description: toastDescription,
              variant:
                validation?.status === "still_failing" ? "destructive" : "default",
            });
          }
        } else {
          // Klasični naravnojezikovni refine
          trackPlannerEvent("planner_refined", {
            via: "free_text",
            source: data.source,
            geo_status: validation?.status ?? "unknown",
          });
          recordHistory(trimmed, data.source || "ai");

          if (data.warning) {
            // AI ni uspel, itinerer nespremenjen — za pilota je to refine_failed
            trackPlannerEvent("refine_failed", { via: "free_text" });
            toast({
              title: L.toastPartial[lang],
              description: data.warning,
              variant: "destructive",
            });
          } else {
            toast({
              title: `${L.toastUpdated[lang]} ✨`,
              description: [
                L.toastUpdatedDesc[lang](trimmed),
                validation?.statusNote,
              ]
                .filter(Boolean)
                .join(" — "),
              variant:
                validation?.status === "still_failing" ? "destructive" : "default",
            });
          }
        }
      }
    } catch (err) {
      // K-4: PREKLIC ≠ napaka — uporabnik je sam končal čakanje (oz. 90 s
      // varovalka); iskren toast brez destruktivne variante za preklic.
      if (err instanceof DOMException && err.name === "AbortError") {
        const timedOut = timedOutRef.current;
        trackPlannerEvent(timedOut ? "refine_timeout" : "refine_cancelled", {
          via: quick ? "quick_action" : "free_text",
          action: quick?.action,
          placement: "rail",
          elapsed_seconds: elapsedSeconds,
        });
        toast({
          title: timedOut
            ? L.toastTimeout[lang]
            : L.toastCancelled[lang],
          variant: timedOut ? "destructive" : "default",
        });
      } else {
        const msg = err instanceof Error ? err.message : L.errorGeneric[lang];
        trackPlannerEvent("refine_failed", {
          via: quick ? "quick_action" : "free_text",
          action: quick?.action,
        });
        toast({
          title: L.toastFailed[lang],
          description: msg,
          variant: "destructive",
        });
      }
    } finally {
      clearTimeout(clientTimeout);
      abortRef.current = null;
      setLoading(false);
      setBusyAction(null);
      setInstruction("");
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleRefine(instruction);
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-4 sm:p-5">
        {/* Header */}
        <div className="mb-3 flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
            <Wand2 className="size-4 text-primary" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold sm:text-base">
              {L.title[lang]}
            </h3>
            <p className="text-xs text-muted-foreground">
              {L.subtitle[lang]}
            </p>
          </div>
          {history.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory((v) => !v)}
              className="gap-1.5 text-xs"
              aria-expanded={showHistory}
            >
              <History className="size-3.5" aria-hidden="true" />
              {history.length}
              {showHistory ? (
                <ChevronUp className="size-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="size-3.5" aria-hidden="true" />
              )}
            </Button>
          )}
        </div>

        {/* Zgodovina ukazov (collapsible) */}
        {showHistory && history.length > 0 && (
          <div className="mb-3 space-y-1.5 rounded-lg border border-border/60 bg-background/50 p-3">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {L.history[lang]}
            </p>
            {history.map((h, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <Badge
                  variant="secondary"
                  className={cn(
                    "shrink-0 text-[10px]",
                    h.source === "ai" &&
                      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                  )}
                >
                  {h.source === "ai"
                    ? "AI"
                    : h.source === "deterministic"
                    ? PL(lang, { sl: "brez AI", en: "no AI", it: "senza AI", de: "ohne KI", fr: "sans IA", es: "sin IA" })
                    : "fallback"}
                </Badge>
                <span className="text-muted-foreground">{h.instruction}</span>
              </div>
            ))}
          </div>
        )}

        {/* === FAZA 4-2: Prilagodi ta dan — hitre akcije ===
            TASK 4 / K-9: SKRITO, ko je primarna kontrolna vrstica
            (PlannerAiControls) vidna v delovni površini — 6 čipov + izbirnik
            dneva se ne podvajata (a11y revizija: 26 kontrol). HIDE ≠ DELETE:
            false (privzeto) ohrani blok za ostale klice. */}
        {!hideQuickActions && dayNumbers.length > 0 && (
          <div className="mb-3 rounded-lg border border-border/60 bg-background/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/90">
                <Calendar className="size-3.5 text-primary" aria-hidden="true" />
                {L.adjustDay[lang]}
              </span>
              <Select
                value={String(quickDay)}
                onValueChange={(v) => setQuickDay(Number(v))}
              >
                <SelectTrigger
                  className="h-8 w-[110px] text-xs"
                  aria-label={L.day[lang]}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dayNumbers.map((d) => (
                    <SelectItem key={d} value={String(d)} className="text-xs">
                      {t("dayTitle", { day: d })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((qa) => {
                const Icon = ACTION_ICONS[qa.id] ?? Sparkles;
                const busy = busyAction === qa.id && loading;
                return (
                  <button
                    key={qa.id}
                    type="button"
                    onClick={() =>
                      handleRefine((qa.instruction[lang] ?? qa.instruction.en)(quickDay), {
                        action: qa.id,
                        day: quickDay,
                      })
                    }
                    disabled={loading}
                    aria-label={`${qa.label[lang] ?? qa.label.en} — ${t("dayTitle", { day: quickDay })}`}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Icon className="size-3.5 text-primary" aria-hidden="true" />
                    )}
                    {qa.label[lang]}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground/80">
              {L.quickActionsHint[lang]}
            </p>
          </div>
        )}

        {/* Input + submit (klasični naravnojezikovni refine — nespremenjen) */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={L.inputPlaceholder[lang]}
            disabled={loading}
            maxLength={500}
            className="flex-1 bg-background"
            aria-label={L.inputLabel[lang]}
          />
          <Button
            type="submit"
            disabled={loading || !instruction.trim()}
            size="icon"
            className="shrink-0"
            aria-label={L.send[lang]}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="size-4" aria-hidden="true" />
            )}
          </Button>
        </form>

        {/* Loading indikator z razlago — TASK 4 / K-4: števec + Prekliči */}
        {loading && (
          <div
            className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />
            <span>
              {L.loading[lang]}{" "}
              {elapsedSeconds > 0 && (
                <span className="tabular-nums">
                  · {elapsedSeconds} {L.seconds[lang]}
                </span>
              )}
            </span>
            {elapsedSeconds >= 10 && (
              <span className="text-muted-foreground/80">
                {L.loadingSlowHint[lang]}
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
              className="ml-auto shrink-0 h-7 gap-1.5 px-2.5 text-xs"
            >
              {L.cancel[lang]}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
