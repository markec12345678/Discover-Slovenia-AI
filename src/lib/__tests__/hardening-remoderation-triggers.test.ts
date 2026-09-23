// ============================================================================
// HARDENING MASTER TASK — S4/M4: RE-MODERACIJSKI SPROŽILCI JAVNIH POLJ
// ============================================================================
// S4 (P1): owner PUT na OBJAVLJENEM lokalu je lahko tiho spremenil naslov,
//   telefon, e-pošto, spletno stran in urnik (javna polja; address/website/
//   phone vstopajo v own supply adapter) BREZ ponovne moderacije — komentar
//   v kodi je za lat/lng dejal "kot naslov", a koda naslova ni preverila.
// M4 (P2): product PUT — category/sellerPhone/sellerWebsite + trditve
//   (organic/handmade/local/vegan); experience PUT — category.
//   Vsa polja se javno izpisujejo in/ali ženejo filtriranje → so VSEBINA.
// Vsaka sprememba teh polj na objavljenem/odobrenem zapisu mora vrniti
// status nazaj v "pending" (re-moderacija).
// ============================================================================
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");

function contentChangedBlock(file: string): string {
  const src = readFileSync(join(ROOT, file), "utf8");
  const start = src.indexOf("const contentChanged =");
  if (start === -1) throw new Error(`contentChanged manjka v ${file}`);
  const end = src.indexOf("const needsReModeration", start);
  return src.slice(start, end);
}

describe("HARDENING S4: listing PUT — javna kontakt/dostopna polja so VSEBINA", () => {
  const block = contentChangedBlock("src/app/api/owner/listings/[id]/route.ts");

  test("address/phone/email/website/openingHours sprožijo re-moderacijo", () => {
    for (const field of [
      "address", "phone", "email", "website", "openingHours",
    ]) {
      expect(block).toContain(`data.${field} !== undefined`);
    }
  });

  test("primerjave upoštevajo null-semantiko (trim || null)", () => {
    expect(block).toContain("(listing.phone || null)");
    expect(block).toContain("(listing.website || null)");
    expect(block).toContain("(listing.openingHours || null)");
  });
});

describe("HARDENING M4: product PUT — kategorija, kontakt in trditve so VSEBINA", () => {
  const block = contentChangedBlock("src/app/api/owner/products/[id]/route.ts");

  test("category/sellerPhone/sellerWebsite sprožijo re-moderacijo", () => {
    for (const field of ["category", "sellerPhone", "sellerWebsite"]) {
      expect(block).toContain(`data.${field} !== undefined`);
    }
  });

  test("marketinške trditve (organic/handmade/local/vegan) so VSEBINA", () => {
    for (const flag of ["organic", "handmade", "local", "vegan"]) {
      expect(block).toContain(`data.${flag} !== undefined && data.${flag} !== product.${flag}`);
    }
  });
});

describe("HARDENING M4: experience PUT — kategorija je VSEBINA", () => {
  const block = contentChangedBlock("src/app/api/owner/experiences/[id]/route.ts");

  test("category sproži re-moderacijo (guide/[type] filtriranje + adapter tip)", () => {
    expect(block).toContain("data.category !== undefined");
    expect(block).toContain("data.category !== experience.category");
  });
});
