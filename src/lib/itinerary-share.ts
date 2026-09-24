// Deljenje/shranjevanje itinererja — client helper za /api/itinerary/save
// in /api/itinerary/shared/[shareId].
//
// Uporaba: ItineraryPlanner + TripTimeline ("Shrani" gumb).

import type { Itinerary, PlannerInput } from "./types";

export interface SaveItineraryResult {
  shareId: string;
  /** Relativna pot, npr. "/pot/abc123" */
  url: string;
  /**
   * F7 (vodniki): tajni žeton za urejanje vodnika — shranjen v localStorage
   * pod editTokenStorageKey(shareId). Shranjevalnik ga uporabi na /pot strani.
   */
  editToken?: string;
}

export interface SharedItineraryResult {
  name: string | null;
  itinerary: Itinerary;
  createdAt: string | null;
  views: number;
}

/**
 * F7 (vodniki): localStorage ključ za tajni žeton vodnika dane poti.
 * Žeton obstaja SAMO v brskalniku tistega, ki je pot shranil — obiskovalci
 * deljene povezave ga nimajo (vidijo le prikaz vodnika, ne obrazca).
 */
const editTokenStorageKey = (shareId: string) => `dsa_edit_token_${shareId}`;

/** F7: preberi tajni žeton vodnika (null = ta brskalnik ni lastnik/pot je stara). */
export function getEditToken(shareId: string): string | null {
  if (typeof window === "undefined" || !shareId) return null;
  try {
    return window.localStorage.getItem(editTokenStorageKey(shareId));
  } catch {
    return null; // zasebni način — vodnik ni mogoč, prikaz pa da
  }
}

/** F7: shrani tajni žeton vodnika (kliče se ob uspešnem shranjevanju). */
function storeEditToken(shareId: string, editToken: string): void {
  try {
    window.localStorage.setItem(editTokenStorageKey(shareId), editToken);
  } catch {
    // zasebni način — žeton izgubi, vodnik ne bo mogoč (iskrena omejitev)
  }
}

/**
 * Shrani itinerer na strežnik in vrne deljivo povezavo.
 * Meta: POST /api/itinerary/save { itinerary, formData, name? }
 *       → { success, shareId, url: "/pot/xxx", editToken }
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
    editToken?: string;
  };
  if (!data?.success || !data?.url || !data?.shareId) {
    throw new Error("Shranjevanje ni uspelo — poskusi znova.");
  }
  // F7: žeton vodnika takoj v localStorage — lastnik ga lahko uporabi
  // na svoji deljeni strani (isti brskalnik)
  if (data.editToken) storeEditToken(data.shareId, data.editToken);
  // F5.7: takoj "ogrej" offline predpomnilnik — sveže shranjen načrt je
  // s tem na voljo tudi brez povezave (offline.html ga izriše iz cache-a).
  warmOfflinePlanCache(data.shareId, data.editToken);
  return { shareId: data.shareId, url: data.url, editToken: data.editToken };
}

/**
 * F5.7 (PWA offline): "ogrej" offline predpomnilnik za ta načrt.
 *
 * Fire-and-forget GET na /api/itinerary/shared/[shareId]?warm=1 — service
 * worker (dai-plans-v1) odgovor shrani, offline.html ga nato izriše BREZ
 * strežnika. `warm=1` pomeni BREZ štetja ogleda (iskrena števca — ogled
 * šteje samo pravi ogled strani/plannerja, ne ogrevanje predpomnilnika).
 * Nikoli ne vrže in ne blokira klicatelja.
 *
 * ISSUE #4 §13 (val 2): ZASEBNE pote (isPublic=false) zahtevajo
 * editToken glavo — ogrevanje se zgodi v lastnikovem brskalniku tik ob
 * shranjevanju, žeton je na voljo.
 */
export function warmOfflinePlanCache(
  shareId: string,
  editToken?: string | null
): void {
  if (typeof window === "undefined" || !shareId) return;
  try {
    void fetch(
      `/api/itinerary/shared/${encodeURIComponent(shareId)}?warm=1`,
      {
        ...(editToken
          ? { headers: { "x-dsa-edit-token": editToken } }
          : {}),
      }
    )
      .then((r) => {
        // Premečkaj telo, da se povezava sprosti (SW je že kloniral).
        void r.text().catch(() => {});
        return null;
      })
      .catch(() => {
        // offline/napaka — predpomnilnik se ogreje ob naslednji priložnosti
      });
  } catch {
    // tiho (zasebni način)
  }
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
