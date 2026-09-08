// Deljenje/shranjevanje itinererja — client helper za /api/itinerary/save
// in /api/itinerary/shared/[shareId].
//
// Uporaba: ItineraryPlanner + TripTimeline ("Shrani" gumb).

import type { Itinerary, PlannerInput } from "./types";

export interface SaveItineraryResult {
  shareId: string;
  /** Relativna pot, npr. "/pot/abc123" */
  url: string;
}

export interface SharedItineraryResult {
  name: string | null;
  itinerary: Itinerary;
  createdAt: string | null;
  views: number;
}

/**
 * Shrani itinerer na strežnik in vrne deljivo povezavo.
 * Meta: POST /api/itinerary/save { itinerary, formData, name? }
 *       → { success, shareId, url: "/pot/xxx" }
 */
export async function saveItinerary(
  itinerary: Itinerary,
  formData: PlannerInput,
  name?: string
): Promise<SaveItineraryResult> {
  let res: Response;
  try {
    res = await fetch("/api/itinerary/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itinerary, formData, name }),
    });
  } catch {
    throw new Error("Shranjevanje ni uspelo — preveri povezavo.");
  }

  if (!res.ok) {
    let message = "Shranjevanje ni uspelo — poskusi znova.";
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // ignoriraj — uporabi privzeto sporočilo
    }
    throw new Error(message);
  }

  const data = (await res.json()) as {
    success?: boolean;
    shareId?: string;
    url?: string;
  };
  if (!data?.success || !data?.url || !data?.shareId) {
    throw new Error("Shranjevanje ni uspelo — poskusi znova.");
  }
  return { shareId: data.shareId, url: data.url };
}

/**
 * Pridobi deljen itinerer po shareId (URL parameter "odpri").
 * Meta: GET /api/itinerary/shared/[shareId]
 *       → { success, name, itinerary, createdAt, views }
 */
export async function fetchSharedItinerary(
  shareId: string
): Promise<SharedItineraryResult> {
  let res: Response;
  try {
    res = await fetch(
      `/api/itinerary/shared/${encodeURIComponent(shareId)}`,
      { cache: "no-store" }
    );
  } catch {
    throw new Error("Deljenega načrta ni bilo mogoče odpreti.");
  }

  if (!res.ok) {
    throw new Error("Deljenega načrta ni bilo mogoče odpreti.");
  }

  const data = (await res.json()) as {
    success?: boolean;
    name?: string | null;
    itinerary?: Itinerary;
    createdAt?: string | null;
    views?: number;
  };

  if (!data?.success || !data?.itinerary || !Array.isArray(data.itinerary.days)) {
    throw new Error("Deljenega načrta ni bilo mogoče odpreti.");
  }

  return {
    name: data.name ?? null,
    itinerary: data.itinerary,
    createdAt: data.createdAt ?? null,
    views: data.views ?? 0,
  };
}
