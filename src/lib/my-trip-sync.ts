// TASK 8 / F2-A (Issue #8 Faza 2): STREŽNIŠKA SINHRONIZACIJA ZBIRKE "MOJA POT".
//
// Problem: zbirka (localStorage `dai:my-trip-items`, src/lib/my-trip.ts) je
// doslej živela SAMO na napravi — prijava na drugi telefon/prenosniku je
// pomenila "prazno zbirko" (Mindtrip/Google Maps "Want to go" imata zbirko
// VEZANO na račun). API: /api/my-trip (union-merge push + FIFO kapa 200 +
// eksplicitni DELETE za odstranjevanja).
//
// Protokol v1 (dokumentirane meje — vse blagodejalne, nikoli destruktivne):
//  1. PRIJAVA/REGISTRACIJA (syncMyTripToServer): push celotne lokalne
//     zbirke (union-merge gor) + replace lokalne z odgovorom strežnika
//     (union vključuje lokalne dodane → zamenjava je BREZ IZGUBE; prinese
//     pa predmete z drugih naprav). Prazna lokalna → SAMO pull (GET).
//  2. RAZLIKE MED SEJO (startMyTripDiffSync): poslušalec na dogodke
//     zbirke (dai:my-trip-changed + cross-tab storage) računa diff proti
//     senci (shadow) in po debounce pošlje SAMO dodane/odstranjene —
//     dodajanja in odstranjevanja se širijo na vse površine (controlled
//     write-through vključno, ker vse pišejo prek istega modula).
//  3. /moja-potovanja mount prijavljenega uporabnika: syncMyTripToServer
//     (pull drugih naprav v živo).
//
// Vsak klic je NEBLOKIRAJOČ in fail-open: omrežna napaka NE sme pokvariti
// lokalne zbirke — strežnik ostane "zamujen" do naslednje sinhronizacije.
// Brez seje (gost) se NE naredi NIČ (zbirka ostaje čisto lokalna).
//
// Isti vzorci obrambe kot my-trip.ts: typeof window varovanje + try/catch.

import {
  getMyTripItems,
  addMyTripItem,
  subscribeMyTrip,
  myTripKey,
  MAX_MY_TRIP_ITEMS,
  type MyTripItem,
  type MyTripKind,
} from "@/lib/my-trip";

const SYNC_ENDPOINT = "/api/my-trip";

/** Klientna oblika predmeta, kot jo vrača /api/my-trip (ISO addedAt). */
export interface ServerMyTripItem {
  kind: string;
  refId: string;
  title: string;
  subtitle?: string;
  href: string;
  image?: string;
  source?: string;
  addedAt: string;
}

export interface MyTripSyncResult {
  /** Ali je sinhronizacija sploh stekla (false = gost/napaka/prazno oboje). */
  synced: boolean;
  /** Število predmetov po uspešni sinhronizaciji (lokalna = strežnik). */
  count: number;
  /** Število predmetov, ki jih je prinesla druga naprava (novo lokalno). */
  pulled: number;
}

/** Notranje: ali je predmet veljaven za zbirko (ponovna sanitizacija —
 * strežnik validira še enkrat, klient pa naj ne pošilja smeti). */
function asMyTripItem(raw: ServerMyTripItem): MyTripItem | null {
  try {
    const item: MyTripItem = {
      kind: raw.kind as MyTripKind,
      refId: String(raw.refId ?? ""),
      title: String(raw.title ?? ""),
      subtitle: raw.subtitle ? String(raw.subtitle) : undefined,
      href: String(raw.href ?? ""),
      image: raw.image ? String(raw.image) : undefined,
      source: raw.source ? String(raw.source) : undefined,
      addedAt:
        typeof raw.addedAt === "string" && !Number.isNaN(Date.parse(raw.addedAt))
          ? raw.addedAt
          : new Date().toISOString(),
    };
    if (!item.refId || !item.title || !item.href.startsWith("/")) return null;
    return item;
  } catch {
    return null;
  }
}

/**
 * Združi strežniški seznam v lokalno zbirko (union, dedup kind:refId) in
 * vrne število NOVIH lokalnih predmetov (prinesenih z drugih naprav).
 * Union (ne replace): lokalni offline dodanki iz čakanja fetch-a so varni
 * (race-safe — predmet dodan MED awaitom ne more izginiti).
 */
function mergeServerItemsIntoLocal(server: ServerMyTripItem[]): number {
  const local = getMyTripItems();
  const localKeys = new Set(local.map((i) => myTripKey(i.kind, i.refId)));
  let pulled = 0;
  for (const raw of server) {
    const item = asMyTripItem(raw);
    if (!item) continue;
    if (localKeys.has(myTripKey(item.kind, item.refId))) continue;
    // addMyTripItem doda na vrh (najnovejši prvi) — prek kanonske poti,
    // tako da so vsi invarianti (kapa, sanitizacija, dogodki) spoštovani.
    const { addedAt: _addedAt, ...input } = item;
    addMyTripItem(input);
    pulled += 1;
  }
  return pulled;
}

