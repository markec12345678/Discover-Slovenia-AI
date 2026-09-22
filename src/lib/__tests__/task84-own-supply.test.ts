/**
 * Testi TASK 84 (1.75.0) — AKTIVACIJA LASTNE TRŽNICE KOT SUPPLY SLOJ.
 *
 * Zadnji provider BREZ zunanjih poverilnic (register „own") je bil zamrznjen
 * na active:false, ker Listing ni imel koordinat. TASK 84 dodaja:
 *   1. geo stolpca lat/lng (schema + prisma migracija + STARTUP migracija
 *      listing-geo-migration.ts, obe narečji — vzorec t12/F11/F12);
 *   2. own adapter (providers/own/adapter.ts, DI klient za teste);
 *   3. register active:true + production-matrix PRODUCTION_CONFIGURED.
 *
 * Testi (precedent TASK 81 — trditve nad DEJANSKO odposlanimi datotekami):
 *   - UNIT (migracija): obe narečji (postgres DOUBLE PRECISION / sqlite
 *     REAL), idempotentnost, fail-open unknown;
 *   - UNIT (adapter): preslikava (kanonski tip, koordinate, ocena samo >0,
 *     validacija slike/website), iskreni gates (no-listings/no-bbox/
 *     no-match/cat-filtered), viewport filter, kap, DB napaka → throw;
 *   - SOURCE-CONTRACT: schema/migration/lib/instrumentation skladje,
 *     register aktivacija, search factory, matrika stopnja.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { migrateListingGeoColumnsWith } from "../listing-geo-migration";
import {
  createOwnAdapterWithDb,
  type OwnExperienceRow,
  mapOwnListing,
  ownCategoryToType,
  ownLastNote,
  resetOwnAdapterCaches,
  type OwnDb,
  type OwnListingRow,
} from "../supply/providers/own/adapter";

const ROOT = process.cwd();

// ---------------------------------------------------------------------------
// POMOŽNIKI
// ---------------------------------------------------------------------------

/** Lažni Prisma klient za migracijske teste (vzorec TASK 81 makeDb). */
function makeMigrationDb(script: {
  pragma?: unknown[];
  pragmaThrows?: boolean;
  info?: unknown[];
  infoThrows?: boolean;
  exec?: (sql: string) => number | Promise<number>;
}) {
  const calls = { query: [] as string[], exec: [] as string[] };
  const db = {
    async $queryRawUnsafe(sql: string) {
      calls.query.push(sql);
      if (sql.startsWith("PRAGMA")) {
        if (script.pragmaThrows) throw new Error("syntax error near PRAGMA");
        return script.pragma ?? [];
      }
      if (sql.includes("information_schema.columns")) {
        if (script.infoThrows) throw new Error("connection refused");
        return script.info ?? [];
      }
      return [];
    },
    async $executeRawUnsafe(sql: string) {
      calls.exec.push(sql);
      return script.exec ? await script.exec(sql) : 0;
    },
  };
  return { db, calls };
}

type MigrationDb = Parameters<typeof migrateListingGeoColumnsWith>[0];

/** Osnovna veljavna vrstica listinga (preslikovalni testi jo variirajo). */
function baseRow(overrides: Partial<OwnListingRow> = {}): OwnListingRow {
  return {
    id: "lst1",
    name: "Gostilna Pri Jezeru",
    slug: "gostilna-pri-jezeru",
    description: "Lokalna slovenska kuhinja ob jezeru.",
    category: "restaurant",
    address: "Obala 1, Bled",
    images: '["https://img.example.com/a.jpg"]',
    rating: 4.7,
    reviewCount: 23,
    phone: "+386 1 234 5678",
    openingHours: "Po–Ne 8–22",
    website: "https://gostilna-pri-jezeru.example.com",
    lat: 46.3625,
    lng: 14.0936,
    updatedAt: new Date("2026-09-22T08:00:00Z"),
    ...overrides,
  };
}

/** Lažni DB klient za adapterske teste (DI — createOwnAdapterWithDb).
 *  TASK 87: adapter združuje DVA vira (listing + experience) — maketa
 *  sprejne izkušnje kot drugi (neobvezen) argument; default [] pusti
 *  vsem TASK 84 testom nespremenjeno obnašanje. */
