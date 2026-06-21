// Client-side funnel tracking utility
// Kliče se iz komponent za sledenje konverzijskemu funnelu

export type FunnelStep =
  | "homepage_view"
  | "destination_view"
  | "itinerary_generate"
  | "newsletter_signup"
  | "listing_click";

export function trackFunnel(step: FunnelStep, path?: string) {
  // Fire-and-forget — ne blokiraj UI
  fetch("/api/track-funnel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step, path }),
  }).catch(() => {});
}
