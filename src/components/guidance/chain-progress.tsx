"use client";

// ============================================================================
// ISSUE #23 — CHAIN PROGRESS: informacijski indikator verige za hub
// ============================================================================
// /moja-potovanja (razdelek Moja pot) že ima svoje CTA-je (prazna zbirka →
// Odkrij, 1+ → Nadaljuj načrtovanje, aktivna pot → NA POTI trak — issue
// #16). Ta komponenta DODA poenoten napredek verige (§13) BREZ novih CTA-jev
// (§33: en trenutek → ena razlaga → ena primarna akcija — hub-ovi obstoječi
// gumbi ostanejo primarni). ZERO FEATURE LOSS.
// ============================================================================

import { useTranslations } from "next-intl";

import { useGuidance } from "@/hooks/use-guidance";

const CHAIN_KEYS = ["discover", "plan", "book", "go", "finish"] as const;

export function GuidanceChainProgress() {
  const t = useTranslations("guidance");
  const { guidance } = useGuidance("hub");

  if (!guidance) return null;

  const chain = guidance.chain;

  return (
    <nav
      aria-label={t("chain.label")}
      data-testid="guidance-chain"
      data-guidance-state={guidance.state}
      className="flex flex-wrap items-center gap-1.5"
    >
      {CHAIN_KEYS.map((step, i) => {
        const isCurrent = chain.current === step;
        const isPast = i + 1 < chain.index;
        return (
          <span key={step} className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                isCurrent
                  ? "bg-primary text-primary-foreground"
                  : isPast
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span aria-hidden="true">{isPast ? "✓" : i + 1}</span>
              {t(`chain.${step}`)}
            </span>
            {i < CHAIN_KEYS.length - 1 && (
              <span aria-hidden="true" className="h-px w-2 bg-muted-foreground/30 sm:w-3" />
            )}
          </span>
        );
      })}
      <span className="sr-only">
        {t("a11y.stepOf", { index: chain.index, total: chain.total })}
      </span>
    </nav>
  );
}