function makeOwnDb(
  rows: OwnListingRow[] | Error,
  experiences: OwnExperienceRow[] | Error = []
) {
  const calls: unknown[] = [];
  const db: OwnDb = {
    listing: {
      findMany: async (args: unknown) => {
        calls.push(args);
        if (rows instanceof Error) throw rows;
        return rows;
      },
    },
    experience: {
      findMany: async (args: unknown) => {
        calls.push(args);
        if (experiences instanceof Error) throw experiences;
        return experiences;
      },
    },
  };
  return { db, calls };
}

/** Registra vnos „own" (samo polja, ki jih adapter uporablja). */
const OWN_ENTRY = {
  slug: "own",
  status: "search",
  minZoom: 10,
  timeoutMs: 10_000,
} as Parameters<typeof createOwnAdapterWithDb>[0];

/** Poizvedba s viewportom Bled. */
const Q = {
  bbox: [46.30, 14.00, 46.42, 14.2] as [number, number, number, number],
  zoom: 13,
  cats: [] as never[],
  locale: "sl" as const,
};

// ===========================================================================
// UNIT — STARTUP MIGRACIJA (listing-geo-migration.ts)
// ===========================================================================

describe("listing-geo-migration (unit)", () => {
  test("postgres, stolpca mankata → ALTER ADD COLUMN ×2 z DOUBLE PRECISION", async () => {
    const { db, calls } = makeMigrationDb({
      pragmaThrows: true,
      info: [{ column_name: "id" }, { column_name: "name" }],
    });
    const r = await migrateListingGeoColumnsWith(db as unknown as MigrationDb);
    expect(r.dialect).toBe("postgres");
    expect(r.columnsAdded).toEqual(["lat", "lng"]);
    expect(calls.exec).toHaveLength(2);
    expect(calls.exec[0]).toContain('ALTER TABLE "Listing" ADD COLUMN "lat" DOUBLE PRECISION');
    expect(calls.exec[1]).toContain('ALTER TABLE "Listing" ADD COLUMN "lng" DOUBLE PRECISION');
  });

  test("sqlite, stolpca mankata → REAL (Prisma Float konvencija)", async () => {
    const { db, calls } = makeMigrationDb({
      pragma: [{ name: "id" }, { name: "name" }, { name: "address" }],
    });
    const r = await migrateListingGeoColumnsWith(db as unknown as MigrationDb);
    expect(r.dialect).toBe("sqlite");
    expect(r.columnsAdded).toEqual(["lat", "lng"]);
    // sqlite: goli identifikatorji (driver ubeži dvojne narekovaje)
    expect(calls.exec[0]).toContain("ALTER TABLE Listing ADD COLUMN lat REAL");
    expect(calls.exec[1]).toContain("ALTER TABLE Listing ADD COLUMN lng REAL");
  });

  test("idempotentnost: stolpca že obstajata → NIČ ni dodanega", async () => {
    const { db, calls } = makeMigrationDb({
      pragma: [{ name: "id" }, { name: "lat" }, { name: "lng" }],
    });
    const r = await migrateListingGeoColumnsWith(db as unknown as MigrationDb);
    expect(r.columnsAdded).toEqual([]);
    expect(calls.exec).toHaveLength(0);
  });

  test("delno: samo lat obstaja → doda SAMO lng (additive-only)", async () => {
    const { db, calls } = makeMigrationDb({
      pragma: [{ name: "id" }, { name: "lat" }],
    });
    const r = await migrateListingGeoColumnsWith(db as unknown as MigrationDb);
    expect(r.columnsAdded).toEqual(["lng"]);
    expect(calls.exec).toHaveLength(1);
  });

  test("DB nedosegljiva (unknown) → prazen rezultat, brez DDL (fail-open)", async () => {
    const { db, calls } = makeMigrationDb({ pragmaThrows: true, infoThrows: true });
    const r = await migrateListingGeoColumnsWith(db as unknown as MigrationDb);
    expect(r.dialect).toBe("unknown");
    expect(r.columnsAdded).toEqual([]);
    expect(calls.exec).toHaveLength(0);
  });
});

