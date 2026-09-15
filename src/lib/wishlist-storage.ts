// "Priljubljene" (wishlist) — localStorage MVP za anonimne popotnike (FW2-B)
//
// Problem (iz MT-B inventarja): popotnik ne more shraniti izkušnje/izdelka,
// ki ga zanima — brez računa ni načina, da se vrne k zanimivim ponudbam.
//
// Rešitev (Booking.com/Airbnb-style): srček na kartici/modalu shrani minimalen
// javni povzetek v localStorage (ključ "dai:my-wishlist"). Wishlist Sheet v
// navigaciji seznam prikaže; klik na vnos odpre pripadajoči modal v tržnici
// prek custom dogodka (glej WISHLIST_OPEN_EVENT spodaj).
//
// Zasebnost: shranjujemo SAMO javne podatke, ki so tako ali tako vidni na
// kartici (ime, slika, cena, destinacija, slug). Brez PII.
//
// Obrambni vzorec sledi src/lib/my-trips-storage.ts: vsako branje/pisanje je
// ovito v try/catch — poln, zasebni ali pokvarjen localStorage NE sme sesesti
// aplikacije. Neveljavni vnosi se tiho preskočijo.

const STORAGE_KEY = "dai:my-wishlist";
const MAX_ITEMS = 60; // zadnjih 60 shranjenih (FIFO — najstarejši odpade)
const NAME_MAX_LENGTH = 120;
const IMAGE_MAX_LENGTH = 600;
const ID_MAX_LENGTH = 64;
const SLUG_MAX_LENGTH = 160;

/** Dogodki, ki jih ta modul sproži na window (notranja sinkronizacija UI). */
const WISHLIST_CHANGED_EVENT = "dai:wishlist-changed";

/**
 * Dogodki, ki jih wishlist UI sproži, da tržnica odpre pripadajoči modal.
 * Zakaj custom dogodek: Navigation (srček v glavi) in MarketplaceSection
 * (modali) sta sorojenca v page.tsx — dogodek je najčistejše ohlapno
 * povezovanje brez dvigovanja stanja čez celotno stran.
 */
export const WISHLIST_OPEN_EVENT = "dai:open-from-wishlist";

export type WishlistType = "experience" | "product";

export interface WishlistEntry {
  /** ID zapisa (Prisma cuid — unikaten prek tabel izkušenj/izdelkov). */
  id: string;
  type: WishlistType;
  name: string;
  image: string | null;
  price: number | null;
  destination: string | null;
  /** Slug za poizvedbo /api/{experiences|products}/[slug], če vnos ni v naloženem seznamu. */
  slug: string | null;
  savedAt: string; // ISO
}

/** Vnos brez savedAt — čas zapiše addToWishlist sam. */
export type WishlistInput = Omit<WishlistEntry, "savedAt">;

export interface WishlistOpenDetail {
  type: WishlistType;
  id: string;
  slug: string | null;
}

interface StoredEntry {
  id: unknown;
  type: unknown;
  name: unknown;
  image: unknown;
  price: unknown;
  destination: unknown;
  slug: unknown;
  savedAt: unknown;
}

/** Notranje: sanitiziraj posamezen vnos iz storage (null, če neveljaven). */
function sanitizeEntry(entry: StoredEntry): WishlistEntry | null {
  if (typeof entry !== "object" || entry === null) return null;
  if (typeof entry.id !== "string" || !entry.id.trim() || entry.id.length > ID_MAX_LENGTH) {
    return null;
  }
  if (entry.type !== "experience" && entry.type !== "product") return null;
  if (typeof entry.name !== "string" || !entry.name.trim()) return null;
  const price =
    typeof entry.price === "number" && Number.isFinite(entry.price) && entry.price >= 0
      ? entry.price
      : null;
  return {
    id: entry.id,
    type: entry.type,
    name: entry.name.slice(0, NAME_MAX_LENGTH),
    image:
      typeof entry.image === "string" && entry.image.trim()
        ? entry.image.slice(0, IMAGE_MAX_LENGTH)
        : null,
    price,
    destination:
      typeof entry.destination === "string" && entry.destination.trim()
        ? entry.destination.slice(0, NAME_MAX_LENGTH)
        : null,
    slug:
      typeof entry.slug === "string" && entry.slug.trim()
        ? entry.slug.slice(0, SLUG_MAX_LENGTH)
        : null,
    savedAt: typeof entry.savedAt === "string" ? entry.savedAt : new Date().toISOString(),
  };
}

