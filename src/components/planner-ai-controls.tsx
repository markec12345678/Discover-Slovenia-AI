"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Send,
  Loader2,
  Wand2,
  Calendar,
  CarFront,
  CloudRain,
  Leaf,
  UtensilsCrossed,
  UsersRound,
  Gauge,
  Sparkles,
  PiggyBank,
  Footprints,
  Wind,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/lib/store";
import type { Itinerary, PlannerInput } from "@/lib/types";
import { QUICK_ACTIONS } from "@/lib/refine-actions";
import { trackPlannerEvent, markResultEngaged } from "@/lib/planner-analytics";

// ============================================================================
// PLANNER AI CONTROLS — Issue #3 §3 "AI = CONTROL LAYER"
// ============================================================================
//
// Problem (revizija 5-B točka 20a): hitre akcije refinementa so bile zaprte
// v zavihku "Spremeni načrt" desnega stolpca — AI je deloval kot ločen
// "klebet izdelek", ne kot kontrolna plast nad potjo.
//
// Ta komponenta je KOMPAKTNA kontrolna vrstica, izrisana DIREKTNO v delovni
// površini rezultata (nad zemljevidom/dnevi) — uporabnik takoj vidi, da lahko
// načrt KONTROLIRA (manj vožnje, ceneje, več narave …).
//
// ZERO FEATURE LOSS / ZERO DUPLICATE ARCHITECTURE:
//  - KLICATA ISTI /api/itinerary/refine endpoint z ISTO obliko obremenitve
//    kot ItineraryRefiner (itinerary + formData + instruction [+action+day]);
//  - deterministične akcije so ISTE iz @/lib/refine-actions (QUICK_ACTIONS);
//  - prosti čipi (Ceneje / Bolj aktivno / Bolj mirno) gredo po OBSTOJEČI
//    prosto-besedilni poti — samo naslovijo ukaz, NI nove transformacijske
//    logike;
//  - polni rail (zgodovina, PlanCopilot) v ItineraryRefiner OSTANE nespremenjen.
// ============================================================================

interface PlannerAiControlsProps {
  itinerary: Itinerary;
  formData: PlannerInput;
  onRefined: (newItinerary: Itinerary) => void;
}

/** Dvojezične oznake (isti vzorec kot ItineraryRefiner — L konstanta). */
const L = {
  title: { sl: "AI prilagoditve", en: "AI adjustments" },
  subtitle: {
    sl: "Kaj naj spremenim na tvoji poti?",
    en: "What should I change about your trip?",
  },
  adjustDay: { sl: "Dan", en: "Day" },
  wholeTrip: { sl: "cela pot", en: "whole trip" },
  quickActionsHint: {
    sl: "Hitre akcije delujejo tudi brez AI (deterministično)",
    en: "Quick actions also work without AI (deterministic)",
  },
  inputLabel: {
    sl: "Prosti ukaz za prilagoditev",
    en: "Free-form adjustment instruction",
  },
  inputPlaceholder: {
    sl: "npr. dodaj Piran, odstrani Kranj, sprememi tempo …",
    en: "e.g. add Piran, remove Kranj, change the pace …",
  },
  send: { sl: "Pošlji", en: "Send" },
  loading: { sl: "Prilagajam …", en: "Adjusting …" },
  toastUpdated: { sl: "Itinerer posodobljen!", en: "Itinerary updated!" },
  toastStillFailing: {
    sl: "Posodobljeno — a dan še vedno ni izvedljiv",
    en: "Updated — but the day is still not doable",
  },
  toastNoChange: { sl: "Ni sprememb", en: "No changes" },
  toastFailed: { sl: "Posodobitev ni uspela", en: "Update failed" },
  errorGeneric: {
    sl: "Napaka pri posodobitvi",
    en: "Error while updating",
  },
} as const;

/**
 * Prosti čipi (Issue #3 §3 seznam: ceneje / bolj aktivno / bolj mirno) —
 * naslavljajo OBSTOJEČO prosto-besedilno refine pot (celoten načrt).
 * Izvoženo za regresijske teste preslikave id → ukaz.
 */