// ===========================================================================
// UNIT — PRESLIKAVA (mapOwnListing / ownCategoryToType)
// ===========================================================================

describe("own adapter — preslikava (unit)", () => {
  test("kanonski tip po kategoriji (hotel/restaurant/bar/activity/shop/transport/other)", () => {
    expect(ownCategoryToType("hotel")).toBe("accommodation");
    expect(ownCategoryToType("restaurant")).toBe("restaurant");
    expect(ownCategoryToType("bar")).toBe("restaurant");
    expect(ownCategoryToType("activity")).toBe("activity");
    expect(ownCategoryToType("shop")).toBe("shop");
    expect(ownCategoryToType("transport")).toBe("transport");
    expect(ownCategoryToType("other")).toBe("poi");
    expect(ownCategoryToType("necitemznana")).toBe("poi"); // zajemalno, iskreno
  });

  test("veljavna vrstica → kanonski produkt (id/type/geo/bookingMode/vir)", () => {
    const p = mapOwnListing(baseRow())!;
    expect(p.id).toBe("own:lst1");
    expect(p.provider).toBe("own");
    expect(p.providerProductId).toBe("lst1");
    expect(p.type).toBe("restaurant");
    expect(p.subcategory).toBe("restaurant");
    expect(p.lat).toBe(46.3625);
    expect(p.lng).toBe(14.0936);
    expect(p.geoPrecision).toBe("exact");
    expect(p.bookingMode).toBe("own_marketplace");
    expect(p.sourceUrl).toBe("https://gostilna-pri-jezeru.example.com");
    expect(p.image).toBe("https://img.example.com/a.jpg");
    expect(p.rating).toBe(4.7);
    expect(p.reviewCount).toBe(23);
    expect(p.lastUpdated).toBe("2026-09-22T08:00:00.000Z");
    // CENA je ODSOTNA (priceRange je obseg, ne številka) — NIKOLI izmišljena
    expect(p.price).toBeUndefined();
    // bookingUrl ODSOTEN (lastna tržnica — NIKOLI /go)
    expect(p.bookingUrl).toBeUndefined();
    // razpoložljivost ODSOTNA (not_supported — Stripe, ne koledar)
    expect(p.availability).toBeUndefined();
  });

  test("ocena 0 pomeni „ni podatka“ → polji odsotni (ne „slabo“)", () => {
    const p = mapOwnListing(baseRow({ rating: 0, reviewCount: 0 }))!;
    expect(p.rating).toBeUndefined();
    expect(p.reviewCount).toBeUndefined();
  });

  test("neveljavne koordinate (NaN/prevelike/null) → null (fail-closed)", () => {
    expect(mapOwnListing(baseRow({ lat: NaN }))).toBeNull();
    expect(mapOwnListing(baseRow({ lng: 200 }))).toBeNull();
    expect(mapOwnListing(baseRow({ lat: null, lng: null }))).toBeNull();
    expect(mapOwnListing(baseRow({ lat: 91, lng: 14 }))).toBeNull();
  });

  test("slika/website NE-veljavna http(s) → izpuščena (obe meji)", () => {
    const p = mapOwnListing(
      baseRow({
        images: '["javascript:alert(1)", "not-a-url", "https://ok.example.com/x.jpg"]',
        website: "ftp://nevarno.example.com",
      })
    )!;
    expect(p.image).toBe("https://ok.example.com/x.jpg"); // samo prva VELJAVNA
    expect(p.sourceUrl).toBeUndefined(); // ftp NI http(s)
  });

  test("pokvarjen images JSON → brez slike, NE pada", () => {
    const p = mapOwnListing(baseRow({ images: "{ni json" }))!;
    expect(p.image).toBeUndefined();
  });

  test("prazno ime → null (varovalka, čeprav je NOT NULL v shemi)", () => {
    expect(mapOwnListing(baseRow({ name: "   " }))).toBeNull();
  });
});

// ===========================================================================
// UNIT — ADAPTER ISKALNI TOK (gates, viewport, kategorije, telemetrija)
// ===========================================================================

