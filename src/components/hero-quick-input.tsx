"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Leaf,
  Heart,
  Users,
  UtensilsCrossed,
  Zap,
  Trees,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ============================================================================
// HERO QUICK INPUT — "Kaj želiš doživeti v Sloveniji?"
// ============================================================================
//
// WOW moment: Turist napiše eno poved → AI sestavi popoln dan.
// FW3 (AI-first hierarhija): intent chipi po predlogu uporabnika —
// 6 konkretnih želja (miren vikend, romantika, družina, hrana & vino,
// avantura, brez gužve). Submit ne scrolla več na sekcijo na homepageu,
// ampak navigira na /načrtuj (AI planner ima tam svojo celo stran), kamor
// se vprašanje prenese prek sessionStorage.
// ============================================================================

const QUICK_ACTIONS = [
  { icon: Leaf, label: "Miren vikend", query: "3-dnevni miren vikend z naravo, dobro hrano in čim manj vožnje" },
  { icon: Heart, label: "Romantično", query: "Romantični pobeg za dva z jezerom, vinom in sprehodi" },
  { icon: Users, label: "Družina", query: "3-dnevni izlet z družino (2 odrasla, 2 otroka)" },
  { icon: UtensilsCrossed, label: "Hrana & vino", query: "Potovanje po slovenski hrani, vinu in kulinaričnih regijah" },
  { icon: Zap, label: "Avantura", query: "Adrenalin vikend — rafting na Soči in pohodi v gorah" },
  { icon: Trees, label: "Brez gužve", query: "Mirni pohodi v naravi, stran od turističnih množic" },
];

export function HeroQuickInput() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // FW3: vprašanje se prenese na /načrtuj prek sessionStorage —
  // planner ga ob mountu samodejno prevzame in zgenerira itinerer.
  const handleSubmit = useCallback((query?: string) => {
    const text = query || input;
    if (!text.trim() || loading) return;

    setLoading(true);
    sessionStorage.setItem("heroQuery", text);
    router.push("/nacrtuj");
  }, [input, loading, router]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Glavni input — plavajoča steklena kartica s fokusnim žarom */}
      <div className="relative">
        <div
          className="group flex flex-col sm:flex-row gap-2 p-2 rounded-2xl bg-background/95 backdrop-blur-md border border-white/25 transition-all duration-300 focus-within:border-white/50 focus-within:shadow-[0_0_0_4px_rgba(255,255,255,0.12),0_20px_50px_-12px_rgba(0,0,0,0.5)]"
          style={{ boxShadow: "0 20px 50px -12px rgba(0,0,0,0.45)" }}
        >
          <div className="flex items-center gap-2 flex-1 px-3">
            <Sparkles className="size-5 text-primary shrink-0 transition-transform duration-300 group-focus-within:scale-110 group-focus-within:rotate-12" aria-hidden="true" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="Želim 3-dnevni miren izlet z naravo, dobro hrano in čim manj vožnje …"
              className="w-full bg-transparent py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
              aria-label="Kaj želiš doživeti v Sloveniji?"
            />
          </div>
          <Button
            onClick={() => handleSubmit()}
            disabled={loading || !input.trim()}
            className="rounded-xl shrink-0 gap-1.5 shadow-md transition-all hover:shadow-lg hover:brightness-110"
            size="lg"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{loading ? "Analiziram..." : "Sestavi mojo pot"}</span>
            <span className="sm:hidden">{loading ? "..." : "Sestavi pot"}</span>
          </Button>
        </div>
      </div>

      {/* Intent chipi — 6 želja po FW3 predlogu; py-2.5 = ~46px tap tarča (2026 standard) */}
      <div className="mt-5 flex flex-wrap justify-center gap-2.5">
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
              className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 backdrop-blur-sm px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/20 hover:border-white/50 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {action.label}
            </button>
          );
        })}
      </div>

      {/* Trust indicators — raziskava P4-5: subtilni trust signali dvigujejo konverzijo */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-white/75">
        <span className="flex items-center gap-1.5">
          <span className="soft-pulse size-2 rounded-full bg-emerald-400" aria-hidden="true" />
          Brezplačno
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-400" aria-hidden="true" />
          22 destinacij
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-sky-300" aria-hidden="true" />
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

export default HeroQuickInput;
