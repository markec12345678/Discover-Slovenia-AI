"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

interface BetaStatus {
  isActive: boolean;
  listingCount: number;
  remainingToMonetization: number;
  message: string;
  betaEndDate: string | null;
}

/**
 * BetaBanner — prikazuje pasico na vrhu strani med beta obdobjem.
 * Poudarja da so vsi paketi brezplačni dokler se platforma polni.
 * Client-side fetch iz /api/beta-status
 *
 * ISSUE #23 (1.163.0) §33: zavrnitev je zdaj TRAJNA (localStorage) —
 * sporočilo za ponudnike, ki se je poprej vračalo ob VSAKEM nalaganju
 * (vsa 3 dno-mesta mobilnega pogleda: tab vrstica + chat FAB + pasica),
 * je za popotnika čist šum.
 */
const BETA_DISMISSED_KEY = "dsa-beta-dismissed";

export function BetaBanner() {
  const t = useTranslations("betaBanner");
  const [status, setStatus] = useState<BetaStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // queueMicrotask: setState NI sinhrono v telesu efekta (vzorec
    // use-wake-lock.ts — react-hooks/set-state-in-effect disciplina).
    queueMicrotask(() => {
      try {
        setDismissed(window.localStorage.getItem(BETA_DISMISSED_KEY) === "1");
      } catch {
        // zasebni način — velja samo za to sejo
      }
    });
    fetch("/api/beta-status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(BETA_DISMISSED_KEY, "1");
    } catch {
      // zasebni način — velja samo za to sejo
    }
  };

  if (!status || !status.isActive || dismissed) return null;

  return (
    <div className="relative z-40 w-full bg-gradient-to-r from-primary to-primary/90 text-primary-foreground">
      {/* pr-[4.5rem] (mobilno): deska rezervira prostor za chat FAB (fixed bottom-right), da gumba nista pod njim ob prvem prikazu; sm:px-6 ponastavi */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 pr-[4.5rem] py-2.5 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2 text-xs sm:text-sm">
          <Sparkles className="size-4 shrink-0" aria-hidden="true" />
          <span className="font-medium">{t("active")}</span>
          <span className="hidden sm:inline">
            {t("remainingPrefix")}{" "}
            <strong>{status.remainingToMonetization}</strong>{" "}
            {t("remainingSuffix")}
          </span>
          <span className="min-w-0 truncate sm:hidden">
            {t("remainingMobile", { count: status.remainingToMonetization })}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            asChild
            size="sm"
            variant="secondary"
            className="h-9 px-3 text-xs sm:h-7"
          >
            <a href="/za-ponudnike#pridruzi-se">{t("join")}</a>
          </Button>
          <button
            type="button"
            onClick={dismiss}
            className="-m-1 rounded-md p-2 transition-colors hover:bg-primary-foreground/20 active:bg-primary-foreground/30"
            aria-label={t("dismiss")}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
