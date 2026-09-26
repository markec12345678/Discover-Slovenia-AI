// "Moja pot" (my-trip) zbirka — TASK 8 / D8-B: kanonski ADD sloj (Issue #8).
//
// Problem (D8-A P-CTA-1 + P-STATE-1): "Dodaj v mojo pot" obstaja v 7
// nezdružljivih izvedbah in pripadnost poti ni nikjer izračunana po enem
// viru resnice — nobena površina ne more pošteno izrisati "V moji poti".
//
// Rešitev (Wanderlog/Mindtrip vzorec + Google Maps "Want to go"): ena
// lahka zbirka referenc (`dai:my-trip-items`) — ADD sloj. Zbirka NI
// razporejevalnik: razporejanje (NAČRTOVANO) ostaja v načrtovalniku
// (`/nacrtuj`), rezervacije v booking stanju, Go Mode v `dai:go-trip`.
// Zbirka hrani SAMO javne povzetke, ki so tako ali tako vidni na kartici
// (naslov, slika, globoka povezava). Brez PII.
//
// Obrambni vzorec sledi src/lib/wishlist-storage.ts: vsako branje/pisanje je
// ovito v try/catch — poln, zasebni ali pokvarjen localStorage NE sme sesesti
// aplikacije. Neveljavni vnosi se tiho preskočijo.

const STORAGE_KEY = "dai:my-trip-items";
const HANDOFF_KEY = "dai:my-trip-handoff";
const MAX_ITEMS = 200; // najnovejših 200 (FIFO — najstarejši odpade)
const TITLE_MAX_LENGTH = 160;
const SUBTITLE_MAX_LENGTH = 200;
const HREF_MAX_LENGTH = 300;
const IMAGE_MAX_LENGTH = 600;
const REFID_MAX_LENGTH = 128;
const SOURCE_MAX_LENGTH = 60;

/** Dogodki, ki jih ta modul sproži na window (ista zavihek + cross-tab). */
const MY_TRIP_CHANGED_EVENT = "dai:my-trip-changed";

export const MY_TRIP_STORAGE_KEY = STORAGE_KEY;
export const MY_TRIP_HANDOFF_KEY = HANDOFF_KEY;
export const MY_TRIP_CHANGED_EVENT_NAME = MY_TRIP_CHANGED_EVENT;
export const MAX_MY_TRIP_ITEMS = MAX_ITEMS;

/**
 * Vrste predmetov, ki jih zbirka sprejema (vsaka površina odkrivanja iz
 * D8-A §9 — slepe ulice — dobi kanonski dodaj).
 */
export type MyTripKind =
  | "destination"
  | "poi"
  | "listing"
  | "event"
  | "experience"
  | "product"
  | "guide"
  | "community"
  | "import"
  | "ai";

const KINDS: readonly MyTripKind[] = [
  "destination",
  "poi",
  "listing",
  "event",
  "experience",
  "product",
  "guide",
  "community",
  "import",
  "ai",
];

export interface MyTripItem {
  /** Vrsta predmeta (destinacija, dogodek, izkušnja …). */
  kind: MyTripKind;
  /** Stabilni ID znotraj vrste (slug/cuid/FSQ id …). */
  refId: string;
  title: string;
  /** Ena kontekstualna vrstica (regija, cena od, datum …). */
  subtitle?: string;
  /** Notranja globoka povezava za "Odpri" (relativna pot). */
  href: string;
  image?: string;
  /** Kje je bil predmet dodan (površina — za prikaz v "Moja pot"). */
  source?: string;
  addedAt: string; // ISO
}

/** Vnos brez addedAt — čas zapiše addMyTripItem sam. */
export type MyTripInput = Omit<MyTripItem, "addedAt">;

/** Identiteta predmeta — `kind:refId` (dedup, idempotenca). */
export function myTripKey(kind: MyTripKind, refId: string): string {
  return `${kind}:${refId}`;
}

interface StoredItem {
  kind: unknown;
  refId: unknown;
  title: unknown;
  subtitle: unknown;
  href: unknown;
  image: unknown;
  source: unknown;
  addedAt: unknown;
}

function str(value: unknown, max: number): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.slice(0, max);
}

/** Notranje: sanitiziraj posamezen vnos iz storage (null, če neveljaven). */
function sanitizeItem(item: StoredItem): MyTripItem | null {
  if (typeof item !== "object" || item === null) return null;
  if (typeof item.kind !== "string" || !KINDS.includes(item.kind as MyTripKind)) return null;
  const refId = str(item.refId, REFID_MAX_LENGTH);
  if (!refId) return null;
  const title = str(item.title, TITLE_MAX_LENGTH);
  if (!title) return null;
  const href = str(item.href, HREF_MAX_LENGTH);
  // href je obvezen — brez njega "Odpri" nima kam voditi
  if (!href || !href.startsWith("/") || href.startsWith("//")) return null;
  return {
    kind: item.kind as MyTripKind,
    refId,
    title,
    subtitle: str(item.subtitle, SUBTITLE_MAX_LENGTH),
    href,
    image: str(item.image, IMAGE_MAX_LENGTH),
    source: str(item.source, SOURCE_MAX_LENGTH),
    addedAt: typeof item.addedAt === "string" ? item.addedAt : new Date().toISOString(),
  };
}

