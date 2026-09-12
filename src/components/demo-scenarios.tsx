"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Clock, Users, Heart, Mountain, UtensilsCrossed, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================================================
// DEMO SCENARIJI — 5 "wow" vprašanj za hitri 30s test
// ============================================================================
// FW4.3-2: naslovi/poizvedbe/oznake živijo v fragmentih
// demoScenarios.{sl,en}.json (ključi po id-ju scenarija) — poizvedba je
// prevedena, zato AI načrtovalnik (language=locale) odgovarja v jeziku
// uporabnika.

interface DemoScenario {
  id: string;
  icon: typeof Mountain;
  emoji: string;
  /** ključi oznak (demoScenarios.tags.*) v vrstni redu prikaza */
  tagKeys: [string, string, string];
  gradient: string;
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "river",
    icon: Mountain,
    emoji: "🌊",
    tagKeys: ["twoDays", "nature", "food"],
    gradient: "from-blue-500/10 to-cyan-500/10",
  },
  {
    id: "family",
    icon: Users,
    emoji: "👨‍👩‍👧",
    tagKeys: ["today", "family", "fiveHours"],
    gradient: "from-amber-500/10 to-orange-500/10",
  },
  {
    id: "romantic",
    icon: Heart,
    emoji: "❤️",
    tagKeys: ["twoDays", "romance", "food"],
    gradient: "from-rose-500/10 to-pink-500/10",
  },
  {
    id: "budget",
    icon: Clock,
    emoji: "💸",
    tagKeys: ["oneDay", "nature", "budget"],
    gradient: "from-emerald-500/10 to-green-500/10",
  },
  {
    id: "food",
    icon: UtensilsCrossed,
    emoji: "🍯",
    tagKeys: ["oneDay", "food", "local"],
    gradient: "from-violet-500/10 to-purple-500/10",
  },
];

interface DemoScenariosProps {
  onSelect?: (query: string) => void;
}

export function DemoScenarios({ onSelect }: DemoScenariosProps) {
  const t = useTranslations("demoScenarios");
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <section className="py-12 bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <div className="mb-3 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium">
              <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
              {t("badge")}
            </span>
          </div>
          <h2 className="text-2xl font-bold sm:text-3xl">
            {t("title")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DEMO_SCENARIOS.map((scenario) => {
            const Icon = scenario.icon;
            const isHovered = hovered === scenario.id;
            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => onSelect?.(t(`scenarios.${scenario.id}.query`))}
                onMouseEnter={() => setHovered(scenario.id)}
                onMouseLeave={() => setHovered(null)}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border-2 p-5 text-left transition-all",
                  "hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5",
                  isHovered ? "border-primary/40 shadow-lg" : "border-border/60",
                  "bg-gradient-to-br",
                  scenario.gradient
                )}
              >
                {/* Icon */}
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-2xl" aria-hidden="true">{scenario.emoji}</span>
                  <Icon className="size-4 text-primary/60" aria-hidden="true" />
                </div>

                {/* Title */}
                <h3 className="text-sm font-bold leading-tight mb-2">
                  {t(`scenarios.${scenario.id}.title`)}
                </h3>

                {/* Tags */}
                <div className="flex flex-wrap gap-1">
                  {scenario.tagKeys.map((tagKey) => (
                    <span
                      key={tagKey}
                      className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                    >
                      {t(`tags.${tagKey}`)}
                    </span>
                  ))}
                </div>

                {/* Arrow on hover */}
                <div className={cn(
                  "absolute right-3 top-3 transition-all",
                  isHovered ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"
                )}>
                  <ArrowRight className="size-4 text-primary" aria-hidden="true" />
                </div>
              </button>
            );
          })}

          {/* Custom card */}
          <button
            type="button"
            onClick={() => {
              document.getElementById("načrtuj")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/60 p-5 text-center transition-all hover:border-primary/40 hover:bg-primary/5"
          >
            <Sparkles className="size-6 text-primary/60" aria-hidden="true" />
            <span className="text-sm font-medium">{t("customTitle")}</span>
            <span className="text-xs text-muted-foreground">{t("customSubtitle")}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
