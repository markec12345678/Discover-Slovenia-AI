import { plannerSessionId } from "@/lib/planner-analytics";

// ============================================================================
// ZAPIS EXTERNAL HANDOFFA — skupni klientki helper (1.88.1, FINAL
// ACCEPTANCE FA-3/GAP)
// ============================================================================
// Problem (dokazano: browser E2E + kodni audit FA-3): zapis "uporabnik je
// ODŠEL k ponudniku" (JourneyBooking status EXTERNAL, strežniško
// idempotenten) je ustvarjala SAMO MOJA POT povezava v journey-trip.tsx.
// Kartični CTA "Rezerviraj pri ponudniku" (journey-planner.tsx) in Go Mode
// EntryLinks (go-mode.tsx) so uporabnika poslali k ponudniku BREZ zapisa —
// števec preusmeritev v MOJA POT je štel premalo, lifecycle pogled je bil
// NEPOŠTEN (dogodek se je zgodil, evidence pa ne).
//
// Ta helper je ISTA semantika kot journey-trip recordHandoff (fire-and-
// forget, keepalive, strežnik idempotenten), brez optimističnega UI
// (kartični CTA nima lokalnega števca, ki bi ga bilo treba povrniti).
// Affiliate KARTICE ponudnikov (booking.com/viator splošne povezave)
// NISO izdelki (ni providerProductId) — teh se NE posnema (podatkovni model
// JourneyBooking zahteva izdelek; splošna affiliate povezava ni rezervacija
// izdelka).

/**
 * Zabeleži EXTERNAL handoff (uporabnik je kliknil ponudnikovo povezavo za
 * KONKRETEN izdelek). Fire-and-forget: ne vrne obljube, ne blokira
 * navigacije, tiho požre napake (handoff ni odvisen od nas — enako kot
 * journey-trip recordHandoff catch blok).
 */
export function recordExternalHandoff(
  provider: string | undefined,
  providerProductId: string | undefined
): void {
  if (!provider || !providerProductId) return;
  try {
    void fetch("/api/journey/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        providerProductId,
        status: "EXTERNAL",
        sessionKey: plannerSessionId(),
      }),
      keepalive: true,
    }).catch(() => {
      // Zasebni način/blokiran fetch/429 — tiho (isti kanon kot
      // journey-trip: handoff ne sme pasti, če telemetrija odpove).
    });
  } catch {
    // localStorage nedostenoven (plannerSessionId ima svoj fallback) ali
    // fetch nedostenoven — tiho.
  }
}
