// ============================================================================
// TASK 58 §30 — OBAVESTLJIVOST POTOVANJA (structured events)
// ============================================================================
// Neblokirajoči strukturirani dogodki (isti vzorec kot logItineraryValidation):
//  - journey_started  — uporabnik zagnal načrtovanje potovanja
//  - supply_searched  — iskanje po virih zaključeno (števci + degraded)
//
// Preslikava obstoječih dogodkov (NISE duplikati):
//  - booking_redirected ≡ obstoječi "affiliate_click" (/go/[provider] ruta —
//    vrata že zapisujejo provider/dest/productId/refPath, brez PII)
//  - itinerary_validated — obstoječa plast (generacija/refine)
//
// PRIHODNJI API_BOOKING tok (danes 0 ponudnikov — tipizirano, še ni poti):
//  booking_started | payment_started | payment_succeeded | payment_failed |
//  booking_confirmed | booking_failed
//  → zapis SAMO iz providerjevega odgovora (nikoli iz klientove trditve).
//
// NIKOLI se ne zapisuje: plačilne skrivnosti, API ključi, kartice,
// poverilnice, osebni podatki (brez IP/email/UA — isti standard kot /go).
// ============================================================================

/** Tip dogodka potovalne verige (strogo nabor — ne poljuben niz). */
export type JourneyEventType =
  | "journey_started"
  | "supply_searched";

/** Prihodnji dogodki API_BOOKING toka (dokumentirani, še brez produkcijske poti). */
export type FutureJourneyEventType =
  | "booking_started"
  | "booking_redirected"
  | "payment_started"
  | "payment_succeeded"
  | "payment_failed"
  | "booking_confirmed"
  | "booking_failed"
  | "provider_unavailable";

/** Minimalna struktura, ki jo potrebujemo od db.analyticsEvent. */
interface AnalyticsEventWriter {
  analyticsEvent: {
    create: (args: {
      data: { type: string; sessionId: string; metadata: string };
    }) => Promise<unknown>;
  };
}

/**
 * Zapiši dogodek potovanja — NEBLOKIRAJOČE (napaka DB ne sme pokvariti
 * odgovora uporabniku; peskovnik DB je znana okoljska omejitev).
 * Brez PII: samo krajevne/števčne podatke (origin/destination sta KRAJI,
// ne osebni podatek; števci so agregati).
 */
export async function logJourneyEvent(
  db: AnalyticsEventWriter,
  type: JourneyEventType,
  props: Record<string, unknown>
): Promise<void> {
  try {
    await db.analyticsEvent.create({
      data: {
        type,
        sessionId: "server",
        metadata: JSON.stringify({ props }),
      },
    });
  } catch {
    // observability je "nice to have" — nikoli ne blokira potovanja
  }
}
