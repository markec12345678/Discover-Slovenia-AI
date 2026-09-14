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
import type { Itinerary, PlannerInput, RefineChange } from "@/lib/types";
import { QUICK_ACTIONS } from "@/lib/refine-actions";
import {
  trackPlannerEvent,
  markResultEngaged,
} from "@/lib/planner-analytics";

interface ItineraryRefinerProps {
  itinerary: Itinerary;
  formData: PlannerInput;
  onRefined: (newItinerary: Itinerary) => void;
}

interface HistoryEntry {
  instruction: string;
  timestamp: number;
  source: string;
}

// FAZA 4-2 — dvojezične oznake (prej komponenta trdo kodirana SL, EN
// uporabniki so videli slovenščino)
const L = {
  title: { sl: "Prilagodi itinerer", en: "Adjust the itinerary" },
  subtitle: {
    sl: "Opiši spremembo ali uporabi hitro akcijo za posamezen dan",
    en: "Describe a change or use a quick action for a specific day",
  },
  history: { sl: "Zgodovina sprememb", en: "Change history" },
  inputLabel: {
    sl: "Ukaz za prilagoditev itinererja",
    en: "Instruction for adjusting the itinerary",
  },
  inputPlaceholder: {
    sl: "npr. Dodaj več pohodov v naravo",
    en: "e.g. Add more hikes in nature",
  },
  send: { sl: "Pošlji ukaz", en: "Send instruction" },
  loading: {
    sl: "Prilagajam itinerer …",
    en: "Adjusting the itinerary …",
  },
  adjustDay: { sl: "Prilagodi ta dan", en: "Adjust this day" },
  day: { sl: "Dan", en: "Day" },
  dayPlaceholder: { sl: "izberi dan", en: "pick a day" },
  quickActionsHint: {
    sl: "Hitre akcije delujejo tudi brez AI (deterministično)",
    en: "Quick actions also work without AI (deterministic)",
  },
  toastUpdated: { sl: "Itinerer posodobljen!", en: "Itinerary updated!" },
  toastUpdatedDesc: {
    sl: (i: string) => `Upoštevano: "${i}"`,
    en: (i: string) => `Applied: "${i}"`,
  },
  toastPartial: { sl: "Delna posodobitev", en: "Partial update" },
  toastFailed: { sl: "Posodobitev ni uspela", en: "Update failed" },
  toastFailedDesc: {
    sl: "Napaka pri posodobitvi",
    en: "Error while updating",
  },
  toastQuickNoChange: {
    sl: "Ni sprememb",
    en: "No changes",
  },
  errorGeneric: {
    sl: "Napaka pri posodobitvi",
    en: "Error while updating",
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
export function ItineraryRefiner({ itinerary, formData, onRefined }: ItineraryRefinerProps) {
  const { toast } = useToast();
  const locale = useLocale();
  const isEn = locale === "en";
  const t = useTranslations("planner");
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [quickDay, setQuickDay] = useState<number>(itinerary.days[0]?.day ?? 1);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Dan hitrih akcij omejen na veljavne dneve trenutnega itinererja
  const dayNumbers = itinerary.days.map((d) => d.day);
  const dayNumbersKey = dayNumbers.join(",");

  useEffect(() => {
    if (!dayNumbers.includes(quickDay)) {
      setQuickDay(dayNumbers[0] ?? 1);
    }
  }, [dayNumbersKey, quickDay]);

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
      }
    }
    if (action === "rain_suitable" && changes.some((c) => c.kind === "stop_replaced")) {
      trackPlannerEvent("weather_alternative_used", { day, via: "quick_action" });
    }
  }

  async function handleRefine(
    instructionText: string,
    quick?: { action: string; day: number }
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
          formData,
          instruction: trimmed,
          history: history.map((h) => h.instruction),
          ...(quick ? { action: quick.action, day: quick.day } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || L.errorGeneric[isEn ? "en" : "sl"]);
      }

      const data = await res.json();

      if (data.itinerary) {
        onRefined(data.itinerary);
        markResultEngaged();

        if (quick) {
          // Hitra akcija — deterministična ali AI izvedba
          trackPlannerEvent("planner_refined", {
            via: "quick_action",
            action: quick.action,
            day: quick.day,
            source: data.source,
            changes: data.changes?.length ?? 0,
          });
          trackPlannerEvent("day_adjusted", {
            action: quick.action,
            day: quick.day,
            source: data.source,
          });
          if (Array.isArray(data.changes)) {
            reportChanges(data.changes, quick.action, quick.day);
          }

          recordHistory(trimmed, data.source || "ai");

          if ((data.changes?.length ?? 0) > 0 && data.note) {
            toast({
              title: L.toastUpdated[isEn ? "en" : "sl"],
              description: data.note,
            });
          } else if (data.note) {
            // Akcija se je izvedla, a ničesar ni bilo mogoče spremeniti — pošteno
            toast({
              title: L.toastQuickNoChange[isEn ? "en" : "sl"],
              description: data.note,
            });
          }
        } else {
          // Klasični naravnojezikovni refine
          trackPlannerEvent("planner_refined", {
            via: "free_text",
            source: data.source,
          });
          recordHistory(trimmed, data.source || "ai");

          if (data.warning) {
            // AI ni uspel, itinerer nespremenjen — za pilota je to refine_failed
            trackPlannerEvent("refine_failed", { via: "free_text" });
            toast({
              title: L.toastPartial[isEn ? "en" : "sl"],
              description: data.warning,
              variant: "destructive",
            });
          } else {
            toast({
              title: `${L.toastUpdated[isEn ? "en" : "sl"]} ✨`,
              description: L.toastUpdatedDesc[isEn ? "en" : "sl"](trimmed),
            });
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : L.errorGeneric[isEn ? "en" : "sl"];
      trackPlannerEvent("refine_failed", {
        via: quick ? "quick_action" : "free_text",
        action: quick?.action,
      });
      toast({
        title: L.toastFailed[isEn ? "en" : "sl"],
        description: msg,
        variant: "destructive",
      });
    } finally {
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
              {L.title[isEn ? "en" : "sl"]}
            </h3>
            <p className="text-xs text-muted-foreground">
              {L.subtitle[isEn ? "en" : "sl"]}
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
              {L.history[isEn ? "en" : "sl"]}
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
                  {h.source === "ai" ? "AI" : "fallback"}
                </Badge>
                <span className="text-muted-foreground">{h.instruction}</span>
              </div>
            ))}
          </div>
        )}

        {/* === FAZA 4-2: Prilagodi ta dan — hitre akcije === */}
        {dayNumbers.length > 0 && (
          <div className="mb-3 rounded-lg border border-border/60 bg-background/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/90">
                <Calendar className="size-3.5 text-primary" aria-hidden="true" />
                {L.adjustDay[isEn ? "en" : "sl"]}
              </span>
              <Select
                value={String(quickDay)}
                onValueChange={(v) => setQuickDay(Number(v))}
              >
                <SelectTrigger
                  className="h-8 w-[110px] text-xs"
                  aria-label={L.day[isEn ? "en" : "sl"]}
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
                      handleRefine(qa.instruction[isEn ? "en" : "sl"](quickDay), {
                        action: qa.id,
                        day: quickDay,
                      })
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
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground/80">
              {L.quickActionsHint[isEn ? "en" : "sl"]}
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
            placeholder={L.inputPlaceholder[isEn ? "en" : "sl"]}
            disabled={loading}
            maxLength={500}
            className="flex-1 bg-background"
            aria-label={L.inputLabel[isEn ? "en" : "sl"]}
          />
          <Button
            type="submit"
            disabled={loading || !instruction.trim()}
            size="icon"
            className="shrink-0"
            aria-label={L.send[isEn ? "en" : "sl"]}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="size-4" aria-hidden="true" />
            )}
          </Button>
        </form>

        {/* Loading indikator z razlago */}
        {loading && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            {L.loading[isEn ? "en" : "sl"]}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
