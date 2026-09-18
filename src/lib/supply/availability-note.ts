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

/** ISKRENA oznaka razpoložljivosti za notes supply postanka (SL/EN). */
export function availabilityNote(
  status: AvailabilityStatus | undefined,
  lang: "sl" | "en"
): string | undefined {
  switch (status) {
    case "live_available":
      return lang === "en"
        ? "availability: live-confirmed"
        : "razpoložljivost: živo potrjena";
    case "live_unavailable":
      return lang === "en"
        ? "availability: live-unavailable"
        : "razpoložljivost: živo NI na voljo";
    case "unknown":
      return lang === "en"
        ? "availability: not verified — confirm with the provider"
        : "razpoložljivost: ni preverjena — preveri pri ponudniku";
    case "not_supported":
      return lang === "en"
        ? "availability: confirm with the provider"
        : "razpoložljivost: preveri pri ponudniku";
    default:
      return undefined;
  }
}