describe("own adapter — iskalni tok (unit)", () => {
  test("prazna tržnica → [] + opomba no-listings (kot fsq no-dataset)", async () => {
    resetOwnAdapterCaches();
    const { db } = makeOwnDb([]);
    const a = createOwnAdapterWithDb(OWN_ENTRY, db);
    const products = await a.search({ ...Q, cats: ["restaurant"] as never });
    expect(products).toEqual([]);
    expect(a.lastRunNote?.()).toBe("no-listings");
    expect(a.lastRunCached()).toBe(false);
    expect(ownLastNote()).toBe("no-listings");
  });

  test("brez bbox → [] + opomba no-bbox (viewport model)", async () => {
    resetOwnAdapterCaches();
    const { db } = makeOwnDb([baseRow()]);
    const a = createOwnAdapterWithDb(OWN_ENTRY, db);
    const products = await a.search({ ...Q, bbox: undefined, cats: ["restaurant"] as never });
    expect(products).toEqual([]);
    expect(a.lastRunNote?.()).toBe("no-bbox");
  });

  test("listing v viewportu + vidna kategorija → produkt", async () => {
    resetOwnAdapterCaches();
    const { db, calls } = makeOwnDb([baseRow()]);
    const a = createOwnAdapterWithDb(OWN_ENTRY, db);
    const products = await a.search({ ...Q, cats: ["restaurant"] as never });
    expect(products).toHaveLength(1);
    expect(products[0].id).toBe("own:lst1");
    expect(a.lastRunNote?.()).toBeUndefined();
    // poizvedba: SAMO objavljeni S koordinatami (fail-closed na strani vira)
    const where = (calls[0] as { where: unknown }).where as Record<string, unknown>;
    expect(where.status).toBe("published");
    expect(where.lat).toEqual({ not: null });
    expect(where.lng).toEqual({ not: null });
  });

  test("listing IZVEN viewporta → [] + no-match", async () => {
    resetOwnAdapterCaches();
    const { db } = makeOwnDb([baseRow({ lat: 45.5, lng: 13.7 })]); // Piran
    const a = createOwnAdapterWithDb(OWN_ENTRY, db);
    const products = await a.search({ ...Q, cats: ["restaurant"] as never });
    expect(products).toEqual([]);
    expect(a.lastRunNote?.()).toBe("no-match");
  });

  test("kategorija izklopljena (cats brez restaurant) → cat-filtered", async () => {
    resetOwnAdapterCaches();
    const { db } = makeOwnDb([baseRow()]);
    const a = createOwnAdapterWithDb(OWN_ENTRY, db);
    const products = await a.search({ ...Q, cats: ["accommodation"] as never });
    expect(products).toEqual([]);
    expect(a.lastRunNote?.()).toBe("cat-filtered");
  });

  test("vrstni red: rating desc → ime asc (deterministično, brez lastnega rangiranja)", async () => {
    resetOwnAdapterCaches();
    const rows = [
      baseRow({ id: "b", name: "B Gostilna", rating: 4.0 }),
      baseRow({ id: "a", name: "A Gostilna", rating: 4.0 }),
      baseRow({ id: "c", name: "C Gostilna", rating: 4.9 }),
    ];
    const { db } = makeOwnDb(rows);
    const a = createOwnAdapterWithDb(OWN_ENTRY, db);
    const products = await a.search({ ...Q, cats: ["restaurant"] as never });
    expect(products.map((p) => p.id)).toEqual(["own:c", "own:a", "own:b"]);
  });

  test("kap OWN_MAX_RESULTS: več listingov kot kap → opomba capped", async () => {
    resetOwnAdapterCaches();
    const rows = Array.from({ length: 65 }, (_, i) =>
      baseRow({ id: `l${i}`, name: `Gostilna ${100 + i}`, rating: 4 })
    );
    const { db } = makeOwnDb(rows);
    const a = createOwnAdapterWithDb(OWN_ENTRY, db);
    const products = await a.search({ ...Q, cats: ["restaurant"] as never });
    expect(products).toHaveLength(60);
    expect(a.lastRunNote?.()).toBe("capped");
  });

  test("DB napaka → adapter MEČE (runner → degraded, NE tiho prazen sloj)", async () => {
    resetOwnAdapterCaches();
    const { db } = makeOwnDb(new Error("db connection lost"));
    const a = createOwnAdapterWithDb(OWN_ENTRY, db);
    expect(a.search({ ...Q, cats: ["restaurant"] as never })).rejects.toThrow(
      "db connection lost"
    );
  });
});

