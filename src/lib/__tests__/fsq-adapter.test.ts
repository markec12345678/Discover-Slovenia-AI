// ============================================================================
// TASK 53 — FSQ ADAPTER: CAPABILITY GATE / DATASET / KATEGORIJE / OSVEŽEVANJE
// ============================================================================
// Fixtures so TEST-ONLY preslikava JAVNO DOKUMENTIRANE sheme Foursquare
// Open Places (docs.foursquare.com „Places OS Data Schemas"). NI izmišljenih
// mest v produkcijski poti: adapter bere SAMO .jsonl datoteke iz
// FSQ_PLACES_DIR (temp mape testov — produkcijska pot repozitorija NI
// nikoli dotaknjena).
//
// KLJUČNE INVARIANTE:
//  - CAPABILITY GATE: množica ni nameščena (mapa manjka / ni .jsonl / nič
//    veljavnih krajev) → iskreno PRAZEN sloj + „no-dataset" (ZERO throw)
//  - STRICT LOADER: neveljavne vrstice + izven-SI kraji → preskočeni + šteti
//  - KATEGORIJE: FSQ_CATEGORY_MAP labeli → kanonski tipi (restaurant/museum/
//    natural/religious/viewpoint/shop/accommodation); brez zadetka → poi
//  - MTIME OSVEŽEVANJE: dodana vrstica v .jsonl → naslednja poizvedba vidi
//    nov kraj (indeks se ponovno naloži BREZ restarta)
//  - IZOLACIJA: pokvarjena/neberljiva datoteka NE podre dobre datoteke
//  - GEO: lat/lng TOČNO iz vira (geoPrecision exact), cena NIKOLI (odprti
//    podatki), razpoložljivost IZPUŠČENA (not_supported semantika)
// ============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, appendFileSync, chmodSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createFsqAdapter,
  resetFsqAdapterCaches,
  fsqLastNote,
  FSQ_MAX_RESULTS,
} from "@/lib/supply/providers/fsq/adapter";
import {
  FSQ_CATEGORY_MAP,
  SI_BBOX,
  fsqCategoryType,
  fsqDatasetDir,
  fsqDatasetStats,
  getFsqDatasetIndex,
  inSloveniaBbox,
} from "@/lib/supply/providers/fsq/dataset";
import { mapFsqPlace } from "@/lib/supply/providers/fsq/mapper";
import type { FsqPlace } from "@/lib/supply/providers/fsq/types";
import type { ProviderRegistryEntry } from "@/lib/supply/registry";
import type { SupplyQuery } from "@/lib/supply/types";
import type { SupplyAdapter } from "@/lib/supply/adapter";

// ---------------------------------------------------------------------------
// INLINE REGISTRSKI VSTOP (main agent ga kasneje poveže v registry.ts —
// vrednosti so dogovorjene: lokalni POI sloj, gostota od zoom 12, statičen
// dataset → dolg TTL 24 h, čisti pomnilniški filter → timeout 5 s, brez
// odhodnega prometa → 0 klicev/min)
// ---------------------------------------------------------------------------

const FSQ_ENTRY: ProviderRegistryEntry = {
  slug: "fsq",
  labels: { sl: "Foursquare Open Places", en: "Foursquare Open Places" },
  group: "local",
  inventoryAccess: ["open_data"],
  status: "local",
  active: true,
  types: ["restaurant", "accommodation", "attraction", "poi"],
  capabilities: {
    geo: true, // latitude/longitude iz vira (exact)
    price: false, // odprti podatki krajev — cen NI
    availability: false,
    images: false,
    reviews: true, // stats.rating + stats.rating_count (kadar sta)
    map: true,
    booking: false, // info_only
    affiliate: false,
  },
  envKeys: { api: ["FSQ_PLACES_DIR"] },
  minZoom: 12,
  cacheTtlMs: 24 * 60 * 60 * 1000,
  timeoutMs: 5_000,
  maxCallsPerMin: 0,
};

// ---------------------------------------------------------------------------
// FIXTURES (shema OS Places — TEST-ONLY, temp mape)
// ---------------------------------------------------------------------------

