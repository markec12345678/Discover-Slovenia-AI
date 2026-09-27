// ============================================================================
// TASK 47 — ISKRENA OZNAKA RAZPOLOŽLJIVOSTI (skupni listni modul, 1.52.0)
// ============================================================================
// LISTNI modul (samo tipi iz ./types) — varen za uvoz v CLIENT plasti
// (stop-insert.ts) in SERVER plasti (itinerary-supply-validation.ts).
// NIKOLI ne uvaža adapterjev/search enginea (client bundle ostane čist).
//
// Semantika (spec Task 47 §6/§15): razpoložljivost je LOČENA od cene in
// negotovost ostane negotovost — samo live_* statusa smeta biti izražena
// kot dejstvo.
// ============================================================================

import type { AvailabilityStatus } from "./types";
import { PL } from "@/lib/planner-lang";

/**
 * ISKRENA oznaka razpoložljivosti za notes supply postanka.
 * W1-faza-2b (Issue #15): 4-jezično (SL/EN/IT/DE) prek PL() — manjkajoč
 * prevod bi dedil EN (kanon faze 2a); vsi štirje so izrecni.
 */
export function availabilityNote(
  status: AvailabilityStatus | undefined,
  lang: "sl" | "en" | "it" | "de"
): string | undefined {
  switch (status) {
    case "live_available":
      return PL(lang, {
        sl: "razpoložljivost: živo potrjena",
        en: "availability: live-confirmed",
        it: "disponibilità: confermata in tempo reale",
        de: "Verfügbarkeit: live bestätigt",
      });
    case "live_unavailable":
      return PL(lang, {
        sl: "razpoložljivost: živo NI na voljo",
        en: "availability: live-unavailable",
        it: "disponibilità: non disponibile (verifica live)",
        de: "Verfügbarkeit: live nicht verfügbar",
      });
    case "unknown":
      return PL(lang, {
        sl: "razpoložljivost: ni preverjena — preveri pri ponudniku",
        en: "availability: not verified — confirm with the provider",
        it: "disponibilità: non verificata — conferma con il fornitore",
        de: "Verfügbarkeit: nicht überprüft — beim Anbieter nachfragen",
      });
    case "not_supported":
      return PL(lang, {
        sl: "razpoložljivost: preveri pri ponudniku",
        en: "availability: confirm with the provider",
        it: "disponibilità: verifica con il fornitore",
        de: "Verfügbarkeit: beim Anbieter überprüfen",
      });
    default:
      return undefined;
  }
}
