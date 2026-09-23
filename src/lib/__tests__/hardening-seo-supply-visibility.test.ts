// ============================================================================
// HARDENING MASTER TASK — S2/S3/S5: SEO_supply VIDNOST SAMO OBJAVLJENIH
// ============================================================================
// S2 (P1): fetchThingsToDoData/fetchGuideData sta poizvedbala BREZ status
//   filtra — draft/pending/rejected vrstice (Listing/Experience/Product) so
//   se izrisale na javnih programatskih SEO straneh
//   (/destinacija/[slug]/things-to-do, /guide/[type]), medtem ko VSI API
//   routed in own supply adapter vidnost rezervirajo za status:"published".
// S3 (P1): toSeoExperience je spreadal CELO DB vrstico (...e) v client
//   komponento — v RSC payload je ušel ownerId/rejectionReason/status/
//   submittedAt/createdAt/updatedAt. Sedaj ročna projekcija javnih polj.
// S5 (P2): revalidateTag("marketplace") ob admin approve/reject — prej ni
//   bil klican nikjer (spremembe moderacije so se na SEO straneh prenesle
//   šele po 1 h).
// ============================================================================
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const seoSrc = readFileSync(join(ROOT, "src/lib/seo-page-data.ts"), "utf8");
const approveSrc = readFileSync(
  join(ROOT, "src/app/api/admin/approve/[id]/route.ts"),
  "utf8"
);
const rejectSrc = readFileSync(
  join(ROOT, "src/app/api/admin/reject/[id]/route.ts"),
  "utf8"
);

describe("HARDENING S2: SEO supply poizvedbe vidijo SAMO objavljene vrstice", () => {
  test("vseh 5 poizvedb (3 things-to-do + 2 guide) ima status: \"published\"", () => {
    // preštejemo db.X.findMany bloke in prisotnost status filtra
    const queries = [
      ...seoSrc.matchAll(/db\.(listing|experience|product)\.findMany\(\{/g),
    ];
    expect(queries.length).toBe(5);
    // vsak findMany blok ( do naslednjega db. klica) vsebuje status filter
    for (let i = 0; i < queries.length; i++) {
      const start = queries[i].index!;
      const end =
        i + 1 < queries.length
          ? queries[i + 1].index!
          : seoSrc.indexOf("const cachedThingsToDoData");
      const block = seoSrc.slice(start, end);
      expect(block).toContain('status: "published"');
    }
  });

  test("poizvedbe ne vsebujejo več golih where: { destinationId } brez statusa", () => {
    expect(seoSrc).not.toContain("where: { destinationId },");
  });
});

describe("HARDENING S3: toSeoExperience projekcija javnih polj (brez internih)", () => {
  const fnSrc = seoSrc.slice(
    seoSrc.indexOf("function toSeoExperience"),
    seoSrc.indexOf("async function fetchThingsToDoData")
  );

  test("NI več spreada celotne DB vrstice (vzorec return { ...e })", () => {
    expect(fnSrc).not.toMatch(/return\s*\{\s*\.\.\.e\b/);
    // vsako vrstico telesa projekcije sestavlja izrecno e.<polje>
    expect(fnSrc).toMatch(/return\s*\{\s*id: e\.id,/);
  });

  test("interni/moderacijska polja NISO izpostavljena", () => {
    for (const internal of [
      "ownerId",
      "rejectionReason",
      "submittedAt",
      "createdAt",
      "updatedAt",
      "approvedAt",
      "approvedBy",
    ]) {
      expect(fnSrc).not.toContain(`e.${internal}`);
    }
  });

  test("javna polja, ki jih rabita kartica in modal, so prisotna", () => {
    for (const pub of [
      "id", "name", "slug", "description", "category", "pricePerPerson",
      "durationHours", "maxGroupSize", "images", "providerName",
      "providerEmail", "providerPhone", "providerWebsite", "rating",
      "reviewCount", "languages", "meetingPoint", "address", "lat", "lng",
      "viewCount", "bookingCount", "verified", "featured", "plan",
    ]) {
      expect(fnSrc).toContain(`e.${pub}`);
    }
  });
});

describe("HARDENING S5: moderacija takoj invalidira marketplace predpomnilnik", () => {
  test("approve: revalidateTag('marketplace', 'max') klican za vse 3 tipe virov", () => {
    // Next 16: profil je obvezen drugi argument ("max" = takojšnja
    // razveljavitev predpomnjenih vnosov taga)
    expect(approveSrc).toContain('revalidateTag("marketplace", "max")');
    for (const ctx of ['"product"', '"experience"', '"listing"']) {
      expect(approveSrc).toContain(`invalidateMarketplaceCache(${ctx})`);
    }
  });

  test("reject: revalidateTag('marketplace', 'max') klican za vse 3 tipe virov", () => {
    expect(rejectSrc).toContain('revalidateTag("marketplace", "max")');
    for (const ctx of ['"product"', '"experience"', '"listing"']) {
      expect(rejectSrc).toContain(`invalidateMarketplaceCache(${ctx})`);
    }
  });
});
