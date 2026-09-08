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
 */
function resolveDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL
  if (!raw?.startsWith('file:')) return raw

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
