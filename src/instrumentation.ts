// Next.js instrumentation — teče ENKRAT ob zagonu strežnika (pred prvo zahtevo).
// Uporablja se za pripravo Vercel demo baze (Faza 4e) in za enkratne
// startup migracije podatkov (npr. tržne slike, spodaj).
//
// Vercel serverless ne more poganjati trajne SQLite baze:
//   - datotečni sistem lambde je EPHEMEREN (piše izginejo ob hladnem zagonu),
//   - projektne datoteke so SAMO ZA BRANJE (razen /tmp).
// Zato v demo načinu (brez hosted Postgresa) prigenerirano demo bazo iz
// builda (db/demo-seed.db, vključena v bundle prek outputFileTracingIncludes)
// skopiramo v zapisljivi /tmp in preusmerimo DATABASE_URL nanjo.
//
// Kdaj se to NE izvede (varovalke):
//   - ni Vercel (Docker/VPS/dev imajo svojo trajno bazo),
//   - DATABASE_URL ni file: shema (hosted Postgres — Pot B v DEPLOYMENT.md),
//   - DSA_DISABLE_DEMO_DB=1 (eksplicitni izklop),
//   - seed datoteka manjka (npr. build brez demo koraka).
//
// POZOR — pisanje je na Vercelu PER-INSTANCA (demo). Rezervacije/računi, ki jih
// naredijo obiskovalci javnega demo spletišča, se NE ohranijo med instancami.
// Za produkcijske podatke uporabite Docker (Pot A) ali hosted Postgres (Pot B)
// — glej docs/DEPLOYMENT.md.
//
// FAIL-MODE (1.27.0): vsak startup korak POSNAME svojo posledico (ok / failed
// / skipped / unknown) v src/lib/startup-migration-status, ki jo izpostavi
// javni /api/health. Obnašanje korakov je NEspremenjeno (še vedno fail-open —
// migracija ne sme podreti strežnika); sprememba je VIDNOST, ne politika.
// Dolgoročno (MIGR-HISTORY, prisma migrate deploy vrata) večina teh migracij
// odmre — dokler obstajajo, pa je njihov izid končno opazovan.

import {
  recordStartupStep,
  type StartupStepStatus,
} from "./lib/startup-migration-status";