/**
 * SINHRONIZACIJA OB PRIJAVI / NA /moja-potovanja (F2-A točka 1 + 3).
 *
 * - Lokalna zbirka NEPRAZNA → POST (union-merge gor, FIFO kapa) →
 *   odgovor (celoten strežniški union) združi LOKALNO (union merge —
 *   race-safe: predmet dodan med fetch ostane).
 * - Lokalna zbirka PRAZNA → SAMO GET (pull — nov prenosnik/ipravna naprava).
 *
 * Neblokirajoče + fail-open: ob napaki vrne { synced: false } in lokalna
 * zbirka ostane nedotaknjena.
 */
export async function syncMyTripToServer(): Promise<MyTripSyncResult> {
  if (typeof window === "undefined") return { synced: false, count: 0, pulled: 0 };
  try {
    const local = getMyTripItems();
    const res = await fetch(SYNC_ENDPOINT, {
      method: local.length > 0 ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      ...(local.length > 0 ? { body: JSON.stringify({ items: local }) } : {}),
    });
    if (!res.ok) return { synced: false, count: local.length, pulled: 0 };

    const data = (await res.json().catch(() => ({}))) as { items?: ServerMyTripItem[] };
    if (!Array.isArray(data.items)) return { synced: true, count: local.length, pulled: 0 };

    const serverItems = data.items.slice(0, MAX_MY_TRIP_ITEMS);
    const pulled = mergeServerItemsIntoLocal(serverItems);
    return { synced: true, count: getMyTripItems().length, pulled };
  } catch {
    // Omrežje zamuja — lokalna zbirka ostaja resnica naprave
    return { synced: false, count: getMyTripItems().length, pulled: 0 };
  }
}

/** Notranje: pošlji samo RAZLIKo (dodani predmeti) na strežnik. */
async function pushAddedToServer(added: MyTripItem[]): Promise<boolean> {
  if (added.length === 0) return true;
  try {
    const res = await fetch(SYNC_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: added }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Notranje: eksplicitno odstrani predmete s strežnika (diff propagation). */
async function deleteRemovedOnServer(
  removed: Array<{ kind: MyTripKind; refId: string }>
): Promise<boolean> {
  let allOk = true;
  for (const { kind, refId } of removed) {
    try {
      const res = await fetch(SYNC_ENDPOINT, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, refId }),
      });
      if (!res.ok) allOk = false;
    } catch {
      allOk = false;
    }
  }
  return allOk;
}

export interface MyTripDiffSyncStop {
  (): void;
}

/**
 * ZAGON RAZLIČNE SINHRONIZACIJE (F2-A točka 2) — vrne stop funkcijo.
 *
 * Posluša dogodke zbirke (ista zavihek + cross-tab). Ob vsaki spremembi
 * (po debounce MS) izračuna diff proti senci (shadow snapshot iz zadnje
 * uspešno videne stanje) in pošlje SAMO dodane (POST union) + odstranjene
 * (DELETE). Senco posodobi SAMO po uspešni oddaji — neuspešna oddaja pusti
 * senco pri stari vrednosti, tako da naslednji poskus ponovi celo razliko.
 */
export function startMyTripDiffSync(debounceMs = 2500): MyTripDiffSyncStop {
  if (typeof window === "undefined") return () => {};

  let shadow = getMyTripItems();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    const current = getMyTripItems();
    const shadowKeys = new Set(shadow.map((i) => myTripKey(i.kind, i.refId)));
    const currentKeys = new Set(current.map((i) => myTripKey(i.kind, i.refId)));

    const added = current.filter((i) => !shadowKeys.has(myTripKey(i.kind, i.refId)));
    const removed = shadow
      .filter((i) => !currentKeys.has(myTripKey(i.kind, i.refId)))
      .map((i) => ({ kind: i.kind, refId: i.refId }));

    if (added.length === 0 && removed.length === 0) {
      shadow = current;
      return;
    }

    const [addedOk, removedOk] = await Promise.all([
      pushAddedToServer(added),
      deleteRemovedOnServer(removed),
    ]);
    // Senca se premakne SAMO ob uspehu (retry celotne razlike drugič),
    // pri delnem uspehu pa vseeno (idempotenca upsert/DELETE to dopušča).
    if (addedOk && removedOk) {
      shadow = current;
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, debounceMs);
  };

  const unsubscribe = subscribeMyTrip(schedule);

  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
