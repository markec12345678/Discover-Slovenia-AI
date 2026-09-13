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

export async function register() {
  // Instrumentacija teče tudi v edge runtimu — SQLite/Prisma samo za nodejs.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  await prepareVercelDemoDb();

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
      } else if (r.dialect === "unknown") {
        console.warn(
          "[instrumentation] Shema migracija: stolpcev ni bilo mogoče " +
            "preveriti (DB nedosegljiva?) — preskočeno (fail-open)."
        );
      }
    } catch (error) {
      // Fail-open: migracija NE sme podreti zagona strežnika.
      console.error(
        "[instrumentation] Shema migracija (praktični podatki) ni uspela:",
        error
      );
    }
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
      }
    } catch (error) {
      // Fail-open: migracija NE sme podreti zagona strežnika.
      console.error("[instrumentation] Migracija tržnih slik ni uspela:", error);
    }
  }
}

async function prepareVercelDemoDb() {
  // Samo Vercel serverless (VERCEL=1 je v buildu IN v runtime okolju).
  if (process.env.VERCEL !== "1") return;

  // Eksplicitni izklop (npr. ko preklopite na hosted Postgres).
  if (process.env.DSA_DISABLE_DEMO_DB === "1") return;

  // Ne posegaj, če je konfiguriran hosted Postgres (Pot B) ali URL brez file:.
  const raw = process.env.DATABASE_URL;
  if (raw && !raw.startsWith("file:")) return;

  try {
    // fs/path brez statičnega "node:" uvoza — webpack dev build ga ne razreši
    // (UnhandledSchemeError); enača pristopu serverFs() v src/lib/db.ts (c595a7e).
    const dynamicRequire = eval("require") as NodeRequire
    const fs = dynamicRequire("fs") as typeof import("node:fs")
    const path = dynamicRequire("path") as typeof import("node:path");

    const seedPath = path.join(process.cwd(), "db", "demo-seed.db");
    const targetPath = "/tmp/dsa-demo.db";

    if (!fs.existsSync(seedPath)) {
      console.warn(
        "[instrumentation] db/demo-seed.db manjka — demo baza ni aktivirana " +
          "(build brez demo koraka?). Nadaljujem z obstoječo konfiguracijo."
      );
      return;
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
  } catch (error) {
    // Fail-open: če kopija odpove, aplikacija pade nazaj na obstoječ
    // DATABASE_URL (enako obnašanju pred Fazo 4e).
    console.error("[instrumentation] Demo DB priprava ni uspela:", error);
  }
}
