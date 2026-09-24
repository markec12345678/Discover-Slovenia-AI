/**
 * ZAGONSKA MIGRACIJA ZGODOVINE — baseline resolve (MIGR-HISTORY, 1.30.0)
 *
 * Problem: produkcija (Vercel + Neon Postgres, Pot B v DEPLOYMENT.md) je bila
 * ustanovljena z `prisma db push` BREZ migration zgodovine — tabela
 * _prisma_migrations tam ne obstaja. Dokler baseline (20260916000000_baseline)
 * ni zabeležen kot uporabljen, `bun run db:deploy` (prisma migrate deploy)
 * NI varen na produkciji (poskušal bi ustvariti že obstoječe tabele).
 *
 * Ročna rešitev (1.27.1): scripts/ops/migrate-baseline.sh "<neon-url>" —
 * a zahteva produkcijski URL, ki je POVERILNICA, dostopna samo v
 * Vercel/Render dashboardu (v CI/agent okolju je ni in ne sme biti).
 *
 * Ta modul je NIČ-DEJANJSKA rešitev: ob zagonu strežnika (instrumentation.ts)
 * aplikacija sama — z DATABASE_URL, ki ga ima v lastnem runtime okolju —
 * zapiše vrstico, enakovredno `prisma migrate resolve --applied`:
 *
 *   { id: uuid, checksum: sha256(migration.sql), finished_at: now,
 *     migration_name: "20260916000000_baseline", logs: NULL,
 *     rolled_back_at: NULL, started_at: now, applied_steps_count: 0 }
 *
 * Oblika vrstice je GROUND-TRUTH preverjena z eksperimentom (vržena sqlite
 * baza v /tmp + `prisma migrate resolve --applied` + izpis zapisane vrstice):
 * checksum = sha256 vsebine migration.sql, applied_steps_count = 0,
 * finished_at nastavljen, rolled_back_at NULL. Edina niansa: sqlite resolve
 * zapiše logs kot prazen niz, ta postgres varianta piše NULL — za
 * migrate deploy nepomembno (končana migracija se prepozna po imenu +
 * finished_at + rolled_back_at IS NULL).
 *
 * Lastnosti (enako kot ostale startup migracije):
 *   - SAMO POSTGRES: sqlite (dev/Docker/demo) ostaja na db push poti —
 *     zgodovina migracij tam ni v uporabi;
 *   - IDEMPOTENTNA: obstoječ baseline → brez pisanja (3 pripravljalne
 *     izjave ostanejo brez-učinkovne: IF NOT EXISTS + SELECT);
 *   - NE DOTIKA UPORABNIŠKE SHEME: edina tabela v igri je _prisma_migrations
 *     (Prismina lastna knjiga zgodovine);
 *   - DIRKALNO-VARNA (sočasni hladni zagoni na serverless): unique indeks
 *     na migration_name + INSERT … ON CONFLICT DO NOTHING — dve instanci ne
 *     moreta zapisati dvojnika (Prisma sama nikoli ne piše podvojenih imen,
 *     indeks le utrdi njeno lastno invarianto);
 *   - POOSTRITEV (revizija 1.32.0, uporabnikove trditvi 1+2):
 *     · obstoječa vrstica se preveri tudi po CHECKSUMU — ujemanje z
 *       BASELINE_CHECKSUM je pogoj za "already"; odstopanje pomeni, da bi
 *       `prisma migrate deploy` odkril drift, zato poročamo
 *       checksum-mismatch (degraded → /api/health 503) in NE lagamo, da
 *       so vrata varna;
 *     · če unique indeks ni bil ustvarjen, baseline NE zapišemo — prejšnja
 *       WHERE NOT EXISTS vstavitev je bila dirkalno-nevarna (ozko okno
 *       dvojne vstavitve med sočasnimi zagoni). Namesto tega poročamo
 *       index-failed (degraded) in zahtevamo varno ponovno izvedbo — če
 *       je bila vzročna napaka prehodna, se naslednji hladni
 *       zagon sam ozdravi (idempotentno); če ni (npr. že obstoječi
 *       dvojniki), je potrebna ročna preverba;
 *     · dvojne vrstice z istim imenom (možne samo iz preteklih
 *       eksperimentov) poročamo kot duplicate (degraded).
 *   - FAIL-OPEN: napaka se zalogira, zagon strežnika se nadaljuje (a
 *     degraded stanja zdaj postanejo VIDNA na /api/health — 503);
 *   - Izklop: DSA_DISABLE_BASELINE_RESOLVE=1.
 */

import type { PrismaClient } from "@prisma/client";

/** Id baseline migracije (mapa prisma/migrations/20260916000000_baseline). */
export const BASELINE_MIGRATION_ID = "20260916000000_baseline";

