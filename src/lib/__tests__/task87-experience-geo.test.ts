// ============================================================================
// TASK 87 (1.78.0) — GEO KOORDINATE IZKUŠNJE: testi
// ============================================================================
// Vzorec TASK 84/85/86 (kombinirana strategija):
//  A) UNIT — startup migracija experience-geo-migration.ts (obe narečji,
//     idempotentnost, delna, neznana);
//  B) UNIT — preslikava ownExperienceCategoryToType + mapOwnExperience
//     (tipi, cena per_person, fail-closed koordinate/ime, meje http(s));
//  C) UNIT — adapterski iskalni tok z DRUGIM virom (združevanje listing +
//     experience: vrata, viewport, kategorije, vrstni red, kap, DB napaka
//     KATEREGAKOLI vira meče);
//  D) SOURCE-CONTRACT — skladje ODPOSLANIH datotek (schema, migracija,
//     instrumentation, API rute, forma, modal, register, tipi).
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { migrateExperienceGeoColumnsWith } from "../experience-geo-migration";
import {
  createOwnAdapterWithDb,
  mapOwnExperience,
  ownExperienceCategoryToType,
  ownLastNote,
  resetOwnAdapterCaches,
  type OwnDb,
  type OwnExperienceRow,
  type OwnListingRow,
} from "../supply/providers/own/adapter";

const ROOT = process.cwd();

// ---------------------------------------------------------------------------
// POMOŽNIKI
// ---------------------------------------------------------------------------

/** Lažni Prisma klient za migracijske teste (vzorec TASK 84 makeMigrationDb). */
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

type MigrationDb = Parameters<typeof migrateExperienceGeoColumnsWith>[0];

/** Osnovna veljavna vrstica listinga (prazen vir —TASK 84 testi že pokrivajo
 *  preslikavo listinga; tu rabimo samo konstanten prazen/vrstični vir). */
function baseListingRow(
  overrides: Partial<OwnListingRow> = {}
): OwnListingRow {
  return {
    id: "lst1",
    name: "Gostilna Pri Jezeru",
    slug: "gostilna-pri-jezeru",
    description: "Lokalna slovenska kuhinja ob jezeru.",
    category: "restaurant",
    address: "Obala 1, Bled",
    images: "[]",
    rating: 4.0,
    reviewCount: 10,
    phone: null,
    openingHours: null,
    website: null,
    lat: 46.3625,
    lng: 14.0936,
    updatedAt: new Date("2026-09-22T08:00:00Z"),
    ...overrides,
  };
}

/** Osnovna veljavna vrstica izkušnje (preslikovalni testi jo variirajo). */
function baseExperienceRow(
  overrides: Partial<OwnExperienceRow> = {}
): OwnExperienceRow {
  return {
    id: "exp1",
    name: "Voden ogled Blejskega otoka",
    slug: "voden-ogled-blejskega-otoka",
    description: "Ogled z lokalnim vodnikom.",
    category: "tour",
    address: "Cesta Svobode 18, 4260 Bled",
    meetingPoint: "Pred vhodom v blejski grad",
    images: '["https://img.example.com/ogled.jpg"]',
    pricePerPerson: 35,
    rating: 4.8,
    reviewCount: 42,
    providerWebsite: "https://bled-tours.example.com",
    providerPhone: "+386 41 234 567",
    lat: 46.3625,
    lng: 14.0936,
    updatedAt: new Date("2026-09-24T08:00:00Z"),
    ...overrides,
  };
}

/** Lažni DB klient za adapterske teste (DI — createOwnAdapterWithDb).
 *  DVA vira po TASK 87 (listing + experience). */
