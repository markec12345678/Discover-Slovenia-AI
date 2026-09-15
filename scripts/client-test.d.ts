/**
 * Ambientna deklaracija testnega Prisma klienta (node_modules/.prisma/client-test),
 * ki ga ROČNO generira `prisma/schema-test.prisma` (glej glavi
 * test-marketplace-migration.ts in test-listing-practical.ts).
 *
 * Obstaja SAMO na strojih, ki so pognale pripravo — v git/CI/Vercel namestitvi
 * ga ni. Brez te deklaracije `next build` pada s TS2307 (ne najde modula),
 * ker tsconfig vključuje vse .ts datoteke projekta, vključno s scripts/.
 * Ko je pravi klient generiran, TS uporabi njegove prave tipe; ta vzorec je
 * le fallback z istim API-jem (PrismaClient iz @prisma/client).
 */
declare module "*.prisma/client-test" {
  export { PrismaClient } from "@prisma/client";
}