export const AI_CONTROL_FREE_ACTIONS: {
  id: string;
  label: { sl: string; en: string };
  instruction: { sl: string; en: string };
}[] = [
  {
    id: "cheaper",
    label: { sl: "Ceneje", en: "Cheaper" },
    instruction: {
      sl: "Naredi načrt ceneje — prednost imajo brezplačne in cenejše dejavnosti, skupni strošek potovanja naj se zniža.",
      en: "Make the itinerary cheaper — prioritize free and inexpensive activities and lower the overall trip cost.",
    },
  },
  {
    id: "more_active",
    label: { sl: "Bolj aktivno", en: "More active" },
    instruction: {
      sl: "Naredi načrt bolj aktiven — dodaj pohode in telesno dejavne izkušnje.",
      en: "Make the itinerary more active — add hikes and physically active experiences.",
    },
  },
  {
    id: "calmer",
    label: { sl: "Bolj mirno", en: "Calmer" },
    instruction: {
      sl: "Naredi načrt bolj miren — manj postankov na dan in več časa za vsak kraj.",
      en: "Make the itinerary calmer — fewer stops per day and more time at each place.",
    },
  },
];

/** Ikona proste akcije. */
const FREE_ACTION_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  cheaper: PiggyBank,
  more_active: Footprints,
  calmer: Wind,
};

/** Ikona deterministične hitre akcije (isti nabor kot ItineraryRefiner). */
const ACTION_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  less_driving: CarFront,
  rain_suitable: CloudRain,
  slower_pace: Gauge,
  more_nature: Leaf,
  more_food: UtensilsCrossed,
  family_friendly: UsersRound,
};

