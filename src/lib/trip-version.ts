// ============================================================================
// TASK 28 (Tier 1 #1) — LAHKOTNA SINHRONIZACIJA VERZIJE POTI (live-sync).
// ============================================================================
//
// „Wanderlog model" po ceni PWA: ni WebSocket/SSE/CRDT infrastrukture —
// odjemalec vsakih TRIP_VERSION_POLL_MS (20 s, SAMO ko je zavihek viden)
// pokliče GET /api/trip/[shareId]/version in primerja contentVersion z
// lokalno znano. Razlika → banner „načrt posodobljen drugje — Osveži".
//
// ISKRENOST (data honesty):
//  - fetchTripVersion ob KATERIKOLI napaki (omrežje/HTTP/shape) vrne null
//    in odjemalec UTIHNE — nikoli ne sklepamo „verjetno je nova verzija";
//  - resolveVersionStale zahteva STROGO novejšo strežniško verzijo
//    (server > known) — enaka verzija ni zastarelost, manjša ne more
//    nastopiti (contentVersion se samo povečuje, glej PATCH CAS);
//  - known === null pomeni „neznano" → NIKOLI ne trdimo zastarelosti.
// ============================================================================

/** Interval pollinga (viden zavihek): 20 s ≈ 180 klicev/h/zavihek. */
export const TRIP_VERSION_POLL_MS = 20_000;

/**
 * Največje število ZAPOREDNIH napak pollinga, preden utihne do naslednje
 * spremembe vidnosti (pogosto offline/nedosegljiv strežnik → nehamo
 * potrato); sprememba vidnosti (zavihek spet viden) števec ponastavi.
 */
export const TRIP_VERSION_MAX_CONSECUTIVE_ERRORS = 5;

export interface TripVersion {
  contentVersion: number;
  updatedAt: string;
}

/**
 * Čista odločitev o zastarelosti (enota-testabilna, brez I/O):
 * zastarelo SAMO kadar poznamo lokalno verzijo in je strežniška STROGO
 * novejša. Karkoli drugega (enako / neznano / nižje) = ni zastarelo.
 */
export function resolveVersionStale(
  known: number | null | undefined,
  server: number
): boolean {
  return typeof known === "number" && server > known;
}

/**
 * Pridobi trenutno verzijo poti. Vsaka napaka (omrežje, ne-2xx, napačen
 * shape) → null (iskren „ne vemo" — klicatelj utihne, ne ugiba).
 */
export async function fetchTripVersion(
  shareId: string
): Promise<TripVersion | null> {
  let res: Response;
  try {
    res = await fetch(`/api/trip/${encodeURIComponent(shareId)}/version`, {
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as {
    success?: boolean;
    contentVersion?: number;
    updatedAt?: string;
  } | null;
  if (
    !data?.success ||
    typeof data.contentVersion !== "number" ||
    typeof data.updatedAt !== "string"
  ) {
    return null;
  }
  return { contentVersion: data.contentVersion, updatedAt: data.updatedAt };
}