/**
 * sha256(prisma/migrations/20260916000000_baseline/migration.sql) — točno
 * tisto, kar zapiše `prisma migrate resolve --applied` (eksperimentalno
 * dokazano). Vgrajeno kot konstanta, ker serverless bundle ne vključuje
 * mape prisma/migrations; enotski test (__tests__/prisma-baseline-migration)
 * preverja ujemanje z dejansko datoteko — tiha sprememba baseline datoteke
 * pade na rdečem testu in zahteva posodobitev konstante.
 */
export const BASELINE_CHECKSUM =
  "c451adf668638707b56d9d2dc7200b9a48bef3371f2aa48cd489acecd4bdda9a";

/** Strukturalni tip, ki ga sprejme resolve (omogoča testiranje z lastnim klientom). */
type SchemaDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

export interface BaselineResolveResult {
  dialect: "sqlite" | "postgres" | "unknown";
  /**
   * recorded = vrstica zapisana · already = je že obstajala (checksum se
   * ujema) · skipped = ni postgres.
   *
   * DEGRADED stanja (revizija 1.32.0) — instrumentation jih preslika v
   * status "failed" → /api/health 503 (vidno, ne tiho):
   *   · checksum-mismatch — obstoječa vrstica ima NAPAČEN checksum
   *     (migrate deploy bi odkril drift);
   *   · duplicate — več vrstic z istim imenom (podvojeni vnosi);
   *   · index-failed — unique varovalka ni bila ustvarjena, zato vrstice
   *     NISMO zapisali (dirkalno-nevarna pot umaknjena).
   */
  action:
    | "recorded"
    | "already"
    | "skipped"
    | "checksum-mismatch"
    | "duplicate"
    | "index-failed";
  /** Čitljivi opis za console + /api/health (brez poverilnic). */
  detail: string;
}

// Kanonični Prisma DDL za _prisma_migrations na postgresu (enak vzorec
// ustvarjanja kot quaint migrate engine; TIMESTAMP(3) je Prismina
// milisekundna natančnost).
const CREATE_MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMP(3),
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMP(3),
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

/** Zazna narečje obstoječe baze (enaka logika kot trip-poll migracija). */
async function detectDialect(
  client: SchemaDb
): Promise<"sqlite" | "postgres" | "unknown"> {
  // 1) SQLite: PRAGMA uspe SAMO na sqlite (na postgresu sintaksna napaka)
  try {
    const rows = (await client.$queryRawUnsafe(
      "PRAGMA table_info(SavedItinerary)"
    )) as unknown[];
    if (Array.isArray(rows)) return "sqlite";
  } catch {
    // Postgres: PRAGMA je sintaksna napaka → preskusi information_schema
  }

  // 2) Postgres: information_schema uspe na postgres
  try {
    const rows = (await client.$queryRawUnsafe(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'SavedItinerary' LIMIT 1"
    )) as unknown[];
    if (Array.isArray(rows)) return "postgres";
  } catch {
    // fail-open spodaj
  }

  return "unknown";
}

/**
 * Zabeleži baseline migracijo kot uporabljeno (samo postgres). Vedno varna
 * za ponovno poganjanje; nikoli ne meče (fail-open v ovojnici).
 */
