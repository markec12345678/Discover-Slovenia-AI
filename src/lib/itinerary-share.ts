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
  /**
   * TASK 28 (live-sync): strežniška contentVersion (additivno v API).
   * null = strežnik je ni poslal (starejša različica) → klicatelj nikoli
   * ne ugiba (CAS baza ostaja neznana → PATCH na mestu se NE izvede).
   */
  contentVersion: number | null;
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
 * ISSUE #4 §22 (val 5): POSODOBI obstoječo pot na mestu (PATCH, CAS) —
 * namesto novega shareId ob vsakem shranjevanju. Vrne novo contentVersion;
 * strežnik STARO vsebino arhivira kot revizijo (revisionSaved) → obnovitev
 * je možna. 409 = sočasno urejanje (klient odloči: ponovno naloži).
 */
export async function updateItinerary(
  shareId: string,
  itinerary: Itinerary,
  baseVersion: number,
  name?: string
): Promise<{
  contentVersion: number;
  revisionSaved: boolean;
  name: string | null;
}> {
  const editToken = getEditToken(shareId);
  let res: Response;
  try {
    res = await fetch(
      `/api/itinerary/shared/${encodeURIComponent(shareId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(editToken ? { "x-dsa-edit-token": editToken } : {}),
        },
        body: JSON.stringify({
          baseVersion,
          itinerary,
          ...(name !== undefined ? { name } : {}),
        }),
      }
    );
  } catch {
    throw new Error("Posodabljanje ni uspelo — preveri povezavo.");
  }

  const data = (await res.json().catch(() => null)) as {
    success?: boolean;
    contentVersion?: number;
    revisionSaved?: boolean;
    name?: string | null;
    error?: string;
    conflict?: boolean;
  } | null;

  if (res.status === 409 || data?.conflict) {
    throw new Error(
      "Pot je bila med tem spremenjena (sočasno urejanje) — osveži podatke in poskusi znova."
    );
  }
  if (!res.ok || !data?.success || typeof data.contentVersion !== "number") {
    throw new Error(data?.error ?? "Posodabljanje ni uspelo — poskusi znova.");
  }
  return {
    contentVersion: data.contentVersion,
    revisionSaved: data.revisionSaved === true,
    name: data.name ?? null,
  };
}

/**
 * ISSUE #4 §22 (val 5): metapodatki zgodovine revizij (brez vsebine).
 * Vloga ≥ EDITOR (editToken/seja) — drugače API zavrne.
 */
export interface RevisionMeta {
  version: number;
  name: string | null;
  authorRole: string;
  createdAt: string;
  sizeBytes: number;
}

export async function fetchTripRevisions(
  shareId: string
): Promise<{ currentVersion: number | null; revisions: RevisionMeta[] }> {
  const editToken = getEditToken(shareId);
  let res: Response;
  try {
    res = await fetch(
      `/api/itinerary/shared/${encodeURIComponent(shareId)}/revisions`,
      {
        ...(editToken ? { headers: { "x-dsa-edit-token": editToken } } : {}),
        cache: "no-store",
      }
    );
  } catch {
    throw new Error("Zgodovine verzij ni bilo mogoče naložiti.");
  }
  if (!res.ok) {
    throw new Error("Zgodovina verzij ni dosegljiva (zahteva vlogo urejevalca).");
  }
  const data = (await res.json()) as {
    success?: boolean;
    currentVersion?: number | null;
    revisions?: RevisionMeta[];
  };
  if (!data?.success || !Array.isArray(data.revisions)) {
    throw new Error("Zgodovine verzij ni bilo mogoče naložiti.");
  }
  return {
    currentVersion: data.currentVersion ?? null,
    revisions: data.revisions,
  };
}

/**
 * ISSUE #4 §22 (val 5): CELA vsebina dane revizije (za obnovitev).
 * Vrne ITINERER — obnovitev naredi klient z updateItinerary (PATCH s
 * CAS; obnovitev sama zapiše revizijo trenutne vsebine — sledenje celo).
 */
export async function fetchTripRevisionContent(
  shareId: string,
  version: number
): Promise<Itinerary> {
  const editToken = getEditToken(shareId);
  let res: Response;
  try {
    res = await fetch(
      `/api/itinerary/shared/${encodeURIComponent(shareId)}/revisions?version=${encodeURIComponent(
        String(version)
      )}`,
      {
        ...(editToken ? { headers: { "x-dsa-edit-token": editToken } } : {}),
        cache: "no-store",
      }
    );
  } catch {
    throw new Error("Revizije ni bilo mogoče naložiti.");
  }
  if (!res.ok) {
    throw new Error("Revizija ni dosegljiva.");
  }
  const data = (await res.json()) as {
    success?: boolean;
    itinerary?: Itinerary;
  };
  if (!data?.success || !data.itinerary || !Array.isArray(data.itinerary.days)) {
    throw new Error("Revizija je neveljavna.");
  }
  return data.itinerary;
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
    contentVersion?: number;
  };

  if (!data?.success || !data?.itinerary || !Array.isArray(data.itinerary.days)) {
    throw new Error("Deljenega načrta ni bilo mogoče odpreti.");
  }

  return {
    name: data.name ?? null,
    itinerary: data.itinerary,
    createdAt: data.createdAt ?? null,
    views: data.views ?? 0,
    // TASK 28: samo izrecno številčna vrednost (starejši strežniki je ne
    // pošiljajo) — nikoli ne pretvorimo "neznano" v 0 (to bi lažno CASalo).
    contentVersion:
      typeof data.contentVersion === "number" ? data.contentVersion : null,
  };
}