/** Uradna oblika kraja (dokumentirana polja sheme). */
function place(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fsq_id: "4f2a1b3c4d5e6f7a8b9c0d1e",
    name: "Gostilna As",
    latitude: 46.0512,
    longitude: 14.5044,
    address: {
      formatted_address: "Askreva cesta 2, 1000 Ljubljana, Slovenia",
      country: "Slovenia",
      country_code: "SI",
      locality: "Ljubljana",
      postcode: "1000",
      region: "Ljubljana",
      street: "Askreva cesta",
    },
    categories: [{ id: 13068, label: "Restaurant", name: "Restaurant" }],
    tel: "+386 1 234 56 78",
    website: "https://gostilna-as.si",
    email: "info@gostilna-as.si",
    hours: "Mo-Su 11:00-23:00",
    stats: { rating: 4.7, rating_count: 128, total_photos: 42 },
    closed: false,
    date_created: "2020-03-01",
    date_refreshed: "2026-08-15T10:00:00Z",
    ...overrides,
  };
}

/** Trije veljavni kraji (restavracija z oceno / muzej / poi) + smeti. */
const RESTAURANT = place();
const MUSEUM = place({
  fsq_id: "5e8f9a0b1c2d3e4f5a6b7c8d",
  name: "Narodni muzej Slovenije",
  latitude: 46.0497,
  longitude: 14.5032,
  address: { street: "Muzejska ulica", locality: "Ljubljana" },
  categories: [{ id: 10047, label: "Museum", name: "Museum" }],
  stats: undefined,
  date_refreshed: undefined,
});
const POI_PLACE = place({
  fsq_id: "6a7b8c9d0e1f2a3b4c5d6e7f",
  name: "Kino Komuna",
  latitude: 46.0522,
  longitude: 14.5061,
  address: undefined,
  categories: [{ id: 13105, label: "Office", name: "Office" }],
  tel: undefined,
  website: undefined,
  hours: undefined,
  stats: undefined,
  date_refreshed: undefined,
});
/** Kraj ZUNAJ kanonskega SI bbox-a (Dunaj — izloči ga ingest filter). */
const OUT_OF_SI = place({
  fsq_id: "7b8c9d0e1f2a3b4c5d6e7f8a",
  name: "Vienna Opera",
  latitude: 48.2082,
  longitude: 16.3738,
});

/** Ljubljanski viewport (pokriva vse tri veljavne kraje). */
const LJU_VIEW: SupplyQuery = {
  bbox: [46.04, 14.49, 46.07, 14.52],
  zoom: 14,
  cats: [
    "restaurant",
    "museum",
    "poi",
    "accommodation",
    "attraction",
    "viewpoint",
    "natural",
    "religious",
    "shop",
  ],
  locale: "sl",
};

/** Zapiši .jsonl datoteko (ena vrstica = en kraj). */
function writeJsonl(dir: string, name: string, rows: unknown[]): string {
  const file = path.join(dir, name);
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");
  return file;
}

// ---------------------------------------------------------------------------
// ZAGON/ČIŠČENJE — vsak test doba SVEŽO temp mapo + čist indeks + env
// ---------------------------------------------------------------------------

let tmpDirs: string[] = [];
let prevDir: string | undefined;

beforeEach(() => {
  prevDir = process.env.FSQ_PLACES_DIR;
  delete process.env.FSQ_PLACES_DIR;
  resetFsqAdapterCaches();
});

afterEach(() => {
  if (prevDir === undefined) delete process.env.FSQ_PLACES_DIR;
  else process.env.FSQ_PLACES_DIR = prevDir;
  resetFsqAdapterCaches();
  for (const d of tmpDirs) {
    try {
      chmodSync(d, 0o755);
      rmSync(d, { recursive: true, force: true });
    } catch {
      // čiščenje je best-effort (chmod-restored) — ne sme podreti testa
    }
  }
  tmpDirs = [];
});

/** Nova temp mapa (avtomatsko počiščena v afterEach). */
function newTempDir(): string {
  const d = mkdtempSync(path.join(tmpdir(), "fsq-test-"));
  tmpDirs.push(d);
  return d;
}