export async function resolvePrismaBaselineWith(
  client: SchemaDb
): Promise<BaselineResolveResult> {
  const dialect = await detectDialect(client);

  if (dialect !== "postgres") {
    return {
      dialect,
      action: "skipped",
      detail:
        dialect === "sqlite"
          ? "sqlite (dev/Docker/demo) — db push pot, zgodovina migracij ni v uporabi"
          : "DB nedosegljiva — stanja zgodovine ni bilo mogoče preveriti",
    };
  }

  // 1) Tabela (prvi zagon na db-push produkciji, kjer _prisma_migrations
  //    še ne obstaja; Prisma bi jo ustvarila enako).
  await client.$executeRawUnsafe(CREATE_MIGRATIONS_TABLE);

  // 2) Unique varovalka proti dvojnikom ob sočasnih hladnih zagonih.
  //    Če vzpostavitev spodleti, NE zapišemo baseline-a (revizija 1.32.0):
  //    WHERE NOT EXISTS vstavitev ima ozko dirkalno okno (dve instanci
  //    vstavita dve vrstici) — takšno stanje bi bilo TEŽJE popravljivo
  //    (ročno brisanje dvojnikov) kot eno izpuščeno vstavitev, ki jo
  //    naslednji hladni zagon idempotentno ponovi.
  let uniqueOk = true;
  try {
    await client.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "_prisma_migrations_migration_name_key" ` +
        `ON "_prisma_migrations"("migration_name")`
    );
  } catch {
    uniqueOk = false;
  }

  // 3) Že zabeležen? (vsak kasnejši hladni zagon konča tukaj — tri
  //    brez-učinkovne izjave, nič pisanja). POOSTRITEV (revizija 1.32.0):
  //    obstoj SAMO ni dovolj — preverimo tudi checksum in število vrstic,
  //    sicer bi "already" lahko lagal o varnih db:deploy vratih nad
  //    vrstico, ki jo prisma migrate deploy zavrne kot spremenjeno.
  const existing = (await client.$queryRawUnsafe(
    `SELECT "checksum" FROM "_prisma_migrations" WHERE "migration_name" = '${BASELINE_MIGRATION_ID}'`
  )) as unknown[];
  if (Array.isArray(existing) && existing.length > 0) {
    if (existing.length > 1) {
      return {
        dialect,
        action: "duplicate",
        detail:
          `${existing.length} vrstic za ${BASELINE_MIGRATION_ID} v ` +
          `_prisma_migrations (pričakovana 1) — podvojeni vnosi lomijo ` +
          `migrate deploy; ročno počisti dvojnike (obstavi le eno) in ` +
          `ponovno zaženi (idempotentno)`,
      };
    }
    const row = existing[0] as { checksum?: unknown } | undefined;
    const rowChecksum =
      row && typeof row.checksum === "string" ? row.checksum : String(row?.checksum ?? "");
    if (rowChecksum !== BASELINE_CHECKSUM) {
      return {
        dialect,
        action: "checksum-mismatch",
        detail:
          `baseline vrstica obstaja s checksumom ${rowChecksum.slice(0, 8) || "(prazen)"}…, ` +
          `pričakovan pa je ${BASELINE_CHECKSUM.slice(0, 8)}… — prisma migrate ` +
          `deploy bi odkril odstopanje (drift). Preveri, kako je vrstica ` +
          `nastala (ročni eksperiment? spremenjen baseline?), jo popravi ` +
          `(UPDATE checksum ali DELETE + ponoven zagon) — vrata NISO varna`,
      };
    }
    return {
      dialect,
      action: "already",
      detail:
        `baseline ${BASELINE_MIGRATION_ID} že zabeležen, checksum ` +
        `${BASELINE_CHECKSUM.slice(0, 8)}… se ujema — zgodovina sinhrona, ` +
        `db:deploy vrata varna`,
    };
  }

  // 3b) Brez unique varovalke NE vstavljamo (revizija 1.32.0): prejšnja
  //     WHERE NOT EXISTS pot je bila dirkalno nevarna. Poročamo degraded in
  //     zahtevamo varno ponovno izvedbo — idempotenten naslednji zagon bo
  //     vstavitev izvedel, če je indeks takrat uspel (prehodna napaka),
  //     sicer je potrebna ročna preverba (dvojniki? pravice?).
  if (!uniqueOk) {
    return {
      dialect,
      action: "index-failed",
      detail:
        `unique indeks _prisma_migrations_migration_name_key ni bil ustvarjen ` +
        `(dvojniki? pravice?) — baseline NI zapisan (dirkalno-nevarna ` +
        `WHERE NOT EXISTS vstavitev je umaknjena). Preveri tabelo ročno in ` +
        `ponovno zaženi — korak je idempotenten`,
    };
  }

  // 4) Vstavi vrstico, ki bi jo zapisal `migrate resolve --applied`.
  //    ON CONFLICT (unique indeks iz koraka 2) pokrije dirko dveh sočasnih
  //    zagonov — to je ZDAJ edina vstavitvena pot (garantiran uniqueOk).
  const id = crypto.randomUUID();
  const inserted = await client.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","logs","rolled_back_at","started_at","applied_steps_count")
         VALUES ('${id}','${BASELINE_CHECKSUM}',now(),'${BASELINE_MIGRATION_ID}',NULL,NULL,now(),0)
         ON CONFLICT ("migration_name") DO NOTHING`
  );

  if (inserted > 0) {
    return {
      dialect,
      action: "recorded",
      detail:
        `baseline ${BASELINE_MIGRATION_ID} zabeležen v _prisma_migrations ` +
        `(checksum ${BASELINE_CHECKSUM.slice(0, 8)}…) — db:deploy vrata so zdaj varna`,
    };
  }

  // 0 zadetih vrstic: sočasna instanca je zmagala dirko (ali jo pravkar
  // zaključuje) — končno stanje je pravilno, poročamo iskreno.
  return {
    dialect,
    action: "already",
    detail: "baseline zabeležen s strani sočasne instance — zgodovina sinhrona",
  };
}

/**
 * Produkcijska ovojnica — uporabi globalni db klient (iz src/lib/db).
 * LAZY uvoz db (enako kot ostale startup migracije).
 */
export async function resolvePrismaBaseline(): Promise<BaselineResolveResult> {
  const { db } = await import("@/lib/db");
  return resolvePrismaBaselineWith(db);
}