function makeOwnDb(
  listings: OwnListingRow[] | Error,
  experiences: OwnExperienceRow[] | Error = []
) {
  const calls = { listing: [] as unknown[], experience: [] as unknown[] };
  const db: OwnDb = {
    listing: {
      findMany: async (args: unknown) => {
        calls.listing.push(args);
        if (listings instanceof Error) throw listings;
        return listings;
      },
    },
    experience: {
      findMany: async (args: unknown) => {
        calls.experience.push(args);
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
// A) UNIT — STARTUP MIGRACIJA (experience-geo-migration.ts)
// ===========================================================================

describe("experience-geo-migration (unit)", () => {
  test("postgres, stolpca manjkata → ALTER ADD COLUMN ×2 z DOUBLE PRECISION", async () => {
    const { db, calls } = makeMigrationDb({
      pragmaThrows: true,
      info: [{ column_name: "id" }, { column_name: "name" }],
    });
    const r = await migrateExperienceGeoColumnsWith(db as unknown as MigrationDb);
    expect(r.dialect).toBe("postgres");
    expect(r.columnsAdded).toEqual(["lat", "lng"]);
    expect(calls.exec).toHaveLength(2);
    expect(calls.exec[0]).toContain('ALTER TABLE "Experience" ADD COLUMN "lat" DOUBLE PRECISION');
    expect(calls.exec[1]).toContain('ALTER TABLE "Experience" ADD COLUMN "lng" DOUBLE PRECISION');
  });

  test("sqlite, stolpca manjkata → REAL (Prisma Float konvencija)", async () => {
    const { db, calls } = makeMigrationDb({
      pragma: [{ name: "id" }, { name: "name" }, { name: "address" }],
    });
    const r = await migrateExperienceGeoColumnsWith(db as unknown as MigrationDb);
    expect(r.dialect).toBe("sqlite");
    expect(r.columnsAdded).toEqual(["lat", "lng"]);
    // sqlite: goli identifikatorji (driver ubeži dvojne narekovaje)
    expect(calls.exec[0]).toContain("ALTER TABLE Experience ADD COLUMN lat REAL");
    expect(calls.exec[1]).toContain("ALTER TABLE Experience ADD COLUMN lng REAL");
  });

  test("idempotentnost: stolpca že obstajata → NIČ ni dodanega", async () => {
    const { db, calls } = makeMigrationDb({
      pragma: [{ name: "id" }, { name: "lat" }, { name: "lng" }],
    });
    const r = await migrateExperienceGeoColumnsWith(db as unknown as MigrationDb);
    expect(r.columnsAdded).toEqual([]);
    expect(calls.exec).toHaveLength(0);
  });

  test("delna migracija: samo lat obstaja → doda SAMO lng", async () => {
    const { db, calls } = makeMigrationDb({
      pragma: [{ name: "id" }, { name: "lat" }],
    });
    const r = await migrateExperienceGeoColumnsWith(db as unknown as MigrationDb);
    expect(r.columnsAdded).toEqual(["lng"]);
    expect(calls.exec).toHaveLength(1);
    expect(calls.exec[0]).toContain("lng REAL");
  });

  test("neznana DB (obe poizvedbi ponesrečeni) → fail-open, brez sprememb", async () => {
    const { db, calls } = makeMigrationDb({ pragmaThrows: true, infoThrows: true });
    const r = await migrateExperienceGeoColumnsWith(db as unknown as MigrationDb);
    expect(r.dialect).toBe("unknown");
    expect(r.columnsAdded).toEqual([]);
    expect(calls.exec).toHaveLength(0);
  });
});

// ===========================================================================
// B) UNIT — PRESLIKAVA IZKUŠNJE → KANONSKI PRODUKT
// ===========================================================================

describe("ownExperienceCategoryToType (unit)", () => {
  test("tour → „tour“ (vodena tura)", () => {
    expect(ownExperienceCategoryToType("tour")).toBe("tour");
  });

  test("workshop/tasting/outdoor/cultural/adventure/wellness → „activity“", () => {
    for (const cat of [
      "workshop",
      "tasting",
      "outdoor",
      "cultural",
      "adventure",
      "wellness",
    ]) {
      expect(ownExperienceCategoryToType(cat)).toBe("activity");
    }
  });
});

describe("mapOwnExperience (unit)", () => {
  test("veljavna vrstica → poln kanonski produkt (cena per_person, exact geo)", () => {
    const p = mapOwnExperience(baseExperienceRow());
    expect(p).not.toBeNull();
    expect(p!.id).toBe("own:exp1");
    expect(p!.provider).toBe("own");
    expect(p!.providerProductId).toBe("exp1");
    expect(p!.type).toBe("tour");
    expect(p!.subcategory).toBe("tour");
    expect(p!.title).toBe("Voden ogled Blejskega otoka");
    expect(p!.lat).toBe(46.3625);
    expect(p!.lng).toBe(14.0936);
    expect(p!.geoPrecision).toBe("exact");
    expect(p!.address).toBe("Cesta Svobode 18, 4260 Bled");
    expect(p!.image).toBe("https://img.example.com/ogled.jpg");
    expect(p!.rating).toBe(4.8);
    expect(p!.reviewCount).toBe(42);
    expect(p!.price).toEqual({
      amount: 35,
      currency: "EUR",
      unit: "per_person",
      note: "objavljena cena ponudnika (naša tržnica)",
    });
    expect(p!.bookingMode).toBe("own_marketplace");
    expect(p!.bookingUrl).toBeUndefined(); // NIKOLI /go — lastna tržnica
    expect(p!.sourceUrl).toBe("https://bled-tours.example.com");
    expect(p!.lastUpdated).toBe("2026-09-24T08:00:00.000Z");
    expect(p!.phone).toBe("+386 41 234 567");
    expect(p!.openingHours).toBeUndefined(); // izkušnja nima odpiralnih časov
  });

  test("kategorija workshop → type „activity“ (subcategory nosi izvirnik)", () => {
    const p = mapOwnExperience(baseExperienceRow({ category: "workshop" }));
    expect(p!.type).toBe("activity");
    expect(p!.subcategory).toBe("workshop");
  });

  test("rating/reviewCount 0 → ODSOTNA (0 = ni ocen, ne „slabo“)", () => {
    const p = mapOwnExperience(baseExperienceRow({ rating: 0, reviewCount: 0 }));
    expect(p!.rating).toBeUndefined();
    expect(p!.reviewCount).toBeUndefined();
  });

  test("pricePerPerson 0/negativna/NaN → price ODSOTNA (ne lažemo s ceno)", () => {
    expect(
      mapOwnExperience(baseExperienceRow({ pricePerPerson: 0 }))!.price
    ).toBeUndefined();
    expect(
      mapOwnExperience(baseExperienceRow({ pricePerPerson: -5 }))!.price
    ).toBeUndefined();
    expect(
      mapOwnExperience(baseExperienceRow({ pricePerPerson: Number.NaN }))!.price
    ).toBeUndefined();
  });

  test("neveljavne koordinate → null (fail-closed: |lat|>90, |lng|>180, NaN)", () => {
    expect(mapOwnExperience(baseExperienceRow({ lat: 90.5 }))).toBeNull();
    expect(mapOwnExperience(baseExperienceRow({ lng: -180.5 }))).toBeNull();
    expect(
      mapOwnExperience(baseExperienceRow({ lat: Number.NaN }))
    ).toBeNull();
    expect(mapOwnExperience(baseExperienceRow({ lat: null, lng: null }))).toBeNull();
  });

  test("prazno ime → null (varovalka — ime je NOT NULL v shemi)", () => {
    expect(mapOwnExperience(baseExperienceRow({ name: "   " }))).toBeNull();
  });

  test("nevarna spletna povezava (javascript:) → sourceUrl ODSOTEN", () => {
    const p = mapOwnExperience(
      baseExperienceRow({ providerWebsite: "javascript:alert(1)" })
    );
    expect(p!.sourceUrl).toBeUndefined();
  });

  test("pokvarjen images JSON → brez slike (NE padamo zaradi vnosa)", () => {
    const p = mapOwnExperience(baseExperienceRow({ images: "{ni json" }));
    expect(p!.image).toBeUndefined();
  });

  test("providerPhone null → phone ODSOTEN", () => {
    const p = mapOwnExperience(baseExperienceRow({ providerPhone: null }));
    expect(p!.phone).toBeUndefined();
  });
});

// ===========================================================================
// C) UNIT — ADAPTER Z DRUGIM VIROM (listing + experience združeno)
// ===========================================================================

describe("own adapter — drugi vir experience (unit)", () => {
  test("SAMO izkušnja v viewportu → produkt s ceno in tipom tour", async () => {
    resetOwnAdapterCaches();
    const { db } = makeOwnDb([], [baseExperienceRow()]);
    const a = createOwnAdapterWithDb(OWN_ENTRY, db);
    const products = await a.search({ ...Q, cats: ["tour"] as never });
    expect(products).toHaveLength(1);
    expect(products[0].id).toBe("own:exp1");
    expect(products[0].type).toBe("tour");
    expect(products[0].price?.unit).toBe("per_person");
    expect(products[0].price?.amount).toBe(35);
    expect(a.lastRunNote?.()).toBeUndefined();
  });

  test("poizvedba experience: SAMO objavljene S koordinatami (fail-closed vir)", async () => {
    resetOwnAdapterCaches();
    const { db, calls } = makeOwnDb([], [baseExperienceRow()]);
    const a = createOwnAdapterWithDb(OWN_ENTRY, db);
    await a.search({ ...Q, cats: ["tour"] as never });
    expect(calls.experience).toHaveLength(1);
    const where = (calls.experience[0] as { where: unknown })
      .where as Record<string, unknown>;
    expect(where.status).toBe("published");
    expect(where.lat).toEqual({ not: null });
    expect(where.lng).toEqual({ not: null });
  });

  test("izkušnja IZVEN viewporta → [] + no-match", async () => {
    resetOwnAdapterCaches();
    const { db } = makeOwnDb([], [baseExperienceRow({ lat: 45.5, lng: 13.7 })]);
    const a = createOwnAdapterWithDb(OWN_ENTRY, db);
    const products = await a.search({ ...Q, cats: ["tour"] as never });
    expect(products).toEqual([]);
    expect(a.lastRunNote?.()).toBe("no-match");
  });

  test("kategorija izklopljena (cats brez tour/activity) → cat-filtered", async () => {
    resetOwnAdapterCaches();
    const { db } = makeOwnDb([], [baseExperienceRow()]);
    const a = createOwnAdapterWithDb(OWN_ENTRY, db);
    const products = await a.search({ ...Q, cats: ["restaurant"] as never });
    expect(products).toEqual([]);
    expect(a.lastRunNote?.()).toBe("cat-filtered");
  });

  test("združevanje: izkušnja (4.8) pred listingom (4.0) po ratingu desc", async () => {
    resetOwnAdapterCaches();
    const { db } = makeOwnDb([baseListingRow()], [baseExperienceRow()]);
    const a = createOwnAdapterWithDb(OWN_ENTRY, db);
    const products = await a.search({
      ...Q,
      cats: ["restaurant", "tour"] as never,
    });
    expect(products).toHaveLength(2);
    expect(products[0].id).toBe("own:exp1");
    expect(products[1].id).toBe("own:lst1");
  });

  test("enak rating → ime asc (deterministično, čez oba vira)", async () => {
    resetOwnAdapterCaches();
    const { db } = makeOwnDb(
      [baseListingRow({ name: "B Gostilna", rating: 4.5, category: "restaurant" })],
      [baseExperienceRow({ name: "A Ogled", rating: 4.5 })]
    );
    const a = createOwnAdapterWithDb(OWN_ENTRY, db);
    const products = await a.search({
      ...Q,
      cats: ["restaurant", "tour"] as never,
    });
    expect(products.map((p) => p.title)).toEqual(["A Ogled", "B Gostilna"]);
  });

  test("prazna tržnica (listingi IN izkušnje) → no-listings", async () => {
    resetOwnAdapterCaches();
    const { db } = makeOwnDb([], []);
    const a = createOwnAdapterWithDb(OWN_ENTRY, db);
    const products = await a.search({ ...Q, cats: ["tour"] as never });
    expect(products).toEqual([]);
    expect(a.lastRunNote?.()).toBe("no-listings");
    expect(ownLastNote()).toBe("no-listings");
  });

  test("kap OWN_MAX_RESULTS čez ZDRUŽEN sloj (samo izkušnje) → capped", async () => {
    resetOwnAdapterCaches();
    const rows = Array.from({ length: 65 }, (_, i) =>
      baseExperienceRow({ id: `e${i}`, name: `Ogled ${100 + i}`, rating: 4 })
    );
    const { db } = makeOwnDb([], rows);
    const a = createOwnAdapterWithDb(OWN_ENTRY, db);
    const products = await a.search({ ...Q, cats: ["tour"] as never });
    expect(products).toHaveLength(60);
    expect(a.lastRunNote?.()).toBe("capped");
  });

  test("DB napaka na IZKUŠNJAH (listingi OK) → adapter MEČE (iskreno)", async () => {
    resetOwnAdapterCaches();
    const { db } = makeOwnDb([baseListingRow()], new Error("experience table locked"));
    const a = createOwnAdapterWithDb(OWN_ENTRY, db);
    await expect(
      a.search({ ...Q, cats: ["restaurant"] as never })
    ).rejects.toThrow("experience table locked");
  });

  test("DB napaka na LISTINGIH (izkušnje OK) → adapter MEČE (Task 84 ohranjen)", async () => {
    resetOwnAdapterCaches();
    const { db } = makeOwnDb(new Error("listing table locked"), [baseExperienceRow()]);
    const a = createOwnAdapterWithDb(OWN_ENTRY, db);
    await expect(
      a.search({ ...Q, cats: ["tour"] as never })
    ).rejects.toThrow("listing table locked");
  });

  test("brez bbox → [] + no-bbox (viewport model, neodvisno od virov)", async () => {
    resetOwnAdapterCaches();
    const { db } = makeOwnDb([baseListingRow()], [baseExperienceRow()]);
    const a = createOwnAdapterWithDb(OWN_ENTRY, db);
    const products = await a.search({
      ...Q,
      bbox: undefined,
      cats: ["tour"] as never,
    });
    expect(products).toEqual([]);
    expect(a.lastRunNote?.()).toBe("no-bbox");
  });
});

// ===========================================================================
// D) SOURCE-CONTRACT — skladje ODPOSLANIH datotek
// ===========================================================================

describe("experience geo aktivacija (source-contract)", () => {
  const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
  const migrationSql = readFileSync(
    path.join(ROOT, "prisma/migrations/20260924100000_experience_geo/migration.sql"),
    "utf8"
  );
  const libMigration = readFileSync(
    path.join(ROOT, "src/lib/experience-geo-migration.ts"),
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
  const matrix = readFileSync(
    path.join(ROOT, "src/lib/supply/production-matrix.ts"),
    "utf8"
  );
  const adapterSrc = readFileSync(
    path.join(ROOT, "src/lib/supply/providers/own/adapter.ts"),
    "utf8"
  );
  const ownerCreate = readFileSync(
    path.join(ROOT, "src/app/api/owner/experiences/route.ts"),
    "utf8"
  );
  const ownerUpdate = readFileSync(
    path.join(ROOT, "src/app/api/owner/experiences/[id]/route.ts"),
    "utf8"
  );
  const typesSrc = readFileSync(
    path.join(ROOT, "src/lib/marketplace-types.ts"),
    "utf8"
  );
  const formSrc = readFileSync(
    path.join(ROOT, "src/components/owner/experience-form.tsx"),
    "utf8"
  );
  const modalSrc = readFileSync(
    path.join(ROOT, "src/components/sections/experience-modal.tsx"),
    "utf8"
  );
  const publicFields = readFileSync(
    path.join(ROOT, "src/lib/public-fields.ts"),
    "utf8"
  );

  test("schema.prisma: Experience ima lat/lng (Float, NEOBVEZNO)", () => {
    const model = schema.match(/model Experience \{([\s\S]*?)\n\}/)![1];
    expect(model).toMatch(/^\s+lat\s+Float\?$/m);
    expect(model).toMatch(/^\s+lng\s+Float\?$/m);
  });

  test("prisma migracija vsebuje OBJA ALTER stavka (CI drift vrata)", () => {
    expect(migrationSql).toContain('ALTER TABLE "Experience" ADD COLUMN "lat" DOUBLE PRECISION');
    expect(migrationSql).toContain('ALTER TABLE "Experience" ADD COLUMN "lng" DOUBLE PRECISION');
  });

  test("startup migracija (lib) pozna tabelo Experience v OBEH narečjih", () => {
    expect(libMigration).toContain("Experience");
    expect(libMigration).toContain("DOUBLE PRECISION");
    expect(libMigration).toContain("REAL");
    expect(libMigration).toContain("migrateExperienceGeoColumns");
  });

  test("instrumentation.ts registrira korak schema:experience-geo (4 statusi)", () => {
    expect(instrumentation).toContain("./lib/experience-geo-migration");
    const statuses = instrumentation.match(/name: "schema:experience-geo"/g)!;
    expect(statuses.length).toBe(4);
  });

  test("register: own types vsebuje „tour“ (izkušnje vodene ture)", () => {
    const own = registry.match(/\{\s*slug: "own",([\s\S]*?)\n  \},/)!;
    expect(own[1]).toMatch(/types: \[[^\]]*"tour"/);
    // price zmožnost: izkušnje imajo PRAVO ceno
    expect(own[1]).toMatch(/price: true/);
  });

  test("production-matrix: own price FROM_PRICE (objavljene cene izkušenj)", () => {
    const own = matrix.match(/\n  own: \{([\s\S]*?)\n  \},/)!;
    expect(own[1]).toContain('price: "FROM_PRICE"');
    expect(own[1]).toContain('stage: "PRODUCTION_CONFIGURED"');
  });

  test("adapter: dva vira (listing + experience findMany, Promise.all)", () => {
    expect(adapterSrc).toContain("dbClient.experience.findMany");
    expect(adapterSrc).toMatch(/Promise\.all/);
    expect(adapterSrc).toContain("mapOwnExperience");
    expect(adapterSrc).toContain("no-listings"); // prazna tržnica obeh virov
  });

  test("owner CREATE ruta: zod geo vrata (±90/±180, finite, obe-ali-nobena) + persistanca", () => {
    expect(ownerCreate).toMatch(/lat: z\s*\n?\s*\.number\(\)\s*\n?\s*\.finite\(\)/);
    expect(ownerCreate).toContain('.min(-90, "Geo širina mora biti med -90 in 90")');
    expect(ownerCreate).toContain('.max(180, "Geo dolžina mora biti med -180 in 180")');
    expect(ownerCreate).toContain("Vnesite obe koordinati (geo širino in geo dolžino) ali obe izpraznite.");
    expect(ownerCreate).toContain("lat: data.lat ?? null");
    expect(ownerCreate).toContain("lng: data.lng ?? null");
  });

  test("owner UPDATE ruta: geo vrata + contentChanged + persistanca (re-moderacija)", () => {
    expect(ownerUpdate).toMatch(/lat: z\s*\n?\s*\.number\(\)\s*\n?\s*\.finite\(\)/);
    expect(ownerUpdate).toContain("Vnesite obe koordinati (geo širino in geo dolžino) ali obe izpraznite.");
    // geo sprememba je VSEBINSKA (pin javno viden → re-moderacija)
    expect(ownerUpdate).toMatch(
      /\(data\.lat !== undefined &&\s*\n?\s*\(data\.lat \?\? null\) !== \(experience\.lat \?\? null\)\)/
    );
    expect(ownerUpdate).toMatch(
      /\(data\.lng !== undefined &&\s*\n?\s*\(data\.lng \?\? null\) !== \(experience\.lng \?\? null\)\)/
    );
    expect(ownerUpdate).toContain("...(data.lat !== undefined && { lat: data.lat ?? null })");
    expect(ownerUpdate).toContain("...(data.lng !== undefined && { lng: data.lng ?? null })");
  });

  test("marketplace-types: Experience ima lat/lng (neobvezno)", () => {
    const iface = typesSrc.match(/export interface Experience \{([\s\S]*?)\n\}/)![1];
    expect(iface).toMatch(/lat\?: number \| null/);
    expect(iface).toMatch(/lng\?: number \| null/);
  });

  test("forma: geo polja z validacijo (ef-lat/ef-lng, aria, role=alert, step=any)", () => {
    expect(formSrc).toContain('id="ef-lat"');
    expect(formSrc).toContain('id="ef-lng"');
    expect(formSrc).toContain('id="ef-geo-error"');
    expect(formSrc).toContain('step="any"');
    expect(formSrc).toContain('inputMode="decimal"');
    expect(formSrc).toContain('aria-invalid={geoError !== null}');
    expect(formSrc).toContain('role="alert"');
    expect(formSrc).toContain("parseGeoInput");
    expect(formSrc).toContain("GEO_ERROR_MESSAGES");
    expect(formSrc).toContain("GEO_SI_HINT");
    expect(formSrc).toContain("isWithinSloveniaBbox");
    // prefill iz obstoječe izkušnje
    expect(formSrc).toContain("experience.lat != null ? String(experience.lat)");
    // payload pošlje PARSED števili (null kadar prazno)
    expect(formSrc).toContain("lat: geoParse.lat");
    // submit zavrne neveljaven geo
    expect(formSrc).toMatch(/if \(geoParse\.error !== null\)/);
  });

  test("modal: „Prikaži na zemljevidu“ SAMO ob obeh koordinatah (zoom=13, encodeURIComponent)", () => {
    expect(modalSrc).toContain("Prikaži na zemljevidu");
    expect(modalSrc).toContain("zoom=13");
    expect(modalSrc).toContain("encodeURIComponent(experience.name)");
    // pogoj: obe koordinati (2 pojavitvi — z in brez točke srečanja)
    const geoCond = modalSrc.match(
      /experience\.lat != null && experience\.lng != null/g
    )!;
    expect(geoCond.length).toBeGreaterThanOrEqual(2);
  });

  test("toPublicExperience NE odstrani lat/lng (javni API jih nosi — kot listingi)", () => {
    const fn = publicFields.match(
      /export function toPublicExperience\([\s\S]*?\n\}/
    )![0];
    expect(fn).not.toMatch(/lat/);
    expect(fn).not.toMatch(/lng/);
  });
});
