// Client-side funnel tracking utility
// Kliče se iz komponent za sledenje konverzijskemu funnelu

export type FunnelStep =
  | "homepage_view"
  | "destination_view"
  | "itinerary_generate"
  | "newsletter_signup"
  | "listing_click"
  // Novi koraki (Faza 0 — kviz + shranjevanje):
  | "quiz_completed"
  | "itinerary_saved"
  // Novi koraki (monetizacija — tržnica):
  | "add_to_cart"
  | "checkout_completed"
  // Novi koraki (monetizacija — izkušnje):
  | "experience_booked"
  // Novi koraki (Faza 2 — Vprašaj lokalca):
  | "asked_local"
  // Novi koraki (Faza 3c — brezplačne konzultacije, model „ponudniki plačajo"):
  | "consultation_submit"
  | "consultation_delivered"
  // Novi koraki (Faza 2 — affiliate monetizacija):
  // Zapiše ga /go/[provider] redirect STREŽNIŠKO (ne klient) — vsak klik
  // na partnerja (Booking, DiscoverCars, GetYourGuide …) šteje v funnel.
  | "affiliate_click";

export function trackFunnel(step: FunnelStep, path?: string) {
  // Fire-and-forget — ne blokiraj UI
  fetch("/api/track-funnel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step, path }),
  }).catch(() => {});
}
