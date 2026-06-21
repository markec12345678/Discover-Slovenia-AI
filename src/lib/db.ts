import { PrismaClient } from '@prisma/client'

// Schema version — dvigni, ko dodaš/spremeniš Prisma model.
// V dev načinu cache invalidata takoj, ko se import ponovno naloži.
const SCHEMA_VERSION = 'v2-pageview-2025'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  __prismaSchemaVersion?: string
}

// Če se je schema spremenila, ustvarimo nov PrismaClient (da dobimo
// sveže generirane modele — npr. PageView).
if (globalForPrisma.__prismaSchemaVersion !== SCHEMA_VERSION) {
  globalForPrisma.prisma = undefined
  globalForPrisma.__prismaSchemaVersion = SCHEMA_VERSION
}

let db: PrismaClient
if (globalForPrisma.prisma) {
  db = globalForPrisma.prisma
} else {
  db = new PrismaClient({
    log: ['query'],
  })
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = db
    globalForPrisma.__prismaSchemaVersion = SCHEMA_VERSION
  }
}

export { db }
