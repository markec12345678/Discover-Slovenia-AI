"use client";

// ============================================================================
// ISSUE #22 §6/§7/§8/§30.G — GUARDIAN CONFLICT CARD + RECOVERY MODE
// ============================================================================
// Ko pot postane problematična, Discover JASNO pokaže problem na vrhu:
//   FACTS (dejstva) → REASON (razlog) → IMPACT (posledica) → [akcije].
// Akcije so uporabnikove (§8): Navigiraj / Preskoči / Preuredi mojo pot /
// Odpri rezervacijo — Guardian NIKOLI ne spremeni rezervacije sam (invarianta
// #21 §3 + #22 §20).
//
// Recovery razširitev (§7): kaj se je spremenilo, kaj ostaja veljavno,
// naslednji izvedljivi cilj — ZLOŽLJIVO (sekundarna informacija ne ZAKRIJE
// primarne odločitve §21).
// ============================================================================

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  GuardianActionId,
  GuardianConflict,
} from "@/lib/journey/conflict-detect";
import { GUARDIAN_ACTION_LABELS } from "@/lib/journey/conflict-detect";
import {
  RECOVERY_ACTION_LABELS,
  RECOVERY_LABELS,
  type RecoveryPlan,
  type RecoverySuggestionAction,
} from "@/lib/journey/recovery";

export interface GuardianConflictProps {
  conflict: GuardianConflict;
  recovery: RecoveryPlan | null;
  lang: "sl" | "en";
  /** Izvede predlagano akcijo (Go Mode posreduje obstoječe mehanizme). */
  onAction: (
    action: GuardianActionId | RecoverySuggestionAction,
    conflict: GuardianConflict
  ) => void;
  /** Ali je konflikt na naslednjem postanku (akcija NAVIGATE smiselna). */
  isNextStop: boolean;
}

/** Naslov vrste konflikta — poudarek glede na resnost. */
function titleClass(severity: GuardianConflict["severity"]): string {
  if (severity === "attention") return "text-amber-900 dark:text-amber-200";
  if (severity === "warning") return "text-amber-800 dark:text-amber-300";
  return "text-muted-foreground";
}

export function GuardianConflictCard({
  conflict,
  recovery,
  lang,
  onAction,
  isNextStop,
}: GuardianConflictProps) {
  const [showRecovery, setShowRecovery] = useState(false);
  const t = (o: { sl: string; en: string }) => o[lang];

  // Dejanja, ki jih konflikt ponudi (NAVIGATE samo na naslednjem postanku —
  // sicer bi navigirali k postanku, ki ni naslednji v toku).
  const actions = conflict.actions.filter((a) => a !== "NAVIGATE" || isNextStop);

  return (
    <div
      role="alert"
      className="space-y-3 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <div className="min-w-0 space-y-1">
          <p
            className={cn(
              "text-sm font-bold tracking-wide",
              titleClass(conflict.severity)
            )}
          >
            {t(conflict.facts)}
          </p>
          <p className="text-xs text-muted-foreground">{t(conflict.reason)}</p>
          <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
            {t(conflict.impact)}
          </p>
        </div>
      </div>

      {/* Uporabnikove akcije (§8 — ena odločitev naenkrat, ≥44 px tipkovnica) */}
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action}
            size="sm"
            variant={action === "NAVIGATE" ? "default" : "outline"}
            className="h-11"
            onClick={() => onAction(action, conflict)}
          >
            {t(GUARDIAN_ACTION_LABELS[action])}
          </Button>
        ))}
      </div>

      {/* RECOVERY MODE (§7): zložljivi podatek, kaj je prizadeto/velja. */}
      {recovery && (
        <div className="border-t border-amber-200 pt-2 dark:border-amber-800">
          <button
            type="button"
            onClick={() => setShowRecovery((v) => !v)}
            aria-expanded={showRecovery}
            className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-amber-900 hover:underline dark:text-amber-200"
          >
            <span>
              {t(RECOVERY_LABELS.stillValid)}: {recovery.stillValid.length} ·{" "}
              {t(RECOVERY_LABELS.atRisk)}: {recovery.atRisk.length}
              {recovery.nextViable
                ? ` · ${t(RECOVERY_LABELS.nextViable)}: ${recovery.nextViable.title}`
                : ""}
            </span>
            {showRecovery ? (
              <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
          </button>
          {showRecovery && (
            <div className="mt-2 space-y-2 text-xs text-muted-foreground">
              <p>{t(recovery.changed)}</p>
              {recovery.stillValid.length > 0 && (
                <p>
                  ✓ {t(RECOVERY_LABELS.stillValid)}:{" "}
                  {recovery.stillValid.map((s) => s.title).join(", ")}
                </p>
              )}
              {/* §8: recovery predlogi — Nadaljuj / Preskoči / Preuredi
                  (uporabnikova izbira, nikoli skrite spremembe). */}
              <div className="flex flex-wrap gap-2">
                {recovery.suggestions.map((s) => (
                  <Button
                    key={`${s.action}-${s.stopKey}`}
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => onAction(s.action, conflict)}
                  >
                    {t(RECOVERY_ACTION_LABELS[s.action])}
                  </Button>
                ))}
              </div>
              <p className="italic">{t(RECOVERY_LABELS.yourCall)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
