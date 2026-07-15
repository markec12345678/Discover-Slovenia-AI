"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Send,
  Loader2,
  History,
  ChevronDown,
  ChevronUp,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Itinerary, PlannerInput } from "@/lib/types";

interface ItineraryRefinerProps {
  itinerary: Itinerary;
  formData: PlannerInput;
  onRefined: (newItinerary: Itinerary) => void;
}

// Predlogi za hitre akcije — pokrivajo najpogostejše potrebe
const QUICK_SUGGESTIONS = [
  "Dodaj več pohodov v naravo",
  "Naj bo ceneje — zmanjšaj stroške",
  "Namesto vina dodaj gradove",
  "Naj bo primerno za otroke",
  "Dodaj več lokalnih restavracij",
  "Kaj če bo dež? Dodaj notranje aktivnosti",
  "Brez avta — samo javni prevoz",
  "Dodaj romantične večerne aktivnosti",
];

interface HistoryEntry {
  instruction: string;
  timestamp: number;
  source: string;
}

/**
 * ItineraryRefiner — multi-turn AI pogovor z itinererjem.
 *
 * Po generaciji itinererja lahko uporabnik naravnojezikovno spreminja
 * načrt potovanja: "Dodaj več pohodov", "Naj bo primerno za otroke",
 * "Cenejša varianta", itd.
 *
 * AI vzame trenutni itinerer + ukaz in vrne posodobljen itinerer.
 * Zgodovina ukazov se ohranja za kontekst.
 */
export function ItineraryRefiner({ itinerary, formData, onRefined }: ItineraryRefinerProps) {
  const { toast } = useToast();
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus na input ko komponenta postane vidna
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleRefine(instructionText: string) {
    const trimmed = instructionText.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    try {
      const res = await fetch("/api/itinerary/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itinerary,
          formData,
          instruction: trimmed,
          history: history.map((h) => h.instruction),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Napaka pri posodobitvi");
      }

      const data = await res.json();

      if (data.itinerary) {
        onRefined(data.itinerary);

        // Dodaj v zgodovino
        setHistory((prev) => [
          ...prev,
          {
            instruction: trimmed,
            timestamp: Date.now(),
            source: data.source || "ai",
          },
        ]);

        if (data.warning) {
          toast({
            title: "Delna posodobitev",
            description: data.warning,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Itinerer posodobljen! ✨",
            description: `AI je upošteval: "${trimmed}"`,
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Napaka pri posodobitvi";
      toast({
        title: "Posodobitev ni uspela",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
              Prilagodi itinerer z AI
            </h3>
            <p className="text-xs text-muted-foreground">
              Opiši spremembo in AI bo posodobil načrt
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
              Zgodovina sprememb
            </p>
            {history.map((h, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <Badge
                  variant="secondary"
                  className={cn(
                    "shrink-0 text-[10px]",
                    h.source === "ai" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                  )}
                >
                  {h.source === "ai" ? "AI" : "fallback"}
                </Badge>
                <span className="text-muted-foreground">{h.instruction}</span>
              </div>
            ))}
          </div>
        )}

        {/* Input + submit */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="npr. Dodaj več pohodov v naravo"
            disabled={loading}
            maxLength={500}
            className="flex-1 bg-background"
            aria-label="Ukaz za AI prilagoditev itinererja"
          />
          <Button
            type="submit"
            disabled={loading || !instruction.trim()}
            size="icon"
            className="shrink-0"
            aria-label="Pošlji ukaz AI-ju"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="size-4" aria-hidden="true" />
            )}
          </Button>
        </form>

        {/* Hitri predlogi */}
        {!loading && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {QUICK_SUGGESTIONS.slice(0, 6).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleRefine(suggestion)}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground disabled:opacity-50"
              >
                <Sparkles className="size-2.5 text-primary" aria-hidden="true" />
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {/* Loading indikator z razlago */}
        {loading && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            AI prilagaja itinerer...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
