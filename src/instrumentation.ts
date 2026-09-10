// Next.js instrumentation — teče ENKRAT ob zagonu strežnika (pred prvo zahtevo).
// Uporablja se za pripravo Vercel demo baze (Faza 4e).
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