export async function register() {
  // Instrumentacija teče tudi v edge runtimu — SQLite/Prisma samo za nodejs.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // PLACEHOLDER-GUARD (revizija 1.33.0, 16-e P2): .env.example ima javno
  // znane nadomestne vrednosti (CHANGE_ME_TO_RANDOM_32_CHAR_STRING,
  // GENERIRAJ_RANDOM_SECRET) — kopiraj-prilepi deploy bi jih sprejel kot
  // veljavne skrivnosti (admin geslo, cron bearer, session forging). Tukaj
  // jih zavrnemo v PRODUKCIJI: startup korak failed → /api/health 503
  // (vidno, ne tiho — enaka filozofija kot baseline resolve). V dev/CI brez
  // skrb: tam so nadomestki legitimni.
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    const PLACEHOLDERS = ["CHANGE_ME_TO_RANDOM_32_CHAR_STRING", "GENERIRAJ_RANDOM_SECRET"];
    const checks: Array<[string, string | undefined, number]> = [
      ["ADMIN_PASSWORD", process.env.ADMIN_PASSWORD, 16],
      ["CRON_SECRET", process.env.CRON_SECRET, 16],
      ["NEXTAUTH_SECRET", process.env.NEXTAUTH_SECRET, 16],
    ];
    const bad: string[] = [];
    for (const [name, value, minLen] of checks) {
      if (!value) continue; // manjkajočo skrivnost že pokriva fail-closed logika
      if (PLACEHOLDERS.includes(value) || value.length < minLen) bad.push(name);
    }
    if (bad.length > 0) {
      console.error(
        `[instrumentation] PLACEHOLDER-SKRIVNOSTI v produkciji: ${bad.join(", ")} ` +
          `— vrednosti iz .env.example / prekratke. Zamenjaj jih in REDEPLOY. ` +
          `(admin/cron/auth so sicer fail-closed, a to ni stanje za promet.)`
      );
      recordStartupStep({
        name: "config:secrets",
        status: "failed",
        detail: `placeholder/kratke skrivnosti: ${bad.join(", ")} — zamenjaj v env in redeploy`,
      });
    } else {
      recordStartupStep({
        name: "config:secrets",
        status: "ok",
        detail: "avtentikacijske skrivnosti presegle placeholder preverbo",
      });
    }
  }

  const demo = await prepareVercelDemoDb();
  recordStartupStep({ name: "vercel-demo-db", ...demo });

  // Startup SHEMA migracija — t12 faza 1 (praktični podatki lokala): doda
  // manjkajoče stolpce Listing (seasons/weatherSuitability/parking) na
  // obstoječih bazah (Render/Neon, Vercel demo). Idempotentna,
  // additive-only, fail-open, izklop z DSA_DISABLE_SCHEMA_MIGRATION=1.
  // Glej src/lib/listing-practical-migration.ts.
  if (process.env.DSA_DISABLE_SCHEMA_MIGRATION !== "1") {
    try {
      const { migrateListingPracticalColumns } = await import(
        "./lib/listing-practical-migration"
      );
      const r = await migrateListingPracticalColumns();
      if (r.columnsAdded.length > 0) {
        console.log(
          `[instrumentation] Shema migracija (Listing/praktični podatki): ` +
            `dodani stolpci [${r.columnsAdded.join(", ")}] (${r.dialect})`
        );
        recordStartupStep({
          name: "schema:listing-practical",
          status: "ok",
          detail: `dodani stolpci: ${r.columnsAdded.join(", ")} (${r.dialect})`,
        });
      } else if (r.dialect === "unknown") {
        console.warn(
          "[instrumentation] Shema migracija: stolpcev ni bilo mogoče " +
            "preveriti (DB nedosegljiva?) — preskočeno (fail-open)."
        );
        recordStartupStep({
          name: "schema:listing-practical",
          status: "unknown",
          detail: "DB nedosegljiva — stanja stolpcev ni bilo mogoče preveriti",
        });
      } else {
        recordStartupStep({
          name: "schema:listing-practical",
          status: "ok",
          detail: "stolpci že prisotni",
        });
      }
    } catch (error) {
      // Fail-open: migracija NE sme podreti zagona strežnika.
      console.error(
        "[instrumentation] Shema migracija (praktični podatki) ni uspela:",
        error
      );
      recordStartupStep({
        name: "schema:listing-practical",
        status: "failed",
        detail: String(error),
      });
    }

    // Startup SHEMA migracija — F11 (1.15.0): ustvari tabeli TripPoll +
    // TripPollVote na obstoječih bazah (Vercel/Neon nima ročnega db push;
    // skip-worktree past je modele enkrat zadržala pred commitom).
    // Idempotentna (IF NOT EXISTS), additive-only, fail-open — skupna
    // zastavica DSA_DISABLE_SCHEMA_MIGRATION. Glej
    // src/lib/trip-poll-migration.ts.
    try {
      const { migrateTripPollTables } = await import(
        "./lib/trip-poll-migration"
      );
      const r = await migrateTripPollTables();
      if (r.tablesCreated.length > 0) {
        console.log(
          `[instrumentation] Shema migracija (F11 ankete): ustvarjene ` +
            `tabele [${r.tablesCreated.join(", ")}] (${r.dialect})`
        );
        recordStartupStep({
          name: "schema:trip-poll",
          status: "ok",
          detail: `ustvarjene tabele: ${r.tablesCreated.join(", ")} (${r.dialect})`,
        });
      } else if (r.dialect === "unknown") {
        console.warn(
          "[instrumentation] Shema migracija (F11 ankete): tabel ni bilo " +
            "mogoče preveriti (DB nedosegljiva?) — preskočeno (fail-open)."
        );
        recordStartupStep({
          name: "schema:trip-poll",
          status: "unknown",
          detail: "DB nedosegljiva — stanja tabel ni bilo mogoče preveriti",
        });
      } else {
        recordStartupStep({
          name: "schema:trip-poll",
          status: "ok",
          detail: "tabele že prisotne",
        });
      }
    } catch (error) {
      // Fail-open: migracija NE sme podreti zagona strežnika.
      console.error(
        "[instrumentation] Shema migracija (F11 ankete) ni uspela:",
        error
      );
      recordStartupStep({
        name: "schema:trip-poll",
        status: "failed",
        detail: String(error),
      });
    }

    // Startup SHEMA migracija — F12 (1.16.0): ustvari tabelo TripDiaryEntry
    // (skupinski potni dnevnik) na obstoječih bazah. Idempotentna (IF NOT
    // EXISTS), additive-only, fail-open — skupna zastavica. Glej
    // src/lib/trip-diary-migration.ts.
    try {
      const { migrateTripDiaryTable } = await import(
        "./lib/trip-diary-migration"
      );
      const r = await migrateTripDiaryTable();
      if (r.tablesCreated.length > 0) {
        console.log(
          `[instrumentation] Shema migracija (F12 dnevnik): ustvarjene ` +
            `tabele [${r.tablesCreated.join(", ")}] (${r.dialect})`
        );
        recordStartupStep({
          name: "schema:trip-diary",
          status: "ok",
          detail: `ustvarjene tabele: ${r.tablesCreated.join(", ")} (${r.dialect})`,
        });
      } else if (r.dialect === "unknown") {
        console.warn(
          "[instrumentation] Shema migracija (F12 dnevnik): tabel ni bilo " +
            "mogoče preveriti (DB nedosegljiva?) — preskočeno (fail-open)."
        );
        recordStartupStep({
          name: "schema:trip-diary",
          status: "unknown",
          detail: "DB nedosegljiva — stanja tabele ni bilo mogoče preveriti",
        });
      } else {
        recordStartupStep({
          name: "schema:trip-diary",
          status: "ok",
          detail: "tabela že prisotna",
        });
      }
    } catch (error) {
      // Fail-open: migracija NE sme podreti zagona strežnika.
      console.error(
        "[instrumentation] Shema migracija (F12 dnevnik) ni uspela:",
        error,
      );
      recordStartupStep({
        name: "schema:trip-diary",
        status: "failed",
        detail: String(error),
      });
    }

    // Startup SHEMA migracija — SOCIALNA PLAST deljenih potovanj (P1 + F7,
    // 1.15.0): Neon baza je bila sinhronizirana v Fazi 4f — vsi kasnejši
    // stolpci (SavedItinerary.formData/editTokenHash/userId) in tabele
    // (TripVote/TripComment/TripLike/TripGuide) na njej manjkajo (živi
    // dokaz: POST /api/itinerary/save → 500 na produkciji, 200 lokalno).
    // Idempotentna, additive-only, fail-open — skupna zastavica.
    // Glej src/lib/shared-trip-schema-migration.ts.
    try {
      const { migrateSharedTripSchema } = await import(
        "./lib/shared-trip-schema-migration"
      );
      const r = await migrateSharedTripSchema();
      if (r.columnsAdded.length > 0 || r.tablesCreated.length > 0) {
        console.log(
          `[instrumentation] Shema migracija (socialna plast): dodani ` +
            `stolpci [${r.columnsAdded.join(", ") || "-"}], ustvarjene ` +
            `tabele [${r.tablesCreated.join(", ") || "-"}] (${r.dialect})`
        );
        recordStartupStep({
          name: "schema:shared-trip",
          status: "ok",
          detail:
            `dodani stolpci: ${r.columnsAdded.join(", ") || "-"}; ` +
            `ustvarjene tabele: ${r.tablesCreated.join(", ") || "-"} (${r.dialect})`,
        });
      } else if (r.dialect === "unknown") {
        console.warn(
          "[instrumentation] Shema migracija (socialna plast): stanja ni " +
            "bilo mogoče preveriti (DB nedosegljiva?) — preskočeno (fail-open)."
        );
        recordStartupStep({
          name: "schema:shared-trip",
          status: "unknown",
          detail: "DB nedosegljiva — stanja sheme ni bilo mogoče preveriti",
        });
      } else {
        recordStartupStep({
          name: "schema:shared-trip",
          status: "ok",
          detail: "shema že prisotna",
        });
      }
    } catch (error) {
      // Fail-open: migracija NE sme podreti zagona strežnika.
      console.error(
        "[instrumentation] Shema migracija (socialna plast) ni uspela:",
        error
      );
      recordStartupStep({
        name: "schema:shared-trip",
        status: "failed",
        detail: String(error),
      });
    }
  } else {
    recordStartupStep({
      name: "schema:listing-practical",
      status: "skipped",
      detail: "DSA_DISABLE_SCHEMA_MIGRATION=1",
    });
    recordStartupStep({
      name: "schema:trip-poll",
      status: "skipped",
      detail: "DSA_DISABLE_SCHEMA_MIGRATION=1",
    });
    recordStartupStep({
      name: "schema:trip-diary",
      status: "skipped",
      detail: "DSA_DISABLE_SCHEMA_MIGRATION=1",
    });
    recordStartupStep({
      name: "schema:shared-trip",
      status: "skipped",
      detail: "DSA_DISABLE_SCHEMA_MIGRATION=1",
    });
  }

  // Startup MIGRACIJA ZGODOVINE — baseline resolve (MIGR-HISTORY, 1.30.0):
  // produkcija (Neon Postgres) je bila ustanovljena z db push BREZ
  // _prisma_migrations zgodovine; ta korak ob zagonu zapiše baseline vrstico
  // (enakovredno `prisma migrate resolve --applied` — oblika eksperimentalno
  // preverjena) in s tem odpre VARNA db:deploy vrata — brez ročnega ukaza,
  // ki bi potreboval produkcijski URL (poverilnico, ki je ni v CI/agent
  // okolju). SAMO postgres (sqlite ostaja na db push poti), idempotenten,
  // ne dotika se uporabniške sheme, dirkalno-varen (ON CONFLICT), fail-open.
  // Izklop: DSA_DISABLE_BASELINE_RESOLVE=1. Ročna alternativa ostaja:
  // scripts/ops/migrate-baseline.sh (isti učinek, za potrebe audita).
  // Glej src/lib/prisma-baseline-migration.ts.
  if (process.env.DSA_DISABLE_BASELINE_RESOLVE !== "1") {
    try {
      const { resolvePrismaBaseline } = await import(
        "./lib/prisma-baseline-migration"
      );
      const r = await resolvePrismaBaseline();
      if (r.action === "recorded") {
        console.log(
          `[instrumentation] Migration baseline zabeležen: ${r.detail}`
        );
      } else if (
        r.action === "checksum-mismatch" ||
        r.action === "duplicate" ||
        r.action === "index-failed"
      ) {
        // POOSTRITEV (revizija 1.32.0): degraded stanja baseline zgodovine
        // niso več tiha — zvok v logih + status failed na /api/health (503),
        // ker "already/ok" nad napačnim checksumom bi lagal o varnih
        // db:deploy vratih (migrate deploy bi odkril drift).
        console.error(
          `[instrumentation] Baseline resolve DEGRADED (${r.action}): ${r.detail}`
        );
      }
      recordStartupStep({
        name: "migrate:baseline",
        status:
          r.dialect === "unknown"
            ? "unknown"
            : r.action === "skipped"
              ? "skipped"
              : r.action === "recorded" || r.action === "already"
                ? "ok"
                : "failed", // checksum-mismatch | duplicate | index-failed
        detail: r.detail,
      });
    } catch (error) {
      // Fail-open: resolve NE sme podreti zagona strežnika.
      console.error("[instrumentation] Baseline resolve ni uspel:", error);
      recordStartupStep({
        name: "migrate:baseline",
        status: "failed",
        detail: String(error),
      });
    }
  } else {
    recordStartupStep({
      name: "migrate:baseline",
      status: "skipped",
      detail: "DSA_DISABLE_BASELINE_RESOLVE=1",
    });
  }

  // Startup migracija tržnih slik (tržni val, sept 2026) — popravi demo
  // kartice v OBSTOJEČIH bazah (Render Docker volumen / Vercel demo / dev).
  // Idempotentna, fail-open, izklop z DSA_DISABLE_IMAGE_MIGRATION=1.
  // Glej src/lib/marketplace-image-migration.ts za podrobnosti.
  if (process.env.DSA_DISABLE_IMAGE_MIGRATION !== "1") {
    try {
      const { migrateMarketplaceImages } = await import(
        "./lib/marketplace-image-migration"
      );
      const r = await migrateMarketplaceImages();
      const total = r.listingsUpdated + r.experiencesUpdated + r.productsUpdated;
      if (total > 0) {
        console.log(
          `[instrumentation] Tržne slike migrirane: ${r.listingsUpdated} lokalov, ` +
            `${r.experiencesUpdated} doživetij, ${r.productsUpdated} izdelkov` +
            ` (${r.skipped} preskočenih — brez CDN slik ali neznanih slugov)`
        );
        recordStartupStep({
          name: "data:marketplace-images",
          status: "ok",
          detail: `${total} posodobljenih (${r.listingsUpdated} lokalov, ${r.experiencesUpdated} doživetij, ${r.productsUpdated} izdelkov)`,
        });
      } else {
        recordStartupStep({
          name: "data:marketplace-images",
          status: "ok",
          detail: "0 posodobitev (vse že migrirano ali brez CDN virov)",
        });
      }
    } catch (error) {
      // Fail-open: migracija NE sme podreti zagona strežnika.
      console.error("[instrumentation] Migracija tržnih slik ni uspela:", error);
      recordStartupStep({
        name: "data:marketplace-images",
        status: "failed",
        detail: String(error),
      });
    }
  } else {
    recordStartupStep({
      name: "data:marketplace-images",
      status: "skipped",
      detail: "DSA_DISABLE_IMAGE_MIGRATION=1",
    });
  }
}