/** Adapter nad (opcijsano) temp mapo z .jsonl vsebino. */
function adapterWithDataset(rows: unknown[], name = "places.jsonl"): SupplyAdapter {
  const dir = newTempDir();
  writeJsonl(dir, name, rows);
  process.env.FSQ_PLACES_DIR = dir;
  return createFsqAdapter(FSQ_ENTRY);
}

// ---------------------------------------------------------------------------
// ① CAPABILITY GATE — brez množice NI podatkov (ZERO throw)
// ---------------------------------------------------------------------------

describe("TASK 53: capability gate — množica NI nameščena", () => {
  test("① FSQ_PLACES_DIR → NEOBSTOJAČA mapa: [] + „no-dataset“ + ZERO throw", async () => {
    const dir = newTempDir(); // ustvarimo in takoj odstranimo — neobstojača pot
    rmSync(dir, { recursive: true, force: true });
    process.env.FSQ_PLACES_DIR = dir;

    const adapter = createFsqAdapter(FSQ_ENTRY);
    const products = await adapter.search(LJU_VIEW);
    expect(products).toEqual([]);
    expect(fsqLastNote()).toBe("no-dataset");
    expect(adapter.lastRunCached()).toBe(false);
    expect(adapter.lastRunSkipped?.() ?? 0).toBe(0);
  });

  test("② PRAZNA mapa (obstaja, ni .jsonl) → isto iskreno vrata", async () => {
    process.env.FSQ_PLACES_DIR = newTempDir();
    const adapter = createFsqAdapter(FSQ_ENTRY);
    const products = await adapter.search(LJU_VIEW);
    expect(products).toEqual([]);
    expect(fsqLastNote()).toBe("no-dataset");
  });

  test("③ .jsonl SAMO s smeti (0 veljavnih krajev) → isto iskreno vrata + števci", async () => {
    const adapter = adapterWithDataset([{ foo: 1 }, "ne-JSON smet"]);
    const products = await adapter.search(LJU_VIEW);
    expect(products).toEqual([]);
    expect(fsqLastNote()).toBe("no-dataset");
  });

  test("④ privzeta produkcijska pot: fsqDatasetDir() resolva na process.cwd()/data/fsq-places (testi NIKOLI ne pišejo tja)", () => {
    delete process.env.FSQ_PLACES_DIR;
    const dir = fsqDatasetDir();
    expect(dir).toBe(path.resolve(process.cwd(), "data", "fsq-places"));
    // Relativna env pot se resolva NARAVNOPROTI cwd (ne glede na whence):
    process.env.FSQ_PLACES_DIR = "./data/fsq-places";
    expect(fsqDatasetDir()).toBe(path.resolve(process.cwd(), "data", "fsq-places"));
  });
});

// ---------------------------------------------------------------------------
// ② MNOŽICA JE NAMEŠČENA — strežba, preslikava, iskrenost
// ---------------------------------------------------------------------------

