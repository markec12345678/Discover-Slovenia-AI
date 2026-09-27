"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { useLocale } from "next-intl";
import {
  MessageCircleQuestion,
  Send,
  Loader2,
  Calculator,
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
import type { PlannerLang } from "@/lib/planner-lang";

/** W1-2b-2: jezik UI — 4-smerno iz locale (neznano → SL). */
const langOf = (locale: string): PlannerLang =>
  locale === "en" || locale === "it" || locale === "de" ? locale : "sl";

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
  /** ISSUE #9: "computed" = čisto izračunano (EDINA pot — AI fraziranje
   *  je odstranjeno) · "fallback" = iskrena zavrnitev ugibanja (neprepoznan
   *  namen). Legacy vrednosti ("openrouter"/"gemini"/"puter"/"z-ai-sdk")
   *  se ne oddajajo več. */
  source?:
    | "computed"
    | "openrouter"
    | "gemini"
    | "puter"
    | "z-ai-sdk"
    | "fallback";
  ts: number;
}

/** Največ sporočil, ki jih zgodovina hrani (ostalo porežemo). */
const MAX_MESSAGES = 20;

const L = {
  title: { sl: "Vprašaj o načrtu", en: "Ask about the plan", it: "Chiedi del piano", de: "Frag den Plan ab" },
  subtitle: {
    sl: "Odgovori so izračunani iz tvojega načrta — AI le sfrazi, ne izmišljuje",
    en: "Answers are computed from your plan — AI only phrases, never invents",
    it: "Le risposte sono calcolate dal tuo piano — l'AI formula soltanto, non inventa",
    de: "Antworten werden aus deinem Plan berechnet — die KI formuliert nur, erfindet nichts",
  },
  placeholder: {
    sl: "npr. Kateri dan je najbolj natrpan?",
    en: "e.g. Which day is the busiest?",
    it: "es. Quale giorno è il più intenso?",
    de: "z. B. Welcher Tag ist der vollste?",
  },
  send: { sl: "Pošlji vprašanje", en: "Send question", it: "Invia domanda", de: "Frage senden" },
  inputLabel: {
    sl: "Vprašanje o načrtu",
    en: "Question about the plan",
    it: "Domanda sul piano",
    de: "Frage zum Plan",
  },
  loading: { sl: "Preračunavam …", en: "Computing …", it: "Calcolo …", de: "Berechne …" },
  suggestions: { sl: "Predlogi vprašanj", en: "Suggested questions", it: "Domande suggerite", de: "Vorgeschlagene Fragen" },
  badgeComputed: { sl: "izračunano", en: "computed", it: "calcolato", de: "berechnet" },
  badgeAi: { sl: "AI · samo fraziranje dejstev", en: "AI · phrasing facts only", it: "AI · formula solo i fatti", de: "KI · formuliert nur Fakten" },
  badgeFallback: { sl: "brez ugibanja", en: "no guessing", it: "senza tirare a indovinare", de: "kein Raten" },
  toastFailed: { sl: "Odgovor ni uspel", en: "Could not answer", it: "Risposta non riuscita", de: "Antwort fehlgeschlagen" },
  errorGeneric: {
    sl: "Napaka pri pridobivanju odgovora",
    en: "Error while getting the answer",
    it: "Errore durante il recupero della risposta",
    de: "Fehler beim Abrufen der Antwort",
  },
  resetNote: {
    sl: "Zgodovina se počisti, ko se načrt spremeni — odgovori vedno veljajo za trenutni načrt.",
    en: "History clears when the plan changes — answers always match the current plan.",
    it: "La cronologia si azzera quando il piano cambia — le risposte valgono sempre per il piano attuale.",
    de: "Die Historie wird geleert, wenn sich der Plan ändert — Antworten gelten immer für den aktuellen Plan.",
  },
} as const;

/** Vir odgovora → (badge label, ikona, barve). */
function sourceBadge(
  source: ChatMessage["source"],
  lang: PlannerLang
): { label: string; icon: React.ComponentType<{ className?: string }>; className: string } | null {
  if (source === "computed") {
    return {
      label: L.badgeComputed[lang],
      icon: Calculator,
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
    };
  }
  if (source === "fallback") {
    return {
      label: L.badgeFallback[lang],
      icon: CircleSlash,
      className: "bg-muted text-muted-foreground",
    };
  }
  return null;
}

export function PlanCopilot({ itinerary, formData }: PlanCopilotProps) {
  const { toast } = useToast();
  const locale = useLocale();
  const lang = langOf(locale);

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
          formData: { ...formData, language: lang },
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
          data.error || L.errorGeneric[lang]
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
        locale: lang,
        via,
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : L.errorGeneric[lang];
      trackPlannerEvent("plan_qa_asked", {
        intent: "error",
        source: "error",
        via,
      });
      toast({
        title: L.toastFailed[lang],
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

  const suggestions = EXAMPLE_QUESTIONS[lang].slice(0, 4);

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
              {L.title[lang]}
            </h3>
            <p className="text-xs text-muted-foreground">
              {L.subtitle[lang]}
            </p>
          </div>
        </div>

        {/* Zgodovina klepeta */}
        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-label={L.title[lang]}
          className="max-h-80 space-y-2.5 overflow-y-auto rounded-lg border border-border/60 bg-background/50 p-3"
        >
          {messages.length === 0 && !loading && (
            <div className="py-1">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {L.suggestions[lang]}
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
            const badge = sourceBadge(m.source, lang);
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
              {L.loading[lang]}
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
            placeholder={L.placeholder[lang]}
            disabled={loading}
            maxLength={500}
            className="flex-1 bg-background"
            aria-label={L.inputLabel[lang]}
          />
          <Button
            type="submit"
            disabled={loading || !input.trim()}
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

        {messages.length > 0 && (
          <p className="mt-1.5 text-[11px] text-muted-foreground/80">
            {L.resetNote[lang]}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