export function PlannerAiControls({
  itinerary,
  formData,
  onRefined,
}: PlannerAiControlsProps) {
  const { toast } = useToast();
  const locale = useLocale();
  const isEn = locale === "en";
  const t = useTranslations("planner");
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [quickDay, setQuickDay] = useState<number>(
    itinerary.days[0]?.day ?? 1
  );

  // Dan hitrih akcij omejen na veljavne dneve trenutnega itinererja
  const dayNumbers = itinerary.days.map((d) => d.day);
  const dayNumbersKey = dayNumbers.join(",");

  useEffect(() => {
    if (!dayNumbers.includes(quickDay)) {
      setQuickDay(dayNumbers[0] ?? 1);
    }
  }, [dayNumbersKey, quickDay]);

  // EN enaknoslovnica refinerjeve handleRefine (ista obremenitev, isti
  // endpoint, isti tosti — razlikuje SAMO placement v analitiki).
  // day === null → prosto-besedilna pot CELEGA načrta (brez action polja —
  // API vediča VALID_ACTIONS ključavno filtrira neznane id-je, mi pa tega
  // sploh ne pošljemo, da je obremenitev IDENTIČNA obstoječi prosti poti).
  async function handleRefine(
    instructionText: string,
    quick?: { action: string; day: number | null }
  ) {
    const trimmed = instructionText.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setBusyAction(quick?.action ?? null);
    try {
      const res = await fetch("/api/itinerary/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itinerary,
          formData: {
            ...formData,
            language: isEn ? "en" : "sl",
            ...(useAppStore.getState().selectedProducts.length > 0
              ? {
                  selectedProviderProducts:
                    useAppStore.getState().selectedProducts,
                }
              : {}),
          },
          instruction: trimmed,
          ...(quick && quick.day != null
            ? { action: quick.action, day: quick.day }
            : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ||
            L.errorGeneric[isEn ? "en" : "sl"]
        );
      }

      const data = await res.json();

      if (data.itinerary) {
        onRefined(data.itinerary);
        markResultEngaged();

        const validation = data.validation as
          | {
              status: "pass" | "warn" | "still_failing";
              statusNote?: string;
            }
          | undefined;

        const effectiveChanges = Array.isArray(data.changes)
          ? (data.changes as { kind?: string }[]).filter(
              (c) => c.kind !== "cannot_transform"
            ).length
          : 1;

        trackPlannerEvent("planner_refined", {
          via: quick ? (quick.day != null ? "quick_action" : "free_text") : "free_text",
          action: quick?.action,
          day: quick?.day ?? undefined,
          source: data.source,
          changes: effectiveChanges,
          geo_status: validation?.status ?? "unknown",
          placement: "control_strip",
        });

        const toastDescription = [data.note, validation?.statusNote]
          .filter(Boolean)
          .join(" — ");

        if (effectiveChanges > 0) {
          toast({
            title:
              validation?.status === "still_failing"
                ? L.toastStillFailing[isEn ? "en" : "sl"]
                : L.toastUpdated[isEn ? "en" : "sl"],
            description: toastDescription,
            variant:
              validation?.status === "still_failing" ? "destructive" : "default",
          });
        } else if (data.note || validation?.statusNote) {
          toast({
            title: L.toastNoChange[isEn ? "en" : "sl"],
            description: toastDescription,
            variant:
              validation?.status === "still_failing" ? "destructive" : "default",
          });
        }
      }
    } catch (err) {
      trackPlannerEvent("refine_failed", {
        via: quick ? (quick.day != null ? "quick_action" : "free_text") : "free_text",
        action: quick?.action,
        placement: "control_strip",
      });
      toast({
        title: L.toastFailed[isEn ? "en" : "sl"],
        description:
          err instanceof Error ? err.message : L.errorGeneric[isEn ? "en" : "sl"],
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setBusyAction(null);
      setInstruction("");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleRefine(instruction);
  }

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 sm:p-4">
      {/* Glava — naslov + izbira dneva za hitre akcije */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Wand2 className="size-4 text-primary" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight sm:text-base">
            {L.title[isEn ? "en" : "sl"]}
          </h3>
          <p className="text-xs text-muted-foreground">
            {L.subtitle[isEn ? "en" : "sl"]}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar
            className="size-3.5 text-primary"
            aria-hidden="true"
          />
          <Select
            value={String(quickDay)}
            onValueChange={(v) => setQuickDay(Number(v))}
          >
            <SelectTrigger
              className="h-8 w-[120px] text-xs"
              aria-label={L.adjustDay[isEn ? "en" : "sl"]}
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
      </div>

      {/* Čipi hitrih akcij — 6 determinističnih (isti vir kot rail) */}
      {dayNumbers.length > 0 && (
        <div
          className="mt-3 flex flex-wrap gap-1.5"
          role="group"
          aria-label={L.title[isEn ? "en" : "sl"]}
        >
          {QUICK_ACTIONS.map((qa) => {
            const Icon = ACTION_ICONS[qa.id] ?? Sparkles;
            const busy = busyAction === qa.id && loading;
            return (
              <button
                key={qa.id}
                type="button"
                onClick={() =>
                  handleRefine(
                    qa.instruction[isEn ? "en" : "sl"](quickDay),
                    { action: qa.id, day: quickDay }
                  )
                }
                disabled={loading}
                aria-label={`${qa.label[isEn ? "en" : "sl"]} — ${t("dayTitle", { day: quickDay })}`}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Icon className="size-3.5 text-primary" aria-hidden="true" />
                )}
                {qa.label[isEn ? "en" : "sl"]}
              </button>
            );
          })}

          {/* Prosti čipi (Issue #3 §3: ceneje / bolj aktivno / bolj mirno) —
              OBSTOJEČA prosto-besedilna pot (celoten načrt, brez action) */}
          {AI_CONTROL_FREE_ACTIONS.map((fa) => {
            const Icon = FREE_ACTION_ICONS[fa.id] ?? Sparkles;
            const busy = busyAction === fa.id && loading;
            return (
              <button
                key={fa.id}
                type="button"
                onClick={() =>
                  handleRefine(fa.instruction[isEn ? "en" : "sl"], {
                    action: fa.id,
                    day: null,
                  })
                }
                disabled={loading}
                aria-label={fa.label[isEn ? "en" : "sl"]}
                title={L.wholeTrip[isEn ? "en" : "sl"]}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Icon className="size-3.5" aria-hidden="true" />
                )}
                {fa.label[isEn ? "en" : "sl"]}
              </button>
            );
          })}
        </div>
      )}

      {/* Prosti ukaz — dodaj/odstrani destinacijo, spremeni tempo … */}
      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <Input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={L.inputPlaceholder[isEn ? "en" : "sl"]}
          disabled={loading}
          maxLength={500}
          className="flex-1 bg-background"
          aria-label={L.inputLabel[isEn ? "en" : "sl"]}
        />
        <Button
          type="submit"
          disabled={loading || !instruction.trim()}
          size="sm"
          className="shrink-0 gap-1.5"
          aria-label={L.send[isEn ? "en" : "sl"]}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">
            {L.send[isEn ? "en" : "sl"]}
          </span>
        </Button>
      </form>

      <p className="mt-1.5 text-[11px] text-muted-foreground/80">
        {L.quickActionsHint[isEn ? "en" : "sl"]}
      </p>
    </div>
  );
}

export default PlannerAiControls;
