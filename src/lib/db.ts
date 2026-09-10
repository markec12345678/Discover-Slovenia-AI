import { PrismaClient } from '@prisma/client'
import path from 'path'

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
        const seedPath = path.join(process.cwd(), 'db', 'demo-seed.db')
        if (fs.existsSync(seedPath)) {
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
  if (path.isAbsolute(filePath)) return raw

  // Interpretiraj relativno na prisma/ mapo (enako kot Prisma CLI)
  const absolute = path.resolve(process.cwd(), 'prisma', filePath)
  return `file:${absolute}`
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: resolveDatabaseUrl(),
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
