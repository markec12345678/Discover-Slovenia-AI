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
 */
export function BetaBanner() {
  const t = useTranslations("betaBanner");
  const [status, setStatus] = useState<BetaStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/beta-status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

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
            onClick={() => setDismissed(true)}
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