/** Notranje: preberi zbirko iz localStorage (varno — pokvarjen ne sesuje app). */
function readMyTrip(): MyTripItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items: MyTripItem[] = [];
    for (const item of parsed as StoredItem[]) {
      const sanitized = sanitizeItem(item);
      if (sanitized) items.push(sanitized);
    }
    // Dedupliciraj po kind:refId (prvi = najnovejši pri zapisu) + kapaciteta
    const seen = new Set<string>();
    return items
      .filter((i) => {
        const key = myTripKey(i.kind, i.refId);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_ITEMS);
  } catch {
    // Poln ali pokvarjen localStorage — začnemo s prazno zbirko
    return [];
  }
}

/** Notranje: zapiši zbirko + obvesti naročnike (custom dogodek na window). */
function writeMyTrip(items: MyTripItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
    window.dispatchEvent(new CustomEvent(MY_TRIP_CHANGED_EVENT));
  } catch {
    // Poln/zasebni localStorage — mirno preskoči (brez notify: ni spremembe)
  }
}

export interface AddMyTripResult {
  /** true, če je bil vnos dejansko dodan (false = posodobil obstoječega). */
  added: boolean;
  /** Naslov najstarejšega predmeta, ki ga je FIFO odpodil (obveščanje UI). */
  evictedTitle?: string;
}

/**
 * Dodaj predmet v "Moja pot". Idempotentno: ponovni dodatek istega
 * `kind:refId` le osveži podatke in čas (dedup) — ne ustvari duplikata.
 */
export function addMyTripItem(input: MyTripInput): AddMyTripResult {
  if (typeof window === "undefined") return { added: false };
  try {
    const item = sanitizeItem(input as StoredItem);
    if (!item) return { added: false }; // neveljaven vnos → ne shranimo ničesar
    const key = myTripKey(item.kind, item.refId);
    const existed = readMyTrip().some((i) => myTripKey(i.kind, i.refId) === key);
    const rest = readMyTrip().filter((i) => myTripKey(i.kind, i.refId) !== key);
    // Najstarejši (zadnji) odpade, če kapaciteta presežena — FIFO
    let evictedTitle: string | undefined;
    if (rest.length + 1 > MAX_ITEMS) {
      evictedTitle = rest[rest.length - 1]?.title;
    }
    rest.unshift({ ...item, addedAt: new Date().toISOString() });
    writeMyTrip(rest);
    return { added: !existed, evictedTitle };
  } catch {
    // neblokirajoče
    return { added: false };
  }
}

/** Odstrani predmet iz zbirke (tiho, če ga ni). */
export function removeMyTripItem(kind: MyTripKind, refId: string): void {
  if (typeof window === "undefined") return;
  try {
    writeMyTrip(readMyTrip().filter((i) => !(i.kind === kind && i.refId === refId)));
  } catch {
    // neblokirajoče
  }
}

/** Izprazni celo zbirko (gumb v "Moja pot" pogledu). */
export function clearMyTripItems(): void {
  if (typeof window === "undefined") return;
  try {
    writeMyTrip([]);
  } catch {
    // neblokirajoče
  }
}

/** Ali je predmet (kind:refId) v "Moji poti"? */
export function isInMyTrip(kind: MyTripKind, refId: string): boolean {
  return readMyTrip().some((i) => i.kind === kind && i.refId === refId);
}

/** Celotna zbirka (najnovejši prvi). */
export function getMyTripItems(): MyTripItem[] {
  return readMyTrip();
}

/** Število predmetov v zbirki (števčna značka v navigaciji). */
export function myTripCount(): number {
  return readMyTrip().length;
}

/**
 * Naročnina na spremembe zbirke (ista zavihek + cross-tab).
 * Vrne odjavo. Uporabno za React hook: beri ob mountu + ob vsakem dogodku.
 */
export function subscribeMyTrip(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(MY_TRIP_CHANGED_EVENT, cb);
  // "storage" se sproži SAMO v drugih zavihkih — cross-tab sinhronizacija
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(MY_TRIP_CHANGED_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * HANDOFF — "Nadaljuj načrtovanje" iz "Moja pot" (D8-B §4):
 * zbirko shrani v sessionStorage in navigira na /nacrtuj, kjer jo načrtovalnik
 * prevzame kot "Iz moje poti" trak (enak vzorec kot heroQuery → /nacrtuj).
 */
export function setMyTripHandoff(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(HANDOFF_KEY, new Date().toISOString());
  } catch {
    // Zasebni način / poln sessionStorage — načrtovalnik prebere zbirko neposredno
  }
}

/** Ali čaka neprevzeti handoff iz "Moja pot"? (načrtovalnik ga ob mountu prevzame.) */
export function hasMyTripHandoff(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(HANDOFF_KEY) !== null;
  } catch {
    return false;
  }
}

/** Prevzemi (in počisti) handoff zastavico. */
export function consumeMyTripHandoff(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const had = sessionStorage.getItem(HANDOFF_KEY) !== null;
    sessionStorage.removeItem(HANDOFF_KEY);
    return had;
  } catch {
    return false;
  }
}
