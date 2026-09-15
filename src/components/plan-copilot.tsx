"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { useLocale } from "next-intl";
import {
  MessageCircleQuestion,
  Send,
  Loader2,
  Calculator,
  Sparkles,
  CircleSlash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Itinerary, PlannerInput } from "@/lib/types";
import { EXAMPLE_QUESTIONS } from "@/lib/plan-qa";
import { trackPlannerEvent, markResultEngaged } from "@/lib/planner-analytics";

// ============================================================================
// F9 — PlanCopilot: "Vprašaj o načrtu" (klepet z izračunanimi dejstvi)
// ============================================================================
//
// MindTrip je chat-first. Naš odgovor: pogovorna plast NAD načrtom, kjer
// so odgovori NAJPREJ deterministični (vir "computed" — izračunano iz
// istih funkcij kot prikaz), neznana vprašanja pa odgovarja AI, a LE iz
// lista dejstev (vir "ai"). Iskren fallback pove, da ne ugiba.
// Spremembe načrta še vedno gredo skozi ItineraryRefiner (ukazi) —
// vprašanja in ukazi sta dva različna dejanja, jasno ločena.
// ============================================================================

interface PlanCopilotProps {
  itinerary: Itinerary;
  formData: PlannerInput;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** "computed" = čisto izračunano · "gemini"/"puter"/"z-ai-sdk" = AI iz
   *  dejstev · "fallback" = iskren zavrnitev ugibanja */
  source?: "computed" | "gemini" | "puter" | "z-ai-sdk" | "fallback";
  ts: number;
}

/** Največ sporočil, ki jih zgodovina hrani (ostalo porežemo). */
const MAX_MESSAGES = 20;

const L = {
  title: { sl: "Vprašaj o načrtu", en: "Ask about the plan" },
  subtitle: {
    sl: "Odgovori so izračunani iz tvojega načrta — AI le sfrazi, ne izmišljuje",
    en: "Answers are computed from your plan — AI only phrases, never invents",
  },
  placeholder: {
    sl: "npr. Kateri dan je najbolj natrpan?",
    en: "e.g. Which day is the busiest?",
  },
  send: { sl: "Pošlji vprašanje", en: "Send question" },
  inputLabel: {
    sl: "Vprašanje o načrtu",
    en: "Question about the plan",
  },
  loading: { sl: "Preračunavam …", en: "Computing …" },
  suggestions: { sl: "Predlogi vprašanj", en: "Suggested questions" },
  badgeComputed: { sl: "izračunano", en: "computed" },
  badgeAi: { sl: "AI · samo fraziranje dejstev", en: "AI · phrasing facts only" },
  badgeFallback: { sl: "brez ugibanja", en: "no guessing" },
  toastFailed: { sl: "Odgovor ni uspel", en: "Could not answer" },
  errorGeneric: {
    sl: "Napaka pri pridobivanju odgovora",
    en: "Error while getting the answer",
  },
  resetNote: {
    sl: "Zgodovina se počisti, ko se načrt spremeni — odgovori vedno veljajo za trenutni načrt.",
    en: "History clears when the plan changes — answers always match the current plan.",
  },
} as const;

/** Vir odgovora → (badge label, ikona, barve). */
function sourceBadge(
  source: ChatMessage["source"],
  isEn: boolean
): { label: string; icon: React.ComponentType<{ className?: string }>; className: string } | null {
  if (source === "computed") {
    return {
      label: L.badgeComputed[isEn ? "en" : "sl"],
      icon: Calculator,
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
    };
  }
  if (source === "gemini" || source === "puter" || source === "z-ai-sdk") {
    return {
      label: L.badgeAi[isEn ? "en" : "sl"],
      icon: Sparkles,
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    };
  }
  if (source === "fallback") {
    return {
      label: L.badgeFallback[isEn ? "en" : "sl"],
      icon: CircleSlash,
      className: "bg-muted text-muted-foreground",
    };
  }
  return null;
}

