"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Copy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { saveItinerary } from "@/lib/itinerary-share";
import {
  addSavedTrip,
  deriveSavedTripName,
} from "@/lib/my-trips-storage";
import type { Itinerary, PlannerInput } from "@/lib/types";
import { cn } from "@/lib/utils";

// ============================================================================
// TRIP FORK BUTTON — „Shrani kot svojo kopijo" (ISSUE #8 §26 / Faza 2 F2-C)
// ============================================================================
//
// „Community content should connect naturally into the same trip system":
// obiskovalec DELJENE/SKUPNOSTNE pote (/pot/[shareId]) z enim klikom dobi
// LASTNO kopijo — saveItinerary ustvari nov shareId + LASTNI editToken
// (shranjen v localStorage prek saveItinerary → kopija je popolnoma
// ureljiva: urejanje, vodnik, PDF …) in addSavedTrip jo zapiše v
// dai:my-trips → prikaže se v „Moja potovanja" (gost + prijavljen).
//
// formData (PlannerInput izvirne pote) se prekopira zraven, če obstaja —
// kopija tako ohrani vhodne podatke načrtovalnika; ob null se kopija
// shraní brez njih (API obravnava manjkajoči ključ kot null).
//
// Dostopnost: min-h-[44px] dotik-tarča, aria-label, disabled med nalaganjem
// (Loader2), iskren toast ob napaki (sporočilo iz saveItinerary — offline /
// rate limit / strežnik). Oznake SL/EN prek useLocale (vzorec L objekta
// AddToTripButton).

const L = {
  sl: {
    label: "Shrani kot svojo kopijo",
    aria: "Shrani to potovanje kot svojo kopijo",
    toastTitle: "Potovanje shranjeno kot tvoja kopija",
    toastDesc:
      "Kopija je v Moja potovanja — popolnoma jo lahko urejaš in deliš.",
    openCopy: "Odpri kopijo",
    errorTitle: "Kopije ni bilo mogoče shraniti",
    errorFallback: "Shranjevanje ni uspelo — poskusi znova.",
  },
  en: {
    label: "Save as your own copy",
    aria: "Save this trip as your own copy",
    toastTitle: "Trip saved as your own copy",
    toastDesc: "The copy is in My trips — fully yours to edit and share.",
    openCopy: "Open the copy",
    errorTitle: "Could not save your copy",
    errorFallback: "Saving failed — please try again.",
  },
} as const;

type Lang = keyof typeof L;

export function TripForkButton({
  itinerary,
  formData,
  name,
  className,
}: {
  /** Itinerer deljene pote — izhodišče kopije. */
  itinerary: Itinerary;
  /**
   * Vhodni podatki načrtovalnika izvirne pote (PlannerInput | null).
   * null (starejša/anonimna pot) → kopija brez formData (API: null).
   */
  formData: PlannerInput | null;
  /** Ime izvirne pote (null → API shrani brez imena, isti kanon kot planner). */
  name: string | null;
  className?: string;
}) {
  const locale = useLocale();
  const s: (typeof L)[Lang] = locale === "en" ? L.en : L.sl;
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleFork = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // NOVA lastna kopija: nov shareId + lastni editToken (saveItinerary
      // žeton sam shrani v localStorage + ogreje offline predpomnilnik).
      const result = await saveItinerary(
        itinerary,
        formData,
        name ?? undefined
      );
      // P2-3: sledenje za „Moja potovanja" (localStorage dai:my-trips) —
      // ime: original, sicer iz destinacij (isti vzorec kot planner/timeline).
      addSavedTrip(result.shareId, name ?? deriveSavedTripName(itinerary));
      toast({
        title: s.toastTitle,
        description: s.toastDesc,
        action: (
          <ToastAction
            altText={s.openCopy}
            onClick={() => router.push(result.url)}
          >
            {s.openCopy}
          </ToastAction>
        ),
      });
    } catch (err) {
      // Iskreno sporočilo iz saveItinerary (offline / preveč zahtev /
      // strežniška napaka) — brez tihega padca.
      toast({
        title: s.errorTitle,
        description:
          err instanceof Error && err.message ? err.message : s.errorFallback,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      size="lg"
      variant="outline"
      onClick={() => void handleFork()}
      disabled={busy}
      aria-label={s.aria}
      className={cn("min-h-[44px]", className)}
    >
      {busy ? (
        <Loader2 className="size-4 mr-2 animate-spin" aria-hidden="true" />
      ) : (
        <Copy className="size-4 mr-2" aria-hidden="true" />
      )}
      {s.label}
    </Button>
  );
}