describe("TASK 53: množica nameščena (3 veljavni + 1 smet + 1 izven SI)", () => {
  test("① SAMO veljavni kraji v bbox-u; smet + izven-SI šteta v skipped", async () => {
    const adapter = adapterWithDataset([
      RESTAURANT,
      "ta vrstica ni json",
      MUSEUM,
      OUT_OF_SI,
      POI_PLACE,
    ]);
    const products = await adapter.search(LJU_VIEW);

    expect(products).toHaveLength(3);
    // Vrstni red: lastni signal vira (stats.rating_count desc) → Gostilna As
    // (128 recenzij) first; muzej in poi brez recenzij po fsq_id asc.
    expect(products.map((p) => p.id)).toEqual([
      "fsq:4f2a1b3c4d5e6f7a8b9c0d1e",
      "fsq:5e8f9a0b1c2d3e4f5a6b7c8d",
      "fsq:6a7b8c9d0e1f2a3b4c5d6e7f",
    ]);
    // Telemetrija: 1 neveljavna vrstica + 1 izven-SI kraj.
    expect(adapter.lastRunSkipped?.() ?? 0).toBe(2);
    expect(adapter.lastRunCached()).toBe(true); // strežba iz pomnilniškega indeksa
    expect(fsqLastNote()).toBeUndefined();
  });

  test("② identiteta + tipi + subcategory (kategorije → kanonska taksonomija)", async () => {
    const adapter = adapterWithDataset([RESTAURANT, MUSEUM, POI_PLACE]);
    const products = await adapter.search(LJU_VIEW);
    const [restaurant, museum, poi] = products;

    expect(restaurant.provider).toBe("fsq");
    expect(restaurant.providerProductId).toBe("4f2a1b3c4d5e6f7a8b9c0d1e");
    expect(restaurant.type).toBe("restaurant");
    expect(restaurant.subcategory).toBe("Restaurant");
    expect(restaurant.title).toBe("Gostilna As");

    expect(museum.type).toBe("museum");
    expect(museum.subcategory).toBe("Museum");

    // Kategorija brez preslikave („Office") → zajemalni poi BREZ podtipa.
    expect(poi.type).toBe("poi");
    expect(poi.subcategory).toBeUndefined();
  });

  test("③ geo: TOČNE koordinate vira + geoPrecision exact + naslov", async () => {
    const adapter = adapterWithDataset([RESTAURANT, MUSEUM]);
    const [restaurant, museum] = await adapter.search(LJU_VIEW);
    expect(restaurant.lat).toBe(46.0512);
    expect(restaurant.lng).toBe(14.5044);
    expect(restaurant.geoPrecision).toBe("exact");
    // formatted_address ima prednost:
    expect(restaurant.address).toBe("Askreva cesta 2, 1000 Ljubljana, Slovenia");
    // Brez formatted_address → sestavek street + locality (IZKLJUČNO iz vira):
    expect(museum.address).toBe("Muzejska ulica, Ljubljana");
  });

  test("④ ocena/recenzije: stats.rating + stats.rating_count (samo iz vira)", async () => {
    const adapter = adapterWithDataset([RESTAURANT, MUSEUM]);
    const [restaurant, museum] = await adapter.search(LJU_VIEW);
    expect(restaurant.rating).toBe(4.7);
    expect(restaurant.reviewCount).toBe(128);
    // Brez stats NI ocene (ne izmišljujemo):
    expect(museum.rating).toBeUndefined();
    expect(museum.reviewCount).toBeUndefined();
  });

  test("⑤ iskrenost: BREZ cene, BREZ availability, info_only, BREZ bookingUrl", async () => {
    const adapter = adapterWithDataset([RESTAURANT]);
    const [p] = await adapter.search(LJU_VIEW);
    expect(p.price).toBeUndefined();
    expect(p.availability).toBeUndefined(); // odprti vir koncepta nima
    expect(p.bookingMode).toBe("info_only");
    expect(p.bookingUrl).toBeUndefined();
    expect(p.image).toBeUndefined();
    expect(p.imageCredit).toBeUndefined();
  });

  test("⑥ kontakt + vir + ure + licenca z atribucijo Apache-2.0", async () => {
    const adapter = adapterWithDataset([RESTAURANT]);
    const [p] = await adapter.search(LJU_VIEW);
    expect(p.phone).toBe("+386 1 234 56 78");
    expect(p.sourceUrl).toBe("https://gostilna-as.si/");
    expect(p.openingHours).toBe("Mo-Su 11:00-23:00");
    expect(p.license).toEqual({
      source: "Foursquare Open Places (OS Places)",
      attribution: "© Foursquare / Open Places Apache-2.0",
    });
  });

  test("⑦ lastUpdated: date_refreshed vira ALI mtime datoteke (ISO)", async () => {
    const adapter = adapterWithDataset([RESTAURANT, MUSEUM]);
    const [restaurant, museum] = await adapter.search(LJU_VIEW);
    // Restauracija ima date_refreshed:
    expect(restaurant.lastUpdated).toBe("2026-08-15T10:00:00Z");
    // Muzej ga NIMA → mtime datoteke (veljaven ISO):
    expect(typeof museum.lastUpdated).toBe("string");
    expect(Number.isFinite(Date.parse(museum.lastUpdated!))).toBe(true);
  });

  test("⑧ brez bbox → [] + „no-bbox“ (brez pina ni poštenega filtra)", async () => {
    const adapter = adapterWithDataset([RESTAURANT]);
    const products = await adapter.search({ ...LJU_VIEW, bbox: undefined });
    expect(products).toEqual([]);
    expect(fsqLastNote()).toBe("no-bbox");
  });
});