/** Notranje: preberi seznam iz localStorage (varno — pokvarjen ne sesuje app). */
function readWishlist(): WishlistEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries: WishlistEntry[] = [];
    for (const entry of parsed as StoredEntry[]) {
      const sanitized = sanitizeEntry(entry);
      if (sanitized) entries.push(sanitized);
    }
    // Dedupliciraj po id (prvi = najnovejši pri zapisu) in omeji kapaciteto
    const seen = new Set<string>();
    return entries
      .filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      })
      .slice(0, MAX_ITEMS);
  } catch {
    // Poln ali pokvarjen localStorage — začnemo s praznim seznamom
    return [];
  }
}

/** Notranje: zapiši seznam + obvesti naročnike (custom dogodek na window). */
function writeWishlist(entries: WishlistEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ITEMS)));
    window.dispatchEvent(new CustomEvent(WISHLIST_CHANGED_EVENT));
  } catch {
    // Poln/zasebni localStorage — mirno preskoči (brez notify: ni spremembe)
  }
}

/**
 * Shrani izkušnjo/izdelek med priljubljene. Ponovno shranjevanje istega ID-ja
 * le osveži podatke in čas (dedup) — ne ustvari duplikata.
 */
export function addToWishlist(input: WishlistInput): void {
  if (typeof window === "undefined") return;
  try {
    const entry = sanitizeEntry(input as StoredEntry);
    if (!entry) return; // neveljaven vnos → ne shranimo ničesar
    const rest = readWishlist().filter((e) => e.id !== entry.id);
    rest.unshift({ ...entry, savedAt: new Date().toISOString() });
    writeWishlist(rest); // unshift = najnovejši prvi; slice ohrani zadnjih 60
  } catch {
    // neblokirajoče
  }
}

/** Odstrani vnos iz priljubljenih (tiho, če ga ni). */
export function removeFromWishlist(id: string): void {
  if (typeof window === "undefined" || typeof id !== "string") return;
  try {
    writeWishlist(readWishlist().filter((e) => e.id !== id));
  } catch {
    // neblokirajoče
  }
}

/** Ali je zapis (po ID-ju) med priljubljenimi? */
export function isWishlisted(id: string): boolean {
  return readWishlist().some((e) => e.id === id);
}

/** Cel seznam priljubljenih (najnovejši prvi). */
export function getWishlist(): WishlistEntry[] {
  return readWishlist();
}

/**
 * Naročnina na spremembe wishlist-a (ista zavihek + cross-tab).
 * Vrne odjavo. Uporabno za React hook: beri ob mountu + ob vsakem dogodku.
 */
export function subscribeWishlist(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(WISHLIST_CHANGED_EVENT, cb);
  // "storage" se sproži SAMO v drugih zavihkih — cross-tab sinhronizacija
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(WISHLIST_CHANGED_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Odpri vnos iz wishlist-a v tržnici: sproži dogodek, na katerega posluša
 * MarketplaceSection (preklopi tab, odpre modal).
 * Klicatelj (Sheet) naj se pred tem zapre.
 *
 * FW3: MarketplaceSection živi na /tržnica. Če uporabnik ni na tej strani,
 * se namen shrani v sessionStorage in navigira — tržnica ga ob mountu
 * prevzame (enak vzorec kot heroQuery → /načrtuj).
 */
export const WISHLIST_PENDING_KEY = "dai:wishlist-pending-open";

export function openFromWishlist(detail: WishlistOpenDetail): void {
  if (typeof window === "undefined") return;

  if (document.getElementById("trznica")) {
    window.dispatchEvent(new CustomEvent<WishlistOpenDetail>(WISHLIST_OPEN_EVENT, { detail }));
  } else {
    try {
      sessionStorage.setItem(WISHLIST_PENDING_KEY, JSON.stringify(detail));
    } catch {
      // Zasebni način / poln sessionStorage — mirno preskoči
    }
    window.location.assign("/trznica");
  }
}
