import { PrismaClient } from '@prisma/client'

/**
 * Prisma DB klient (singleton).
 *
 * POZOR — resolucija SQLite poti:
 * - Prisma CLI (db push / migrate) razrešuje `file:` poti RELATIVNO na
 *   prisma/schema.prisma.
 * - Runtime engine pa RELATIVNO na process.cwd() (pri Next.js: projekt root).
 *
 * Da oba najdeta isto bazo, DATABASE_URL v .env zapišemo kot
 * `file:../db/custom.db` (CLI-semantika) in tu v runtime prevedemo v
 * absolutno pot: <cwd>/prisma/../db/custom.db.
 *
 * PAST (sandbox): process env PREGLASI .env! Vlupina tega sandboxa ima
 * izvoženo DATABASE_URL scaffold projekta (/home/z/my-project/db/custom.db)
 * — zato dev skripta v package.json vedno poda EKSPliciten absoluten
 * DATABASE_URL pred `next dev`. Brez tega strežnik tiho pade na napačno
 * (scaffold) bazo: route handlerji javljajo "table does not exist",
 * sekcije homepage-a pa NEMO propadejo v try/catch fallback.
 *
 * VERCEL DEMO FALLBACK (Faza 4e): serverless bundle nima trajne SQLite baze.
 * Kadar smo na Vercelu in je konfiguriran `file:` URL, uporabimo demo bazo,
 * zgrajeno med buildom (db/demo-seed.db — vključena v bundle prek
 * outputFileTracingIncludes), kopirano v zapisljivi /tmp. Isto naredi tudi
 * src/instrumentation.ts (ob zagonu strežnika); tu je varnostna kopija za
 * primer, da se register() ne izvede pred prvim vprašanjem po bazo.
 * Izklop: DSA_DISABLE_DEMO_DB=1 (npr. ob preklopu na hosted Postgres).
 */
/**
 * fs dostop, ki ga webpack NE analizira statično.
 * NAPAKA iz prvega poskusa (982792c): `import fs from 'fs'` v db.ts podre
 * CLIENT build — db.ts uvozijo tudi client komponente
 * (dashboard → beta.ts → db.ts) in v browser bundle-u 'fs' ni razrešljiv.
 * Dinamičen require (izveden SAMO na strežniku pod VERCEL=1) webpack pusti
 * pri miru; v browserju se ta veja nikoli ne izvede (VERCEL ni public env).
 */
function serverFs(): typeof import('fs') | null {
  // 1) process.getBuiltinModule — Node ≥ 22.3 (Vercel: 24.x), brez require.
  try {
    const getBuiltin = (
      process as { getBuiltinModule?: (id: string) => unknown }
    ).getBuiltinModule
    if (typeof getBuiltin === 'function') {
      const fs = getBuiltin.call(process, 'fs') as
        | typeof import('fs')
        | undefined
      if (fs) return fs
    }
  } catch {
    // nadaljuj z eval fallback
  }
  // 2) eval('require') — webpack CJS server bundle (Docker/standalone pot).
  try {
    const dynamicRequire = eval('require') as NodeRequire
    if (typeof dynamicRequire === 'function') {
      return dynamicRequire('fs') as typeof import('fs')
    }
  } catch {
    // V primeru ESM brez require (bun dev) vrne null — veja se ne izvede
    // (lokalni/dev klici nimajo VERCEL=1).
  }
  return null
}

/**
 * `path` dostop po istem vzorcu kot serverFs() zgoraj.
 * STATIČEN `import path from 'path'` podre EDGE prevajanje
 * src/instrumentation.ts (Next 16 dev): instrumentacijski modul se prevaja
 * tudi za edge runtime, kjer Node vgrajenih modulov ni mogoče razrešiti —
 * uvoz verige instrumentation → marketplace-image-migration → db.ts je
 * naredil VSE strani 500 v dev načinu (produkcija/nodejs runtime je bil v redu,
 * ker se tam 'path' razreši prek server externals). Dinamičen require pusti
 * webpack pri miru; veja se izvede SAMO na strežniku (file: DATABASE_URL).
 */
function serverPath(): typeof import('path') | null {
  try {
    const getBuiltin = (
      process as { getBuiltinModule?: (id: string) => unknown }
    ).getBuiltinModule
    if (typeof getBuiltin === 'function') {
      const p = getBuiltin.call(process, 'path') as
        | typeof import('path')
        | undefined
      if (p) return p
    }
  } catch {
    // nadaljuj z eval fallback
  }
  try {
    const dynamicRequire = eval('require') as NodeRequire
    if (typeof dynamicRequire === 'function') {
      return dynamicRequire('path') as typeof import('path')
    }
  } catch {
    // ESM brez require (bun dev) — vrne null
  }
  return null
}

function resolveDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL
  if (!raw?.startsWith('file:')) return raw

  // VERCEL DEMO FALLBACK (Faza 4e) — velja za absolutne IN relativne file:
  // pote: serverless bundle nima trajne baze, zato uporabimo demo bazo iz
  // builda (db/demo-seed.db), kopirano v zapisljivi /tmp.
  // Deluje TUDI med buildom (prerender) — statične strani dobijo demo vsebino.
  if (process.env.VERCEL === '1' && process.env.DSA_DISABLE_DEMO_DB !== '1') {
    try {
      const tmpPath = '/tmp/dsa-demo.db'
      // Že preusmerjeno (src/instrumentation.ts ali prejšnji klic)?
      if (raw === `file:${tmpPath}`) return raw
      const fs = serverFs()
      if (fs) {
        const path = serverPath()
        const seedPath = path
          ? path.join(process.cwd(), 'db', 'demo-seed.db')
          : null
        if (seedPath && fs.existsSync(seedPath)) {
          if (!fs.existsSync(tmpPath)) {
            fs.copyFileSync(seedPath, tmpPath)
          }
          return `file:${tmpPath}`
        }
      }
      // fs nedostopen ali seed manjka — nadaljuj po navadni poti.
    } catch {
      // Fail-open — nadaljuj z resolucijo spodaj.
    }
  }

  const filePath = raw.slice('file:'.length)
  if (filePath.startsWith('/')) return raw

  // Interpretiraj relativno na prisma/ mapo (enako kot Prisma CLI)
  const pathMod = serverPath()
  if (!pathMod) return raw
  const absolute = pathMod.resolve(process.cwd(), 'prisma', filePath)
  return `file:${absolute}`
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: resolveDatabaseUrl(),
    // TASK 44 (production hardening): query log v dev je IZKLOPLJEN.
    //
    // FORENZIKA (živo dokazano 18. 9. 2026, A/B na hladnem startu):
    // `log: ['query','error']` je povzročal PREKINITVENE 500 na
    // /api/supply/search (~13 % hitrih zaporednih poizvedb) — per-query
    // LOG callback prisma library enginea (napi → JS) ob sočasnosti
    // (recompile/CPU obremenitev) vrže raw »SyntaxError: Unexpected end of
    // JSON input« IZVEN try/catch pisalne poti; Next dev ga pripiše
    // odprti zahtevi → 500. A/B dokaz: log ON = 8 napak/30; log OFF =
    // 0/30 (enak scenarij). Produkcija (log:['error']) ni bila nikoli
    // prizadeta (25× burst = 0 napak na standalone buildu).
    //
    // Za začasno debugiranje poizvedb: DSA_PRISMA_QUERY_LOG=1.
    log: process.env.DSA_PRISMA_QUERY_LOG === '1' ? ['query', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
