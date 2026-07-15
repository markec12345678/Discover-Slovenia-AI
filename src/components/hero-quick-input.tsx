"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Clock,
  Users,
  UtensilsCrossed,
  Mountain,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================================================
// HERO QUICK INPUT — "Kaj želiš doživeti v Sloveniji?"
// ============================================================================
//
// WOW moment: Turist napiše eno poved → AI sestavi popoln dan
// Quick actions za hitri začetek
// ============================================================================

const QUICK_ACTIONS = [
  { icon: Clock, label: "Danes imam 5 ur", query: "Imam 5 ur časa, kaj lahko obiščem?" },
  { icon: Users, label: "Potujem z družino", query: "3-dnevni izlet z družino (2 odrasla, 2 otroka)" },
  { icon: UtensilsCrossed, label: "Lokalna hrana", query: "Kje lahko poskusim tradicionalno slovensko hrano?" },
  { icon: Mountain, label: "Narava brez gneče", query: "Mirni pohodi v naravi, stran od turističnih množic" },
];

export function HeroQuickInput() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showThinking, setShowThinking] = useState(false);

  const handleSubmit = useCallback(async (query?: string) => {
    const text = query || input;
    if (!text.trim()) return;

    setLoading(true);
    setShowThinking(true);

    // Scroll do AI planner + pre-fill
    const planner = document.getElementById("načrtuj");
    if (planner) {
      planner.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // Shrani v sessionStorage da AI planner prebere
    sessionStorage.setItem("heroQuery", text);

    // Po 2s simuliraj "analiziram" in naloži planner
    setTimeout(() => {
      setShowThinking(false);
      setLoading(false);
      // Dispatch custom event da itinerary planner posluša
      window.dispatchEvent(new CustomEvent("heroQuery", { detail: text }));
    }, 2000);
  }, [input]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Glavni input */}
      <div className="relative">
        <div className="flex flex-col sm:flex-row gap-2 p-2 rounded-2xl bg-background/95 backdrop-blur-md shadow-2xl border border-white/20">
          <div className="flex items-center gap-2 flex-1 px-3">
            <Sparkles className="size-5 text-primary shrink-0" aria-hidden="true" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="Kaj želiš doživeti v Sloveniji?"
              className="w-full bg-transparent py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
              aria-label="Kaj želiš doživeti v Sloveniji?"
            />
          </div>
          <Button
            onClick={() => handleSubmit()}
            disabled={loading || !input.trim()}
            className="rounded-xl shrink-0 gap-1.5"
            size="lg"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{loading ? "Analiziram..." : "Ustvari AI plan"}</span>
            <span className="sm:hidden">{loading ? "..." : "Plan"}</span>
          </Button>
        </div>
      </div>

      {/* "Analiziram" animacija */}
      {showThinking && (
        <div className="mt-4 rounded-xl bg-background/90 backdrop-blur-md p-4 border border-primary/30 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
            <span className="font-medium">Pripravljam tvoj dan...</span>
          </div>
          <div className="space-y-1.5">
            {[
              { label: "vreme", delay: "0ms" },
              { label: "lokacijo", delay: "200ms" },
              { label: "odprtost", delay: "400ms" },
              { label: "tvoje interese", delay: "600ms" },
              { label: "lokalne ponudnike", delay: "800ms" },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs text-muted-foreground animate-in fade-in slide-in-from-left-2"
                style={{ animationDelay: item.delay, animationDuration: "300ms" }}
              >
                <span className="text-emerald-500">✓</span>
                <span>Analiziram {item.label}...</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick action chips */}
      {!showThinking && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  setInput(action.query);
                  handleSubmit(action.query);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 backdrop-blur-sm px-3.5 py-2 text-sm font-medium text-white transition-all hover:bg-white/20 hover:border-white/50 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {action.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Trust indicators */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/70">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-400" aria-hidden="true" />
          Brezplačno
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-400" aria-hidden="true" />
          22 destinacij
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-blue-400" aria-hidden="true" />
          AI v slovenščini
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-violet-400" aria-hidden="true" />
          Preverjeni partnerji
        </span>
      </div>
    </div>
  );
}