export function PlanCopilot({ itinerary, formData }: PlanCopilotProps) {
  const { toast } = useToast();
  const locale = useLocale();
  const isEn = locale === "en";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Poštenost: odgovori veljajo za NAČRT, ob katerem so bili dani. Ko se
  // načrt spremeni (refine / nova generacija → nov objekt), zgodovina se
  // počisti — ne prikazujemo zastarelih dejstev kot trenutnih.
  useEffect(() => {
    setMessages([]);
  }, [itinerary]);

  // Samodejni drs na dno ob novem sporočilu
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  function appendMessage(m: ChatMessage) {
    setMessages((prev) => [...prev, m].slice(-MAX_MESSAGES));
  }

  async function ask(question: string, via: "chip" | "input") {
    const q = question.trim();
    if (!q || loading) return;

    setLoading(true);
    appendMessage({ role: "user", text: q, ts: Date.now() });
    try {
      const res = await fetch("/api/itinerary/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itinerary,
          // P4-8 isti razred buga kot nav.tagline: formData STATE nima polja
          // language (vstavi se šele ob generiranju) — vstavimo ga tukaj iz
          // locale strani, da so odgovori vedno v jeziku uporabnika.
          formData: { ...formData, language: isEn ? "en" : "sl" },
          question: q,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        answer?: string;
        intent?: string;
        source?: ChatMessage["source"];
        error?: string;
      };

      if (!res.ok || !data.answer) {
        throw new Error(
          data.error || L.errorGeneric[isEn ? "en" : "sl"]
        );
      }

      appendMessage({
        role: "assistant",
        text: data.answer,
        source: data.source,
        ts: Date.now(),
      });

      // Vprašanje o načrtu je navezava na rezultat (isti meter kot refine)
      markResultEngaged();
      trackPlannerEvent("plan_qa_asked", {
        intent: data.intent ?? "unknown",
        source: data.source ?? "unknown",
        locale: isEn ? "en" : "sl",
        via,
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : L.errorGeneric[isEn ? "en" : "sl"];
      trackPlannerEvent("plan_qa_asked", {
        intent: "error",
        source: "error",
        via,
      });
      toast({
        title: L.toastFailed[isEn ? "en" : "sl"],
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setInput("");
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(input, "input");
  }

  const suggestions = EXAMPLE_QUESTIONS[isEn ? "en" : "sl"].slice(0, 4);

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-4 sm:p-5">
        {/* Header */}
        <div className="mb-3 flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
            <MessageCircleQuestion
              className="size-4 text-primary"
              aria-hidden="true"
            />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold sm:text-base">
              {L.title[isEn ? "en" : "sl"]}
            </h3>
            <p className="text-xs text-muted-foreground">
              {L.subtitle[isEn ? "en" : "sl"]}
            </p>
          </div>
        </div>

        {/* Zgodovina klepeta */}
        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-label={L.title[isEn ? "en" : "sl"]}
          className="max-h-80 space-y-2.5 overflow-y-auto rounded-lg border border-border/60 bg-background/50 p-3"
        >
          {messages.length === 0 && !loading && (
            <div className="py-1">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {L.suggestions[isEn ? "en" : "sl"]}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => ask(q, "chip")}
                    className="inline-flex min-h-[36px] items-center rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            if (m.role === "user") {
              return (
                <div key={m.ts + i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-xs text-primary-foreground sm:text-sm">
                    {m.text}
                  </div>
                </div>
              );
            }
            const badge = sourceBadge(m.source, isEn);
            const BadgeIcon = badge?.icon;
            return (
              <div key={m.ts + i} className="flex justify-start">
                <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-border/60 bg-background px-3.5 py-2">
                  {badge && (
                    <span
                      className={cn(
                        "mb-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        badge.className
                      )}
                    >
                      {BadgeIcon ? (
                        <BadgeIcon className="size-3" aria-hidden="true" />
                      ) : null}
                      {badge.label}
                    </span>
                  )}
                  <p className="whitespace-pre-line text-xs leading-relaxed text-foreground/90 sm:text-sm">
                    {m.text}
                  </p>
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              {L.loading[isEn ? "en" : "sl"]}
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
          <Input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={L.placeholder[isEn ? "en" : "sl"]}
            disabled={loading}
            maxLength={500}
            className="flex-1 bg-background"
            aria-label={L.inputLabel[isEn ? "en" : "sl"]}
          />
          <Button
            type="submit"
            disabled={loading || !input.trim()}
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

        {messages.length > 0 && (
          <p className="mt-1.5 text-[11px] text-muted-foreground/80">
            {L.resetNote[isEn ? "en" : "sl"]}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
