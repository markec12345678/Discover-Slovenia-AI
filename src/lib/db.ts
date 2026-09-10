import { PrismaClient } from '@prisma/client'
import fs from 'fs'
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
function resolveDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL
  if (!raw?.startsWith('file:')) return raw

  // VERCEL DEMO FALLBACK (Faza 4e) — velja za absolutne IN relativne file:
  // pote: serverless bundle nima trajne baze, zato uporabimo demo bazo iz
  // builda (db/demo-seed.db), kopirano v zapisljivi /tmp.
  if (process.env.VERCEL === '1' && process.env.DSA_DISABLE_DEMO_DB !== '1') {
    try {
      const tmpPath = '/tmp/dsa-demo.db'
      // Že preusmerjeno (src/instrumentation.ts ali prejšnji klic)?
      if (raw === `file:${tmpPath}`) return raw
      const seedPath = path.join(process.cwd(), 'db', 'demo-seed.db')
      if (fs.existsSync(seedPath)) {
        if (!fs.existsSync(tmpPath)) {
          fs.copyFileSync(seedPath, tmpPath)
        }
        return `file:${tmpPath}`
      }
      // Seed manjka (build brez demo koraka) — nadaljuj po navadni poti.
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
