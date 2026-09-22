// ============================================================================
// TRAVEL SUPPLY MAP — OWN ADAPTER (TASK 84, 1.75.0)
// ============================================================================
// DESETI realni SupplyAdapter — zadnji provider BREZ zunanjih poverilnic:
// LASTNA TRŽNICA (Listing v lastni DB). Do zdaj je bil register-vnos
// „own" zamrznjen na active:false, ker Listing ni imel koordinat — geo
// stolpca (lat/lng, schema TASK 84) to odpirata.
//
// KANONSKA PRESLIKAVA (brez spremembe kanonskega modela):
//  - type:            Listing.category → kanonski tip (hotel → accommodation,
//                     restaurant|bar → restaurant, activity → activity,
//                     shop → shop, transport → transport, other → poi)
//  - providerProductId: listing.id → id "own:{listingId}"
//  - geo:             lat/lng IZKLJUČNO kadar OBSTAJO (partner/admin vnos) —
//                     geoPrecision "exact"; listing BREZ koordinat je
//                     iskreno IZPUSTEN (nikoli ne izmišljamo lokacije)
//  - cena:            ODSOTNA (priceRange €|€€|€€€ je OBSEG, ne cena —
//                     PriceInfo zahteva številko; ne lažemo z izmišljeno)
//  - razpoložljivost: ODSOTNA (not_supported — lastni koncept je Stripe
//                     checkout, ne živi koledar; polje izpuščeno po dogovoru)
//  - bookingMode:     own_marketplace (rezervacija prek naše tržnice —
//                     produkt modal ponuja „dodaj v načrt"; /go NIKOLI)
//  - sourceUrl:       listing.website (SAMO validiran http(s) — sicer
//                     izpuščen; render plast je NEODVISNA druga meja)
//  - slika:           PRVA iz images JSON (SAMO validiran http(s) — slike
//                     nalagajo partnerji, javni vnos ima obe meji)
//  - ocena:           rating/reviewCount SAMO kadar > 0 (0 = ni podatka)
//  - lastUpdated:     updatedAt (čas ZADNJEGA urejanja partnerja)
//
// GATES (iskrenost, fail-closed — isti vzorec kot fsq „no-dataset"):
//  - listing brez koordinat → NE pride v sloj (poizvedba že filtrira:
//    status published AND lat NOT NULL AND lng NOT NULL);
//  - prazna tržnica → [] + opomba „no-listings";
//  - brez bbox → [] + opomba „no-bbox" (viewport model, kot osm/fsq);
//  - DB napaka → MEČE (runner ujame → degraded[], ostali adapterji
//    nadaljujejo — ni tihega praznega sloja ob podrti bazi).
//
// VIEWPORT: poizvedba po bbox-u (točke v okviru) + vidni kategoriji
// (q.cats) + zoom gating v runnerju (minZoom 10, usklajeno z osm —
// lastna tržnica je redkost, državni pogled z9− je brez produktov).
//
// NIMREŽJA: lokalna DB (prek @/lib/db, lazy) — maxCallsPerMin 0,
// timeoutMs 10 s. Testi vbrizgajo lastnega klienta (createOwnAdapterWithDb).
// ============================================================================

import type { ProviderProduct, SupplyQuery } from "../../types";
import type { ProviderRegistryEntry } from "../../registry";
import type { SupplyAdapter } from "../../adapter";
import { isSafeHttpUrl } from "../../../external-url";

/** Kapika rezultatov adapterja (tržnica je redka — globalni kap po zoomu
 *  doda search.ts; poizvedba vzame 2× toliko vrstic za viewport filter). */
export const OWN_MAX_RESULTS = 60;

// ---------------------------------------------------------------------------
// VRSTICE IZ DB (izbira v adapterju — samo polja, ki jih preslikava rabi)
// ---------------------------------------------------------------------------

export interface OwnListingRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  address: string;
  images: string;
  rating: number;
  reviewCount: number;
  phone: string | null;
  openingHours: string | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
  updatedAt: Date;
}

/** Argumenti findMany poizvedbe (struktura, ki jo adapter pošlje — Prisma
 *  orderBy je SEZNAM objektov; testni maketa sprejme isti tipek). */
export interface OwnListingQueryArgs {
  where: {
    status: string;
    lat: { not: null };
    lng: { not: null };
  };
  select: Record<string, boolean>;
  take: number;
  orderBy: Array<Record<string, "asc" | "desc">>;
}

/** Strukturalni tip DB klienta, ki ga adapter potrebuje (DI za teste). */
export type OwnDb = {
  listing: {
    findMany(args: OwnListingQueryArgs): Promise<OwnListingRow[]>;
  };
};

// ---------------------------------------------------------------------------
// PRESLIKAVA Listing.category → KANONSKI TIP
// ---------------------------------------------------------------------------

