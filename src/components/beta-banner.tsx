"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BetaStatus {
  isActive: boolean;
  listingCount: number;
  remainingToMonetization: number;
  message: string;
  betaEndDate: string;
}

/**
 * BetaBanner — prikazuje pasico na vrhu strani med beta obdobjem.
 * Poudarja da so vsi paketi brezplačni dokler se platforma polni.
 * Client-side fetch iz /api/beta-status
 */
export function BetaBanner() {
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
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4 shrink-0" aria-hidden="true" />
          <span className="font-medium">Beta obdobje:</span>
          <span className="hidden sm:inline">
            Vsi paketi BREZPLAČNI za lokalce. Še{" "}
            <strong>{status.remainingToMonetization}</strong> lokalov do
            vklopa monetizacije.
          </span>
          <span className="sm:hidden">
            BREZPLAČNO · še {status.remainingToMonetization} lokalov
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            asChild
            size="sm"
            variant="secondary"
            className="h-7 px-3 text-xs"
          >
            <a href="#pridruzi-se">Pridruži se</a>
          </Button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-md p-1 transition-colors hover:bg-primary-foreground/20"
            aria-label="Zapri pasico"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
