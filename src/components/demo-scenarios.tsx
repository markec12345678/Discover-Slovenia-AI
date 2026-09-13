"use client";

import { useTranslations } from "next-intl";
import {
  Clock,
  Users,
  Heart,
  Mountain,
  UtensilsCrossed,
  ArrowRight,
  PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// DEMO SCENARIJI — 5 "wow" vprašanj za hitri 30s test
// ============================================================================
// FW4.3-2: naslovi/poizvedbe/oznake živijo v fragmentih
// demoScenarios.{sl,en}.json (ključi po id-ju scenarija) — poizvedba je
// prevedena, zato AI načrtovalnik (language=locale) odgovarja v jeziku
// uporabnika.
//
// PREMIUM-VIZ: emoji/gradient kartice → umirjene kartice v zbirni paleti
// (enaka obravnava kot prej narejeni itinererji). Funkcionalnost: isti
// kliki (onSelect → /načrtuj prek sessionStorage); "Napiši svoje" zdaj
// res pelje na načrtovalnik (prej scrollIntoView na neobstoječi element
// = tihi no-op).

interface DemoScenario {
  id: string;
  icon: typeof Mountain;
  /** ključi oznak (demoScenarios.tags.*) v vrstnem redu prikaza */
  tagKeys: [string, string, string];
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "river",
    icon: Mountain,
    tagKeys: ["twoDays", "nature", "food"],
  },
  {
    id: "family",
    icon: Users,
    tagKeys: ["today", "family", "fiveHours"],
  },
  {
    id: "romantic",
    icon: Heart,
    tagKeys: ["twoDays", "romance", "food"],
  },
  {
    id: "budget",
    icon: Clock,
    tagKeys: ["oneDay", "nature", "budget"],
  },
  {
    id: "food",
    icon: UtensilsCrossed,
    tagKeys: ["oneDay", "food", "local"],
  },
];

interface DemoScenariosProps {
  onSelect?: (query: string) => void;
  /** "Napiši svoje" — navigacija na načrtovalnik brez predhodne poizvedbe */
  onCustom?: () => void;
}

export function DemoScenarios({ onSelect, onCustom }: DemoScenariosProps) {
  const t = useTranslations("demoScenarios");

  return (
    <section className="py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <span className="mb-3 inline-block text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            {t("badge")}
          </span>
          <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">
            {t("title")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DEMO_SCENARIOS.map((scenario) => {
            const Icon = scenario.icon;
            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => onSelect?.(t(`scenarios.${scenario.id}.query`))}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border bg-card p-5 text-left transition-all",
                  "border-border/60 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                )}
              >
                {/* Ikona — mehka zbirna paleta */}
                <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4.5" aria-hidden="true" />
                </div>

                {/* Naslov */}
                <h3 className="mb-2 text-sm font-bold leading-tight">
                  {t(`scenarios.${scenario.id}.title`)}
                </h3>

                {/* Oznake — tihe, informativne */}
                <div className="flex flex-wrap gap-1">
                  {scenario.tagKeys.map((tagKey) => (
                    <span
                      key={tagKey}
                      className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                    >
                      {t(`tags.${tagKey}`)}
                    </span>
                  ))}
                </div>

                {/* Puščica ob hoverju */}
                <ArrowRight
                  className="absolute right-3 top-3 size-4 -translate-x-1 text-primary/60 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                  aria-hidden="true"
                />
              </button>
            );
          })}

          {/* Lastna poizvedba — vodi na načrtovalnik */}
          <button
            type="button"
            onClick={() => onCustom?.()}
            className={cn(
              "group flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-5 text-center transition-all",
              "border-border/60 hover:border-primary/40 hover:bg-primary/5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
          >
            <PenLine className="size-6 text-primary/60" aria-hidden="true" />
            <span className="text-sm font-medium">{t("customTitle")}</span>
            <span className="text-xs text-muted-foreground">{t("customSubtitle")}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