/** Kanonski tip iz kategorije lokala (shemski komentar: hotel | restaurant
 *  | bar | activity | shop | transport | other). Neznan → „poi" (zajemalni,
 *  iskren — ne zavrnemo partnerja zaradi nove kategorije). */
export function ownCategoryToType(category: string): ProviderProduct["type"] {
  switch (category) {
    case "hotel":
      return "accommodation";
    case "restaurant":
    case "bar":
      return "restaurant";
    case "activity":
      return "activity";
    case "shop":
      return "shop";
    case "transport":
      return "transport";
    default:
      return "poi";
  }
}

/** Prva veljavna http(s) slika iz images JSON polja (partnerji nalagajo
 *  javno — OBA meji: tu + render plast). Neveljaven JSON → brez slike. */
function firstSafeImage(imagesJson: string): string | undefined {
  try {
    const arr: unknown = JSON.parse(imagesJson);
    if (!Array.isArray(arr)) return undefined;
    for (const u of arr) {
      if (typeof u === "string" && isSafeHttpUrl(u)) return u;
    }
  } catch {
    // pokvarjen JSON — brez slike (NE padamo zaradi partnerjevega vnosa)
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// NORMALIZACIJA LISTINGA → KANONSKI PRODUKT (čista funkcija — testirljiva)
// ---------------------------------------------------------------------------

export function mapOwnListing(row: OwnListingRow): ProviderProduct | null {
  // Koordinate so OBVEZNE za pin (query že filtrira — varovalka za ročne
  // klice/drift: neveljavna števila zavrnemo, ne popravljamo).
  if (
    typeof row.lat !== "number" ||
    typeof row.lng !== "number" ||
    !Number.isFinite(row.lat) ||
    !Number.isFinite(row.lng) ||
    Math.abs(row.lat) > 90 ||
    Math.abs(row.lng) > 180
  ) {
    return null;
  }

  const title = row.name?.trim();
  if (!title) return null; // ime je NOT NULL v shemi — varovalka

  return {
    id: `own:${row.id}`,
    provider: "own",
    providerProductId: row.id,
    type: ownCategoryToType(row.category),
    subcategory: row.category || undefined,
    title,
    description: row.description?.trim() || undefined,
    lat: row.lat,
    lng: row.lng,
    geoPrecision: "exact",
    address: row.address?.trim() || undefined,
    image: firstSafeImage(row.images ?? "[]"),
    // ocena SAMO kadar je dejansko podatke (> 0) — 0 = „ni ocen", ne „slabo"
    rating: row.rating > 0 ? row.rating : undefined,
    reviewCount: row.reviewCount > 0 ? row.reviewCount : undefined,
    // priceRange (€|€€|€€€) NI številčna cena → PriceInfo ODSOTEN (iskreno)
    // availability ODSOTEN (not_supported — Stripe checkout, ne koledar)
    bookingMode: "own_marketplace",
    // bookingUrl NI (rezervacija teče prek tržnice/načrta — NIKOLI /go)
    sourceUrl:
      row.website && isSafeHttpUrl(row.website) ? row.website : undefined,
    lastUpdated: new Date(row.updatedAt).toISOString(),
    phone: row.phone?.trim() || undefined,
    openingHours: row.openingHours?.trim() || undefined,
  };
}

/** Ali točka leži v bbox poizvedbe (viewport filter — isti kot fsq). */
function pointInBbox(
  lat: number,
  lng: number,
  bbox: [number, number, number, number]
): boolean {
  const [s, w, n, e] = bbox;
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

// ---------------------------------------------------------------------------
// STANJE ADAPTERJA (telemetrija zadnjega zagona — per instanca procesa)
// ---------------------------------------------------------------------------

let lastCachedFlag = false;
let lastSkippedCount = 0;
let lastNote: string | undefined = undefined;

/** Testni hak: počisti telemetrijo adapterja. */
export function resetOwnAdapterCaches(): void {
  lastCachedFlag = false;
  lastSkippedCount = 0;
  lastNote = undefined;
}

/** Diagnostika (testi/admin): zadnja opomba izvedbe adapterja. */
export function ownLastNote(): string | undefined {
  return lastNote;
}

// ---------------------------------------------------------------------------
// ADAPTER (DI: createOwnAdapterWithDb za teste; createOwnAdapter = lazy db)
// ---------------------------------------------------------------------------

export function createOwnAdapterWithDb(
  entry: ProviderRegistryEntry,
  dbClient: OwnDb
): SupplyAdapter {
  return {
    entry,

    async search(q: SupplyQuery): Promise<ProviderProduct[]> {
      lastCachedFlag = false;
      lastSkippedCount = 0;
      lastNote = undefined;

      // Viewport model: brez bbox ne moremo pošteno filtrirati (kot osm/fsq).
      if (!q.bbox) {
        lastNote = "no-bbox";
        return [];
      }

      // === DB GATE: SAMO objavljeni listingi S koordinatami (geo stolpca
      //     TASK 84). Listing brez lat/lng NIKOLI ne pride v sloj —
      //     poizvedba že izključi (fail-closed na strani vira).
      //     DB napaka MEČE naprej (runner → degraded — iskreno).
      const rows = await dbClient.listing.findMany({
        where: { status: "published", lat: { not: null }, lng: { not: null } },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          category: true,
          address: true,
          images: true,
          rating: true,
          reviewCount: true,
          phone: true,
          openingHours: true,
          website: true,
          lat: true,
          lng: true,
          updatedAt: true,
        },
        // Vrstni red po lastnem signalu tržnice: rating desc (koliko
        // dokazanih recenzij) → naziv asc (deterministično) — NE lastnega
        // rangiranja po planu/sponsored (to je tržna promocija, ne gostota).
        orderBy: [{ rating: "desc" }, { name: "asc" }],
        take: OWN_MAX_RESULTS * 2,
      });

      if (rows.length === 0) {
        // Prazna tržnica za to instanco (dev) — iskreno prazna plast
        // (enakovredno fsq „no-dataset": vir obstaja, podatka ni).
        lastNote = "no-listings";
        return [];
      }

      // === VRSTNI RED (in-memory po istem signalu kot orderBy zgoraj —
      //     deterministično NEODVISNO od tega, ali DB razvrsti izbran
      //     nabor): rating desc → ime asc. To je lastni signal tržnice
      //     (koliko dokazanih recenzij), NE komercialno rangiranje po
      //     planu/sponsored (to je tržna promocija, ne gostota sloja). ===
      rows.sort((a, b) => {
        const rd = (b.rating ?? 0) - (a.rating ?? 0);
        if (rd !== 0) return rd;
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      });

      // === VIEWPORT FILTER (pin v okviru) ===
      const inView = rows.filter((r) =>
        pointInBbox(r.lat as number, r.lng as number, q.bbox!)
      );
      if (inView.length === 0) {
        lastNote = "no-match";
        return [];
      }

      // === VIDNOST TIPOV (q.cats — runner pošlje zoom-gateane kategorije;
      //     isti vzorec kot osm/fsq: produkti IZVEN vidnih tipov NE pridejo
      //     v odgovor). ===
      let visible = inView;
      let catFiltered = 0;
      if (q.cats.length > 0) {
        const cats = q.cats;
        visible = inView.filter((r) => cats.includes(ownCategoryToType(r.category)));
        catFiltered = inView.length - visible.length;
        if (visible.length === 0) {
          lastNote = "cat-filtered";
          return [];
        }
      }

      const capped = visible.length > OWN_MAX_RESULTS;
      const selected = capped ? visible.slice(0, OWN_MAX_RESULTS) : visible;

      // === KANONSKA PRESLIKAVA (fail-closed per listing) ===
      const products: ProviderProduct[] = [];
      let mappedSkipped = 0;
      for (const row of selected) {
        const p = mapOwnListing(row);
        if (p) products.push(p);
        else mappedSkipped++;
      }

      // Telemetrija zavrnjenih: preslikave, ki so padle (neveljavne
      // koordinate/prazno ime) — iskrenost „partial result".
      lastSkippedCount = mappedSkipped;

      const notes: string[] = [];
      if (catFiltered > 0) notes.push("cat-filtered");
      if (capped) notes.push("capped");
      lastNote = notes.length > 0 ? notes.join("+") : undefined;

      return products;
    },

    lastRunCached(): boolean {
      // Vedno false — živa DB poizvedba po vsakem zahtevku (NIKOLI
      // predpomnjeno; cacheTtlMs 0 v registru → odgovor no-store).
      return lastCachedFlag;
    },

    lastRunNote(): string | undefined {
      return lastNote;
    },

    lastRunSkipped(): number {
      return lastSkippedCount;
    },
  };
}

/** Produkcijska tovarna — lazy uvoz globalnega db klienta. */
export function createOwnAdapter(entry: ProviderRegistryEntry): SupplyAdapter {
  // Lazy zato, da adapter ostane uvozljiv v testih z lastnim klientom
  // (createOwnAdapterWithDb) brez konstruiranja glavnega klienta. Prvi
  // search resolva klient enkrat; telemetrija delegira na pravi adapter.
  let real: SupplyAdapter | null = null;
  return {
    entry,
    async search(q: SupplyQuery): Promise<ProviderProduct[]> {
      if (!real) {
        const { db } = await import("../../../db");
        real = createOwnAdapterWithDb(entry, db as unknown as OwnDb);
      }
      return real.search(q);
    },
    lastRunCached: () => real?.lastRunCached() ?? false,
    lastRunNote: () => real?.lastRunNote?.() ?? undefined,
    lastRunSkipped: () => real?.lastRunSkipped?.() ?? 0,
  };
}