// ===========================================================================
// SOURCE-CONTRACT — skladje ODPOSLANIH datotek (precedent TASK 81)
// ===========================================================================

describe("own supply aktivacija (source-contract)", () => {
  const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
  const migrationSql = readFileSync(
    path.join(ROOT, "prisma/migrations/20260923100000_listing_geo/migration.sql"),
    "utf8"
  );
  const libMigration = readFileSync(
    path.join(ROOT, "src/lib/listing-geo-migration.ts"),
    "utf8"
  );
  const instrumentation = readFileSync(
    path.join(ROOT, "src/instrumentation.ts"),
    "utf8"
  );
  const registry = readFileSync(
    path.join(ROOT, "src/lib/supply/registry.ts"),
    "utf8"
  );
  const searchSrc = readFileSync(
    path.join(ROOT, "src/lib/supply/search.ts"),
    "utf8"
  );
  const matrix = readFileSync(
    path.join(ROOT, "src/lib/supply/production-matrix.ts"),
    "utf8"
  );

  test("schema.prisma: Listing ima lat/lng (Float, NEOBVEZNO)", () => {
    const model = schema.match(/model Listing \{([\s\S]*?)\n\}/)![1];
    expect(model).toMatch(/^\s+lat\s+Float\?$/m);
    expect(model).toMatch(/^\s+lng\s+Float\?$/m);
  });

  test("prisma migracija vsebuje OBJA ALTER stavka (CI drift vrata)", () => {
    expect(migrationSql).toContain('ALTER TABLE "Listing" ADD COLUMN "lat" DOUBLE PRECISION');
    expect(migrationSql).toContain('ALTER TABLE "Listing" ADD COLUMN "lng" DOUBLE PRECISION');
  });

  test("startup migracija (lib) pozna OBEMA stolpca v OBEH narečjih", () => {
    for (const col of ["lat", "lng"]) {
      expect(libMigration).toContain(`"${col}"`);
    }
    // narečna tipa Prisma Float
    expect(libMigration).toContain("DOUBLE PRECISION");
    expect(libMigration).toContain("REAL");
  });

  test("instrumentation.ts registrira korak schema:listing-geo (4 statusi)", () => {
    expect(instrumentation).toContain("./lib/listing-geo-migration");
    const statuses = instrumentation.match(/name: "schema:listing-geo"/g)!;
    expect(statuses.length).toBe(4);
  });

  test("register: own je AKTIVEN z geo/map zmožnostmi in minZoom 10", () => {
    const own = registry.match(/\{\s*slug: "own",([\s\S]*?)\n  \},/)!;
    const body = own[1];
    expect(body).toContain("active: true");
    expect(body).toMatch(/geo: true/);
    expect(body).toMatch(/map: true/);
    expect(body).toMatch(/minZoom: 10/);
    // NE sme več vsebovati zamrznitvenih ostankov
    expect(body).not.toContain("active: false");
    expect(body).not.toContain("minZoom: 22");
  });

  test("search.ts tovarna pozna own adapter", () => {
    expect(searchSrc).toContain('own: createOwnAdapter');
    expect(searchSrc).toContain("./providers/own/adapter");
  });

  test("production-matrix: own je PRODUCTION_CONFIGURED (NE ACTIVE — iskrenost)", () => {
    const own = matrix.match(/\n  own: \{([\s\S]*?)\n  \},/)!;
    const body = own[1];
    expect(body).toContain('stage: "PRODUCTION_CONFIGURED"');
    // iskreni blokirni razlog (ne Active!): živi podatki še manjkajo
    expect(body).toContain('blockedReason: "NO_LIVE_DATA"');
    expect(body).toContain("aiIntegrated: true");
  });
});
