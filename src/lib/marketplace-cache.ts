import { revalidateTag } from "next/cache";

// ============================================================================
// MARKETPLACE CACHE INVALIDACIJA — skupni helper (1.88.1, FINAL ACCEPTANCE
// F-C)
// ============================================================================
// Problem (dokazano z auditom FA-5): lastnikova re-moderacija (objavljena
// vsebina → pending ob vsebinski spremembi) in lastnikovo/admin BRISANJE
// nista klicala revalidateTag — predpomnjene "marketplace" sklope (SEO
// strani, unstable_cache revalidate 3600 s) so še do 1 URO kazale
// odstranjeno/neobjavljeno vsebino. Admin approve/reject ima svoj lokalni
// vzorec (HARDENING S5) — ta helper je ISTA semantika za preostale poti.
//
// Fail-open: napaka invalidacije NE SME polomiti odgovora route (enaka
// filozofija kot admin/approve).

/** Takojšnja razveljavitev predpomnjenih "marketplace" vnosov (SEO
 *  strani). Next 16: drugi argument (profil) je obvezen — "max" pomeni
 *  takojšnjo razveljavitev. */
export function invalidateMarketplaceCache(context: string) {
  try {
    revalidateTag("marketplace", "max");
  } catch (error) {
    console.error(
      `[marketplace-cache:${context}] revalidateTag napaka:`,
      error
    );
  }
}