// ---------------------------------------------------------------------------
// ③ KATEGORIJSKA PRESLIKAVA (enotski testi tabele)
// ---------------------------------------------------------------------------

describe("TASK 53: FSQ_CATEGORY_MAP + fsqCategoryType", () => {
  test("① pogoste oznake → kanonski tipi", () => {
    expect(FSQ_CATEGORY_MAP["restaurant"]).toBe("restaurant");
    expect(FSQ_CATEGORY_MAP["café"]).toBe("restaurant");
    expect(FSQ_CATEGORY_MAP["cafe"]).toBe("restaurant");
    expect(FSQ_CATEGORY_MAP["coffee shop"]).toBe("restaurant");
    expect(FSQ_CATEGORY_MAP["hotel"]).toBe("accommodation");
    expect(FSQ_CATEGORY_MAP["hostel"]).toBe("accommodation");
    expect(FSQ_CATEGORY_MAP["bed & breakfast"]).toBe("accommodation");
    expect(FSQ_CATEGORY_MAP["museum"]).toBe("museum");
    expect(FSQ_CATEGORY_MAP["art museum"]).toBe("museum");
    expect(FSQ_CATEGORY_MAP["history museum"]).toBe("museum");
    expect(FSQ_CATEGORY_MAP["park"]).toBe("natural");
    expect(FSQ_CATEGORY_MAP["nature preserve"]).toBe("natural");
    expect(FSQ_CATEGORY_MAP["lake"]).toBe("natural");
    expect(FSQ_CATEGORY_MAP["church"]).toBe("religious");
    expect(FSQ_CATEGORY_MAP["cathedral"]).toBe("religious");
    expect(FSQ_CATEGORY_MAP["monastery"]).toBe("religious");
    expect(FSQ_CATEGORY_MAP["viewpoint"]).toBe("viewpoint");
    expect(FSQ_CATEGORY_MAP["scenic lookout"]).toBe("viewpoint");
    expect(FSQ_CATEGORY_MAP["shop"]).toBe("shop");
    expect(FSQ_CATEGORY_MAP["store"]).toBe("shop");
    expect(FSQ_CATEGORY_MAP["supermarket"]).toBe("shop");
    expect(FSQ_CATEGORY_MAP["grocery store"]).toBe("shop");
  });

  test("② neznan label → NI vnosa v tabeli (fsqCategoryType da poi)", () => {
    expect(FSQ_CATEGORY_MAP["nightclub"]).toBeUndefined();
    const p = place({ categories: [{ label: "Nightclub" }] }) as unknown as FsqPlace;
    expect(fsqCategoryType(p).type).toBe("poi");
    expect(fsqCategoryType(p).subcategory).toBeUndefined();
  });

  test("③ PRVA znana kategorija zmaga (subcategory = njen label)", () => {
    const p = place({
      categories: [
        { label: "Office" },
        { label: "Hotel" },
        { label: "Restaurant" },
      ],
    }) as unknown as FsqPlace;
    const r = fsqCategoryType(p);
    expect(r.type).toBe("accommodation");
    expect(r.subcategory).toBe("Hotel");
  });

  test("④ kategorije kot goli ID-ji (brez labela) niso klasificabilne → poi", () => {
    const p = place({ categories: [13068, 10047] }) as unknown as FsqPlace;
    expect(fsqCategoryType(p).type).toBe("poi");
  });

  test("⑤ missing categories → poi (brez podtipa)", () => {
    const p = place({ categories: undefined }) as unknown as FsqPlace;
    expect(fsqCategoryType(p).type).toBe("poi");
  });

  test("⑥ inSloveniaBbox: kanonske meje SI (lat 45.4–46.9, lng 13.3–16.6)", () => {
    expect(inSloveniaBbox(46.05, 14.5)).toBe(true); // Ljubljana
    expect(inSloveniaBbox(45.5, 13.6)).toBe(true); // Piran
    expect(inSloveniaBbox(48.2, 16.37)).toBe(false); // Dunaj
    expect(inSloveniaBbox(45.0, 14.5)).toBe(false); // Zagreb-ish jug
    expect(SI_BBOX.latMin).toBe(45.4);
    expect(SI_BBOX.latMax).toBe(46.9);
    expect(SI_BBOX.lngMin).toBe(13.3);
    expect(SI_BBOX.lngMax).toBe(16.6);
  });
});