async function prepareVercelDemoDb(): Promise<{
  status: StartupStepStatus;
  detail?: string;
}> {
  // Samo Vercel serverless (VERCEL=1 je v buildu IN v runtime okolju).
  if (process.env.VERCEL !== "1") {
    return { status: "skipped", detail: "ni Vercel (dev/Docker/VPS — pričakovano)" };
  }

  // Eksplicitni izklop (npr. ko preklopite na hosted Postgres).
  if (process.env.DSA_DISABLE_DEMO_DB === "1") {
    return { status: "skipped", detail: "DSA_DISABLE_DEMO_DB=1" };
  }

  // Ne posegaj, če je konfiguriran hosted Postgres (Pot B) ali URL brez file:.
  const raw = process.env.DATABASE_URL;
  if (raw && !raw.startsWith("file:")) {
    return { status: "skipped", detail: "hosted Postgres (Pot B) — demo DB se ne uporablja" };
  }

  try {
    // fs/path brez statičnega "node:" uvoza — webpack dev build ga ne razreši
    // (UnhandledSchemeError); enača pristopu serverFs() v src/lib/db.ts (c595a7e).
    const dynamicRequire = eval("require") as NodeRequire
    const fs = dynamicRequire("fs") as typeof import("node:fs")
    const path = dynamicRequire("path") as typeof import("node:path")

    const seedPath = path.join(process.cwd(), "db", "demo-seed.db");
    const targetPath = "/tmp/dsa-demo.db";

    if (!fs.existsSync(seedPath)) {
      console.warn(
        "[instrumentation] db/demo-seed.db manjka — demo baza ni aktivirana " +
          "(build brez demo koraka?). Nadaljujem z obstoječo konfiguracijo."
      );
      return { status: "skipped", detail: "db/demo-seed.db manjka (build brez demo koraka)" };
    }

    // Kopiraj samo enkrat na instanco (register teče enkrat na zagon strežnika).
    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(seedPath, targetPath);
    }

    process.env.DATABASE_URL = `file:${targetPath}`;
    console.log(
      `[instrumentation] Vercel demo baza aktivna: ${targetPath} ` +
        "(pisanje je per-instanca/ephemeral — glej docs/DEPLOYMENT.md)"
    );
    return { status: "ok", detail: `demo baza aktivna: ${targetPath}` };
  } catch (error) {
    // Fail-open: če kopija odpove, aplikacija pade nazaj na obstoječ
    // DATABASE_URL (enako obnašanju pred Fazo 4e).
    console.error("[instrumentation] Demo DB priprava ni uspela:", error);
    return { status: "failed", detail: String(error) };
  }
}
