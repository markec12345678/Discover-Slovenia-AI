// ============================================================================
// FINAL ACCEPTANCE AUDIT 1.88.1 — REGRESIJSKI TESTI ZA FIXE FA-A1 / F-B /
// F-C / FA-3-GAP / F-A
// ============================================================================
// FA-A1 (P1): AI veriga brez SKUPNEGA proračuna — najslabša časovnica
//   120 s (OpenRouter) + 90 s (Gemini 45 s × SDK retry) + 90 s (Puter) +
//   45 s (z-ai) = 345 s > Vercel maxDuration 300 s → gol 504
//   FUNCTION_INVOCATION_TIMEOUT, fallback JSON nikoli ne doseže klienta
//   (produkcija 2026-09-23, 3/3 sonde ≥ 280 s). Fix: totalBudgetMs (privzet
//   150 s), noge vezane na preostanek, maxRetries 0, itinerary 65/70 s
//   usklajen s klientovimi 90 s (TASK 77).
// F-B (P2): /api/recommendations/products|experiences sta spreadala CELO
//   Prisma vrstico — ownerId/rejectionReason/submittedAt v javni JSON
//   (ista družina puščev kot FW1/R3, površina spregledana).
// F-C (P2): lastnikova re-moderacija (published→pending) in BRISANJA niso
//   klicala revalidateTag — SEO predpomnilnik (3600 s) je do 1 URE kazal
//   odstranjeno/neobjavljeno vsebino.
// FA-3 GAP (P2): EXTERNAL handoff zapis je ustvarjala SAMO MOJA POT
//   povezava; kartični CTA in Go Mode EntryLinks so šli k ponudniku brez
//   lifecycle evidence.
// F-A (P3): GET /api/reviews je preverjal SAMO obstojnost — UGC recenzije
//   neobjavljenega izdelka/izkušnje so bile javno berljive.
// ============================================================================
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const aiClientSrc = read("src/lib/ai-client.ts");
const itineraryRouteSrc = read("src/app/api/itinerary/route.ts");
const recProductsSrc = read(
  "src/app/api/recommendations/products/route.ts"
);
const recExperiencesSrc = read(
  "src/app/api/recommendations/experiences/route.ts"
);
const marketplaceCacheSrc = read("src/lib/marketplace-cache.ts");
const handoffRecordSrc = read("src/lib/journey/handoff-record.ts");
const reviewsSrc = read("src/app/api/reviews/route.ts");
const journeyPlannerSrc = read(
  "src/components/sections/journey-planner.tsx"
);
const goModeSrc = read("src/components/sections/go-mode.tsx");
const ownerListingPutSrc = read("src/app/api/owner/listings/[id]/route.ts");
const ownerProductPutSrc = read("src/app/api/owner/products/[id]/route.ts");
const ownerExperiencePutSrc = read(
  "src/app/api/owner/experiences/[id]/route.ts"
);
const adminListingPutSrc = read("src/app/api/admin/listings/[id]/route.ts");

// ─────────────────────────────────────────────────────────────────────────
// FA-A1 — skupni proračun AI verige
// ─────────────────────────────────────────────────────────────────────────

// ISSUE #9 (ZERO-AI): FA-A1 razdeli (AI veriga proračun / itinerary race
// uskladitev / takojšnji null) so ODSTRANJENI — tekstovna AI veriga
// (generateCompletion: OpenRouter→Gemini→Puter→z-ai) ne obstaja več;
// itinerary raba je čisto deterministična (0 LLM, 0 časovnih meja).
// Preostali razdeli (F-B/F-C/FA-3-GAP/F-A) ostajajo — niso AI odvisni.