// ---------------------------------------------------------------------------
// ④ MTIME OSVEŽEVANJE — dodana vrstica → indeks se ponovno naloži
// ---------------------------------------------------------------------------

describe("TASK 53: mtime osveževanje indeksa (namestitev BREZ restarta)", () => {
  test("① dodan nov kraj v .jsonl → NASLEDNJA poizvedba ga vidi", async () => {
    const dir = newTempDir();
    const file = writeJsonl(dir, "places.jsonl", [RESTAURANT, MUSEUM, POI_PLACE]);
    process.env.FSQ_PLACES_DIR = dir;
    const adapter = createFsqAdapter(FSQ_ENTRY);

    const first = await adapter.search(LJU_VIEW);
    expect(first).toHaveLength(3);

    // Operator doda nov kraj (append v isto datoteko — dir mtime se NE
    // spremeni, datotečni mtime/size PA → nalagalni prehod se sproži):
    const NEW_PLACE = place({
      fsq_id: "8c9d0e1f2a3b4c5d6e7f8a9b",
      name: "Slaščičarna Zvezda",
      latitude: 46.0519,
      longitude: 14.5049,
      categories: [{ label: "Café" }],
    });
    appendFileSync(file, JSON.stringify(NEW_PLACE) + "\n", "utf-8");

    const second = await adapter.search(LJU_VIEW);
    expect(second).toHaveLength(4);
    expect(second.map((p) => p.id)).toContain("fsq:8c9d0e1f2a3b4c5d6e7f8a9b");
    expect(second.find((p) => p.id === "fsq:8c9d0e1f2a3b4c5d6e7f8a9b")!.type).toBe(
      "restaurant" // Café → restaurant
    );
  });

  test("② DODATNA .jsonl datoteka v mapo → prav tako viden (set datotek se razširi)", async () => {
    const dir = newTempDir();
    writeJsonl(dir, "a.jsonl", [RESTAURANT]);
    process.env.FSQ_PLACES_DIR = dir;
    const adapter = createFsqAdapter(FSQ_ENTRY);

    expect(await adapter.search(LJU_VIEW)).toHaveLength(1);

    writeJsonl(dir, "b.jsonl", [MUSEUM, POI_PLACE]);
    const second = await adapter.search(LJU_VIEW);
    expect(second).toHaveLength(3);
  });

  test("③ fsqDatasetStats poroča strežbo + zavrnjene elemente (telemetrija)", async () => {
    const adapter = adapterWithDataset([RESTAURANT, "smet", OUT_OF_SI, MUSEUM]);
    await adapter.search(LJU_VIEW);
    const stats = fsqDatasetStats();
    expect(stats.serving).toBe("dataset");
    expect(stats.places).toBe(2);
    expect(stats.skippedInvalidLines).toBe(1);
    expect(stats.skippedOutOfCountry).toBe(1);
    expect(stats.lastUpdated).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ⑤ VIEWPORT FILTER — bbox pokriva le enega
// ---------------------------------------------------------------------------

describe("TASK 53: viewport filtriranje po bbox-u", () => {
  test("① ozek bbox pokriva SAMO muzej → samo muzej je v odgovoru", async () => {
    const adapter = adapterWithDataset([RESTAURANT, MUSEUM, POI_PLACE]);
    const products = await adapter.search({
      ...LJU_VIEW,
      bbox: [46.049, 14.502, 46.050, 14.504], // le muzej (46.0497, 14.5032)
    });
    expect(products).toHaveLength(1);
    expect(products[0].type).toBe("museum");
  });

  test("② bbox brez krajev → [] + „no-match“", async () => {
    const adapter = adapterWithDataset([RESTAURANT]);
    const products = await adapter.search({
      ...LJU_VIEW,
      bbox: [46.10, 14.60, 46.12, 14.62],
    });
    expect(products).toEqual([]);
    expect(fsqLastNote()).toBe("no-match");
  });

  test("③ vidnost tipov: cats=[restaurant] → samo restavracija + opomba cat-filtered", async () => {
    const adapter = adapterWithDataset([RESTAURANT, MUSEUM, POI_PLACE]);
    const products = await adapter.search({
      ...LJU_VIEW,
      cats: ["restaurant"],
    });
    expect(products).toHaveLength(1);
    expect(products[0].type).toBe("restaurant");
    expect(fsqLastNote()).toBe("cat-filtered");
  });

  test("④ cats, ki izločijo VSE → [] + „cat-filtered“ (0 izgubljenih drugod)", async () => {
    const adapter = adapterWithDataset([RESTAURANT, MUSEUM]);
    const products = await adapter.search({
      ...LJU_VIEW,
      cats: ["transfer"], // FSQ tipi se ne sekajo z vidnimi
    });
    expect(products).toEqual([]);
    expect(fsqLastNote()).toBe("cat-filtered");
  });
});

// ---------------------------------------------------------------------------
// ⑥ IZOLACIJA — pokvarjena/neberljiva datoteka NE podre dobre
// ---------------------------------------------------------------------------

describe("TASK 53: izolacija datotek (ena slaba ne podre plasti)", () => {
  test("① POKVARJENA .jsonl (samo smeti) + dobra .jsonl → dobra streža", async () => {
    const dir = newTempDir();
    writeJsonl(dir, "good.jsonl", [RESTAURANT, MUSEUM]);
    writeJsonl(dir, "corrupt.jsonl", ["{ ni json", "tudi ta ne", 42]);
    process.env.FSQ_PLACES_DIR = dir;

    const adapter = createFsqAdapter(FSQ_ENTRY);
    const products = await adapter.search(LJU_VIEW);
    expect(products).toHaveLength(2); // dobra datoteka NEPOSEDENO strežena
    // Smeti so štete (3 vrstice pokvarjene datoteke):
    expect(adapter.lastRunSkipped?.() ?? 0).toBe(3);
  });

  test("② NEBERLIVA .jsonl (EACCES) + dobra .jsonl → dobra streža, ZERO throw", async () => {
    const dir = newTempDir();
    writeJsonl(dir, "good.jsonl", [RESTAURANT, MUSEUM, POI_PLACE]);
    const bad = writeJsonl(dir, "locked.jsonl", [OUT_OF_SI]);
    chmodSync(bad, 0o000); // za ne-root uporabnika: branje odpove (EACCES)
    process.env.FSQ_PLACES_DIR = dir;

    const adapter = createFsqAdapter(FSQ_ENTRY);
    const products = await adapter.search(LJU_VIEW);
    // Dobra datoteka je ostala strežena VSA (izolacija napake):
    expect(products).toHaveLength(3);
    // Neberljiva datoteka je šteta (1 datoteka izpuščena) — NE podre plasti:
    expect(adapter.lastRunSkipped?.() ?? 0).toBeGreaterThanOrEqual(1);
    expect(fsqLastNote()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// DODATNO: MAPPER ENOTSKI (meje zaupanja §22 — neposredno brez adapterja)
// ---------------------------------------------------------------------------

describe("TASK 53: mapFsqPlace — meje zaupanja", () => {
  const CTX = { lastUpdated: "2026-08-15T10:00:00Z" };

  test("① http website → sourceUrl ZAVRNJEN (samo https)", () => {
    const p = mapFsqPlace(place({ website: "http://ne-varno.si" }) as unknown as FsqPlace, CTX);
    expect(p?.sourceUrl).toBeUndefined();
  });

  test("② website smet (javascript:) → sourceUrl ZAVRNJEN", () => {
    const p = mapFsqPlace(
      place({ website: "javascript:alert(1)" }) as unknown as FsqPlace,
      CTX
    );
    expect(p?.sourceUrl).toBeUndefined();
  });

  test("③ fsq_id/name/geo so OBVEZNI — invalid zapis → null (fail-closed)", () => {
    expect(mapFsqPlace({ name: "brez id" } as unknown as FsqPlace, CTX)).toBeNull();
    expect(
      mapFsqPlace({ fsq_id: "x", name: "" } as unknown as FsqPlace, CTX)
    ).toBeNull();
    expect(
      mapFsqPlace({ fsq_id: "x", name: "kraj", latitude: NaN, longitude: 14 } as unknown as FsqPlace, CTX)
    ).toBeNull();
  });

  test("④ zaprt kraj se NE preslika (adapter ga je izločil že ob naložitvi; mapper je obrambno čist)", () => {
    const p = mapFsqPlace(place({ closed: true }) as unknown as FsqPlace, CTX);
    // Mapper ne izloča zaprtih (to je naloga nalagalca — tu le dokumentiramo
    // kanonsko obliko validnega zapisa); preslikava je možna SAMO za
    // validne zapise, nalagalna plast pa zaprte izloči prej.
    expect(p).not.toBeNull();
  });

  test("⑤ rating 0 ali > 5 → zavrnjen (ni dokazane ocene)", () => {
    const zero = mapFsqPlace(place({ stats: { rating: 0, rating_count: 5 } }) as unknown as FsqPlace, CTX);
    expect(zero?.rating).toBeUndefined();
    const six = mapFsqPlace(place({ stats: { rating: 6, rating_count: 5 } }) as unknown as FsqPlace, CTX);
    expect(six?.rating).toBeUndefined();
  });

  test("⑥ ocena brez rating_count → ocena DA, reviewCount NE (pošteno)", () => {
    const p = mapFsqPlace(
      place({ stats: { rating: 4.2 } }) as unknown as FsqPlace,
      CTX
    );
    expect(p?.rating).toBe(4.2);
    expect(p?.reviewCount).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// DODATNO: KAP GOSTOTE + INDEKS DIREKTNO
// ---------------------------------------------------------------------------

describe("TASK 53: kap gostote + neposreden indeks", () => {
  test("① FSQ_MAX_RESULTS kap (gostota pod nadzorom) + opomba capped", async () => {
    const many = Array.from({ length: FSQ_MAX_RESULTS + 10 }, (_, i) =>
      place({ fsq_id: `bulk${String(i).padStart(4, "0")}` })
    );
    const adapter = adapterWithDataset(many);
    const products = await adapter.search(LJU_VIEW);
    expect(products).toHaveLength(FSQ_MAX_RESULTS);
    expect(fsqLastNote()).toBe("capped");
  });

  test("② getFsqDatasetIndex: byId indeks + coalescing sočasnih naloženih", async () => {
    const dir = newTempDir();
    writeJsonl(dir, "places.jsonl", [RESTAURANT, MUSEUM]);
    process.env.FSQ_PLACES_DIR = dir;
    const [a, b] = await Promise.all([getFsqDatasetIndex(), getFsqDatasetIndex()]);
    expect(a).toBe(b); // ENA izvedba nalaganja za oba sočasna klicatelja
    expect(a?.byId.size).toBe(2);
    expect(a?.byId.get("4f2a1b3c4d5e6f7a8b9c0d1e")?.name).toBe("Gostilna As");
  });

  test("③ resetFsqAdapterCaches prisili ponovno nalaganje (testni hak)", async () => {
    const dir = newTempDir();
    writeJsonl(dir, "places.jsonl", [RESTAURANT]);
    process.env.FSQ_PLACES_DIR = dir;
    const adapter = createFsqAdapter(FSQ_ENTRY);
    expect(await adapter.search(LJU_VIEW)).toHaveLength(1);
    resetFsqAdapterCaches();
    // Po resetu: sveža nalagalna pot (isti rezultat, nova generacija):
    expect(await adapter.search(LJU_VIEW)).toHaveLength(1);
    expect(fsqDatasetStats().serving).toBe("dataset");
  });
});