describe("F-B: recommendations rute uporabljajo javne projekcije", () => {
  test("products: toPublicProduct + brez golic ...p spreadov", () => {
    expect(recProductsSrc).toContain(
      'import { toPublicProduct } from "@/lib/public-fields";'
    );
    expect(recProductsSrc).toContain("...toPublicProduct(p)");
    // gol spread Prisma vrstice je odstranjen
    expect(recProductsSrc).not.toContain("...p,\n      images:");
  });

  test("experiences: toPublicExperience + brez golic ...e spreadov", () => {
    expect(recExperiencesSrc).toContain(
      'import { toPublicExperience } from "@/lib/public-fields";'
    );
    expect(recExperiencesSrc).toContain("...toPublicExperience(e)");
    expect(recExperiencesSrc).not.toContain("...e,\n      images:");
  });

  test("obe ruti imata status: \"published\" vrata (pred-popravek je imel)", () => {
    expect(recProductsSrc).toContain('status: "published"');
    expect(recExperiencesSrc).toContain('status: "published"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// F-C — invalidacija predpomnilnika ob re-moderaciji/brisanju
// ─────────────────────────────────────────────────────────────────────────

describe("F-C: skupni helper invalidateMarketplaceCache (fail-open)", () => {
  test("src/lib/marketplace-cache.ts kliče revalidateTag(\"marketplace\", \"max\")", () => {
    expect(marketplaceCacheSrc).toContain(
      'revalidateTag("marketplace", "max")'
    );
    expect(marketplaceCacheSrc).toContain("try {");
    expect(marketplaceCacheSrc).toContain("catch (error)");
  });
});

describe("F-C: owner POTI invalidirajo predpomnilnik", () => {
  test("listing PUT: invalidate ob needsReModeration", () => {
    expect(ownerListingPutSrc).toContain(
      'invalidateMarketplaceCache("owner-listing-put")'
    );
    // klic je POGOJEN z needsReModeration (ne ob vsaki drobni spremembi)
    const i = ownerListingPutSrc.indexOf(
      'invalidateMarketplaceCache("owner-listing-put")'
    );
    const before = ownerListingPutSrc.slice(Math.max(0, i - 120), i);
    expect(before).toContain("if (needsReModeration)");
  });

  test("product PUT: invalidate ob needsReModeration", () => {
    expect(ownerProductPutSrc).toContain(
      'invalidateMarketplaceCache("owner-product-put")'
    );
  });

  test("experience PUT: invalidate ob needsReModeration", () => {
    expect(ownerExperiencePutSrc).toContain(
      'invalidateMarketplaceCache("owner-experience-put")'
    );
  });

  test("VSAKI owner DELETE invalidira (listing/product/experience)", () => {
    expect(ownerListingPutSrc).toContain(
      'invalidateMarketplaceCache("owner-listing-delete")'
    );
    expect(ownerProductPutSrc).toContain(
      'invalidateMarketplaceCache("owner-product-delete")'
    );
    expect(ownerExperiencePutSrc).toContain(
      'invalidateMarketplaceCache("owner-experience-delete")'
    );
  });
});

describe("F-C: admin listings PUT/DELETE invalidirata", () => {
  test("admin PUT po posodobitvi + DELETE po brisanju", () => {
    expect(adminListingPutSrc).toContain(
      'invalidateMarketplaceCache("admin-listing-put")'
    );
    expect(adminListingPutSrc).toContain(
      'invalidateMarketplaceCache("admin-listing-delete")'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// FA-3 GAP — EXTERNAL handoff zapis na VSEH produktnih povezavah
// ─────────────────────────────────────────────────────────────────────────

describe("FA-3 GAP: skupni klientki helper recordExternalHandoff", () => {
  test("handoff-record.ts: POST /api/journey/bookings status EXTERNAL + sessionKey", () => {
    expect(handoffRecordSrc).toContain(
      '"/api/journey/bookings"'
    );
    expect(handoffRecordSrc).toContain('status: "EXTERNAL"');
    expect(handoffRecordSrc).toContain("plannerSessionId()");
    expect(handoffRecordSrc).toContain("keepalive: true");
  });

  test("karti\u010dni CTA v journey-planner ima onClick recordExternalHandoff", () => {
    // lastIndexOf: prvi zadetek je import — uporaba je v JSX
    const i = journeyPlannerSrc.lastIndexOf("recordExternalHandoff");
    expect(i).toBeGreaterThan(0);
    // onClick je na <a> z bookingUrl (karti\u010dni CTA "Rezerviraj pri ponudniku")
    const ctx = journeyPlannerSrc.slice(Math.max(0, i - 700), i + 200);
    expect(ctx).toContain("p.bookingUrl");
    expect(ctx).toContain("onClick={() =>");
    expect(ctx).toContain("p.provider");
    expect(ctx).toContain("p.providerProductId");
  });

  test("Go Mode EntryLinks ima onClick recordExternalHandoff", () => {
    // lastIndexOf: prvi zadetek je import — uporaba je v JSX
    const i = goModeSrc.lastIndexOf("recordExternalHandoff");
    expect(i).toBeGreaterThan(0);
    const ctx = goModeSrc.slice(Math.max(0, i - 700), i + 200);
    expect(ctx).toContain("e.bookingUrl");
    expect(ctx).toContain("e.provider");
    expect(ctx).toContain("e.providerProductId");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// F-A — published vrata v GET /api/reviews
// ─────────────────────────────────────────────────────────────────────────

describe("F-A: GET /api/reviews objavljenost cilja", () => {
  test("izdelek: select status + vrata status !== \"published\" → 404", () => {
    const i = reviewsSrc.indexOf("db.product.findUnique");
    const block = reviewsSrc.slice(i, i + 500);
    expect(block).toContain("select: { id: true, status: true }");
    expect(block).toContain('exists.status !== "published"');
  });

  test("izku\u0161nja: select status + vrata status !== \"published\" → 404", () => {
    const i = reviewsSrc.indexOf("db.experience.findUnique");
    const block = reviewsSrc.slice(i, i + 500);
    expect(block).toContain("select: { id: true, status: true }");
    expect(block).toContain('exists.status !== "published"');
  });
});
