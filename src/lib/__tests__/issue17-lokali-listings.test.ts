// ============================================================================
// QH 1.153.2 — LOKALI (/lokali) POSVEČENA EVIDENCA
// ============================================================================
// Zapira vrzel kandidata #5 zaključnega audita 17-A: »evidence za /lokali je
// posredna (task8-d-add-to-trip-surfaces source-contract)«. Po vzorcu QH-1
// (Slovenia Pass, vrzel #4) pisanje posvečene evidence RAZKRIVA latentne
// hrošče — in tudi tu jih je našla DVA (produkcijsko potrjena na Vercelu
// 1.153.0, 30. 9. 2026):
//
//   HROŠČ #1 (ROBUSTNOST): GET /api/listings?limit=abc → parseInt("abc")=NaN
//   → Math.min(NaN,100)=NaN → Prisma ZAVRENE `take` → PrismaClientValidationError
//   → 500 na javni ruti (dokaz: produkcija je vrnila HTTP 500).
//   POPRAVEK: Number.isFinite + > 0 varovalka, sicer privzeti 50.
//
//   HROŠČ #2 (SORT): privzeti "featured" sort je v komentarju obljubljal
//   »featured first, then by rating«, a izvajal SAMO { featured: "desc" } —
//   vrstni red neizpostavljenih je sledil vstavitvenemu redu (produkcija:
//   Kavarna Zvezda 4.4 je bila pred Piran Sunset Kayak 4.9). Napačna opomba
//   je trdila, da »SQLite ne podpira kompleksnih orderBy« — Prisma polje
//   orderBy se prevede v večstolpčni ORDER BY, ki SQLite podpira v celoti.
//   POPRAVEK: orderBy [{ featured: "desc" }, { rating: "desc" }].
//
// Struktura (konvencija task28-review-verified.test.ts):
//   1. UNIT — toPublicListing sanitizacija (FW1, audit R3 🟠);
//   2. SOURCE-CONTRACT — varovalke rute + kanonska identiteta Add-površin;
//   3. FUNKCIONALNO — GET /api/listings + GET /api/listings/[slug]
//      (DB-gated, pošten skip; lastna semena s čiščenjem v afterAll).
// ============================================================================
import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// TASK 76 higiena: funkcionalni bloki dinamično uvažajo route handlerje prek
// @/app/api → ( po konvenciji suite-a) trošijo žetone deljenega omejevalnika
// runnerja → okno OBVEZNO počistimo ( glej task76-suite-hygiene.test.ts).
import { clearProviderRateLimits } from "@/lib/supply/search";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const listingsRouteSrc = read("src/app/api/listings/route.ts");
const slugRouteSrc = read("src/app/api/listings/[slug]/route.ts");
const listingsSectionSrc = read("src/components/sections/listings.tsx");
const listingModalSrc = read("src/components/sections/listing-modal.tsx");

// ---------------------------------------------------------------------------
// 1. UNIT — toPublicListing: FW1 sanitizacija javnega odgovora (audit R3)
// ---------------------------------------------------------------------------

describe("QH LOKALI: toPublicListing — FW1 sanitizacija (unit)", () => {
  test("interna/admin polja so ODSTRANJENA, javna ohranjena", async () => {
    const { toPublicListing } = await import("@/lib/public-fields");
    const raw = {
      id: "lok-123",
      name: "Testna gostilna",
      slug: "testna-gostilna",
      description: "Opis",
      longDescription: null,
      category: "restaurant",
      destinationId: "ptuj",
      destinationName: "Ptuj",
      address: "Naslov 1",
      phone: null,
      email: null,
      website: null,
      images: "[]",
      plan: "free",
      featured: false,
      verified: false,
      rating: 4.5,
      reviewCount: 10,
      priceRange: "€€",
      openingHours: null,
      specialties: null,
      seasons: null,
      weatherSuitability: null,
      parking: null,
      lat: null,
      lng: null,
      // SOCIAL PROOF — namerno javen (B2B metrika na kartici/modalu):
      viewCount: 7,
      clickCount: 3,
      leadCount: 1,
      // === INTERNA POLJA (FW1: NE SMEJO priti v javni odgovor) ===
      ownerId: "owner-skrivni-123",
      ownerEmail: "marko.tajni@ponudnik.si",
      rejectionReason: "Interni komentar moderatorja XYZ",
      approvedBy: "admin-456",
      approvedAt: new Date("2026-09-01T00:00:00Z"),
      submittedAt: new Date("2026-08-01T00:00:00Z"),
      draftNudgeStep: 3,
      draftNudgeSentAt: new Date("2026-08-02T00:00:00Z"),
      aiRecommendations: 42,
      createdAt: new Date("2026-08-01T00:00:00Z"),
      updatedAt: new Date("2026-09-01T00:00:00Z"),
    } as never; // struktura = prisma Listing zapis

    const pub = toPublicListing(raw) as Record<string, unknown>;

    // Interna polja NE obstajajo v javnem objektu:
    for (const f of [
      "ownerId",
      "ownerEmail",
      "rejectionReason",
      "approvedBy",
      "approvedAt",
      "submittedAt",
      "draftNudgeStep",
      "draftNudgeSentAt",
      "aiRecommendations",
    ]) {
      expect(pub[f]).toBeUndefined();
    }
    // Javna polja so ohranjena (predstavitvena + social proof):
    expect(pub.id).toBe("lok-123");
    expect(pub.name).toBe("Testna gostilna");
    expect(pub.viewCount).toBe(7);
    expect(pub.clickCount).toBe(3);
    expect(pub.leadCount).toBe(1);
    expect(pub.rating).toBe(4.5);
  });
});

// ---------------------------------------------------------------------------
// 2. SOURCE-CONTRACT — varovalke rute + kanonska identiteta Add-površin
// ---------------------------------------------------------------------------

describe("QH LOKALI: source-contract — varovalke + kanonska identiteta", () => {
  test("GET /api/listings: limit parseInt varovalka (hrošč #1)", () => {
    expect(listingsRouteSrc).toContain("Number.isFinite(rawLimit)");
    expect(listingsRouteSrc).toContain("rawLimit > 0");
    expect(listingsRouteSrc).toContain("Math.min(rawLimit, 100)");
    // zavrnjena prejšnja ranljiva oblika (goli parseInt v take):
    expect(listingsRouteSrc).not.toMatch(
      /take:\s*Math\.min\(limit,\s*100\)/
    );
  });

  test("GET /api/listings: featured sort s SEKUNDARNO ureditvijo po oceni (hrošč #2)", () => {
    expect(listingsRouteSrc).toContain(
      '[{ featured: "desc" }, { rating: "desc" }]'
    );
    // napačna trditev o SQLite nepodpori je ODSTRANJENA:
    expect(listingsRouteSrc).not.toContain("SQLite ne podpira");
  });

  test("GET /api/listings: javni odgovor gre SAMO prek toPublicListing (FW1)", () => {
    expect(listingsRouteSrc).toContain("toPublicListing");
    // nikoli gol `...listing` spread javnega DB zapisa:
    expect(listingsRouteSrc).not.toMatch(/\.\.\.listing[s]?,\s*\n?\s*images/);
  });

  test("GET /api/listings: cap na 100 (take meja)", () => {
    expect(listingsRouteSrc).toContain("Math.min(rawLimit, 100)");
  });

  test("GET /api/listings/[slug]: published-only vrata + sanitizacija", () => {
    expect(slugRouteSrc).toContain("listing.status !== \"published\"");
    expect(slugRouteSrc).toContain("404");
    expect(slugRouteSrc).toContain("toPublicListing");
  });

  test("kartica ListingCard: kanonski AddToTripButton identiteta (kind listing, refId, source lokali)", () => {
    expect(listingsSectionSrc).toContain('kind: "listing"');
    expect(listingsSectionSrc).toContain("refId: listing.id");
    expect(listingsSectionSrc).toContain('source: "lokali"');
    expect(listingsSectionSrc).toContain('href: "/lokali"');
    expect(listingsSectionSrc).toContain(
      'import { AddToTripButton } from "@/components/add-to-trip-button"'
    );
  });

  test("modal ListingModal: ISTA kanonska identiteta ( kartica ↔ modal = dedup)", () => {
    expect(listingModalSrc).toContain('kind: "listing"');
    expect(listingModalSrc).toContain("refId: listing.id");
    expect(listingModalSrc).toContain('source: "lokali"');
    expect(listingModalSrc).toContain('href: "/lokali"');
    // modal prikazuje SAMO published ( fetch prihaja iz istega javnega API-ja):
    expect(listingModalSrc).toContain("AddToTripButton");
  });
});

// ---------------------------------------------------------------------------
// 3. FUNKCIONALNO — GET /api/listings + /api/listings/[slug] (DB-gated)
// ---------------------------------------------------------------------------

/** Sema testnih zapisov (unikatni qh217- prefiksi za varen cleanup). */
const SEED = {
  // Izpostavljeni, NAJNIŽJA ocena — moral bi biti PRVI kljub oceni (featured
  // primat), a pred popravkom bi vrstni red ostalih sledil createdAt:
  p1: {
    id: "qh217-lok-p1",
    name: "QH217 Izpostavljena gostilna",
    slug: "qh217-izpostavljena-gostilna",
    description: "QH217 testni lokal — izpostavljen, ocena 3.0.",
    category: "restaurant",
    destinationId: "ptuj",
    destinationName: "Ptuj",
    address: "Testna 1, Ptuj",
    images: JSON.stringify(["https://img.example/1.jpg", "https://img.example/2.jpg"]),
    plan: "premium",
    featured: true,
    rating: 3.0,
    reviewCount: 5,
    priceRange: "€€",
    specialties: JSON.stringify(["testna specialiteta", "druga specialiteta"]),
    seasons: JSON.stringify(["spring", "summer"]),
    // INTERNA polja — za FW1 funkcionalno varovalko:
    ownerId: "qh217-owner-1",
    ownerEmail: "qh217-tajni@ponudnik.example",
    rejectionReason: "QH217 interni razlog — NE SME izteči",
    aiRecommendations: 99,
    status: "published",
  },
  // Višja ocena, NAZADNJE ustvarjen — po popravku DRUGI (rating 4.8),
  // pred popravkom bi bil TRETJI (createdAt za p3):
  p2: {
    id: "qh217-lok-p2",
    name: "QH217 Penzion Zvezda",
    slug: "qh217-penzion-zvezda",
    description: "QH217 testni lokal — hotel, ocena 4.8.",
    category: "hotel",
    destinationId: "bohinj",
    destinationName: "Bohinj",
    address: "Testna 2, Bohinj",
    images: "[]",
    plan: "free",
    featured: false,
    rating: 4.8,
    reviewCount: 8,
    priceRange: "€",
    specialties: "[]",
    status: "published",
  },
  // NIŽJA ocena, PREJ ustvarjen kot p2 — po popravku TRETJI (4.2),
  // pred popravkom bi bil DRUGI:
  p3: {
    id: "qh217-lok-p3",
    name: "QH217 Kavarna Test",
    slug: "qh217-kavarna-test",
    description: "QH217 testni lokal — kavarna, ocena 4.2.",
    category: "restaurant",
    destinationId: "ptuj",
    destinationName: "Ptuj",
    address: "Testna 3, Ptuj",
    images: "[]",
    plan: "free",
    featured: false,
    rating: 4.2,
    reviewCount: 3,
    priceRange: "€",
    specialties: "[]",
    status: "published",
  },
  // OSNUTEK — NE SME biti v javnem seznamu (moderacijska vrata):
  draft: {
    id: "qh217-lok-draft",
    name: "QH217 Osnutek (neviden)",
    slug: "qh217-osnutek-neviden",
    description: "QH217 testni osnutek — javno NE obstaja.",
    category: "hotel",
    destinationId: "ptuj",
    destinationName: "Ptuj",
    address: "Testna 4, Ptuj",
    images: "[]",
    ownerEmail: "qh217-osnutek@ponudnik.example",
    status: "draft",
  },
  // ZAVRNJEN — NE SME biti v javnem seznamu:
  rejected: {
    id: "qh217-lok-rej",
    name: "QH217 Zavrnjen (neviden)",
    slug: "qh217-zavrnjen-neviden",
    description: "QH217 zavrnjeni testni lokal.",
    category: "bar",
    destinationId: "ptuj",
    destinationName: "Ptuj",
    address: "Testna 5, Ptuj",
    images: "[]",
    rejectionReason: "QH217 razlog zavrnitve",
    status: "rejected",
  },
} as const;

/** Skupni testni Owner (FK: Listing.ownerId → Owner.id — LASTNIK MORA
 * obstajati; poštena semena z realno povezavo, cleanup v afterAll). */
const OWNER_ID = "qh217-owner-real-1";
const OWNER_EMAIL = "qh217-lastnik@qh217.example";

async function ensureOwner() {
  const { db } = await import("@/lib/db");
  await db.owner.deleteMany({ where: { id: OWNER_ID } }).catch(() => {});
  return db.owner.create({
    data: {
      id: OWNER_ID,
      email: OWNER_EMAIL,
      name: "QH217 Testni lastnik",
      passwordHash: "qh217-ni-hash",
      businessName: "QH217 d.o.o.",
    },
  });
}

const ALL_IDS = Object.values(SEED).map((s) => s.id);

describe("QH LOKALI: funkcionalno — GET /api/listings (DB-gated)", () => {
  let dbReachable = false;

  beforeEach(() => {
    clearProviderRateLimits();
  });

  beforeAll(async () => {
    try {
      const { db } = await import("@/lib/db");
      await db.listing.count();
      dbReachable = true;
    } catch {
      dbReachable = false;
      return;
    }
    // Semena izven try/catch — napaka sejanja je NAPAKA TESTA ( ne
    // tihih zelenih skipov): vsak describe mora posejati podatke, sicer
    // beforeAll vrže in blok NE more lažno zeleneti.
    const { db } = await import("@/lib/db");
    await db.listing.deleteMany({ where: { id: { in: ALL_IDS } } });
    await ensureOwner();
    // p1 z REALNIM ownerId (FK izpolnjen) — FW1 preverba lažje ne bo vakuum:
    // ownerId mora biti STRIPAN iz javnega odgovora kljub temu, da obstaja.
    const { ownerId: _p1Owner, ...p1Seed } = SEED.p1;
    await db.listing.create({
      data: { ...p1Seed, ownerId: OWNER_ID, createdAt: new Date("2026-01-01T10:00:00Z") } as never,
    });
    await db.listing.create({
      data: { ...SEED.p3, createdAt: new Date("2026-01-01T11:00:00Z") } as never,
    });
    await db.listing.create({
      data: { ...SEED.p2, createdAt: new Date("2026-01-01T12:00:00Z") } as never,
    });
    await db.listing.create({
      data: { ...SEED.draft, createdAt: new Date("2026-01-01T13:00:00Z") } as never,
    });
    await db.listing.create({
      data: { ...SEED.rejected, createdAt: new Date("2026-01-01T14:00:00Z") } as never,
    });
  });

  afterAll(async () => {
    if (!dbReachable) return;
    try {
      const { db } = await import("@/lib/db");
      await db.listing.deleteMany({ where: { id: { in: ALL_IDS } } });
      await db.owner.deleteMany({ where: { id: OWNER_ID } });
    } catch {
      // čiščenje je best-effort
    }
  });

  function getListings(query: string) {
    return import("@/app/api/listings/route").then(({ GET }) =>
      GET(new Request(`http://localhost/api/listings${query}`))
    );
  }

  type ApiListing = {
    id: string;
    images: string[];
    specialties: string[];
    seasons?: string[];
    rating: number;
    featured: boolean;
    category: string;
    destinationId?: string | null;
    plan: string;
  };

  async function getIds(query: string): Promise<string[]> {
    const res = await getListings(query);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { listings: ApiListing[]; total: number };
    return data.listings.map((l) => l.id);
  }

  test("default: SAMO published (osnutek/zavrnjen nevidna), oblika + parsana JSON polja", async () => {
    if (!dbReachable) {
      console.log("[qh-lokali] DB ni dosegljiva — preskakujem DB primer");
      return;
    }
    const res = await getListings("");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { listings: ApiListing[]; total: number };

    expect(data.total).toBe(3);
    expect(data.listings.map((l) => l.id).sort()).toEqual(
      [SEED.p1.id, SEED.p2.id, SEED.p3.id].sort()
    );
    // Osnutek in zavrnjen NE SMETA prispeti:
    const body = JSON.stringify(data);
    expect(body).not.toContain(SEED.draft.id);
    expect(body).not.toContain(SEED.rejected.id);

    const p1 = data.listings.find((l) => l.id === SEED.p1.id)!;
    // JSON polja so PARSANA ( matrike, ne JSON nizi):
    expect(Array.isArray(p1.images)).toBe(true);
    expect(p1.images).toHaveLength(2);
    expect(Array.isArray(p1.specialties)).toBe(true);
    expect(p1.specialties).toHaveLength(2);
    expect(Array.isArray(p1.seasons)).toBe(true);
    expect(p1.seasons).toEqual(["spring", "summer"]);
  });

  test("FW1: interna polja (ownerEmail/rejectionReason/ownerId/aiRecommendations) NE iztečejo", async () => {
    if (!dbReachable) return;
    const res = await getListings("");
    expect(res.status).toBe(200);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain("qh217-tajni@ponudnik.example");
    // ownerId je v semenu REALNA FK vrednost — kljub temu javno izteči NE sme:
    expect(body).not.toContain(OWNER_ID);
    expect(body).not.toContain(OWNER_EMAIL);
    expect(body).not.toContain("QH217 interni razlog");
    expect(body).not.toContain("aiRecommendations");
    expect(body).not.toContain("draftNudge");
  });

  test("HROŠČ #2 POPRAVEK: privzeti featured sort = izpostavljeni PRVI, nato OCENA desc", async () => {
    if (!dbReachable) return;
    // Pričakovano PO popravku: p1 (featured) → p2 (4.8) → p3 (4.2).
    // Pred popravkom bi bil vrstni red p1 → p3 → p2 (vstavitveni).
    expect(await getIds("")).toEqual([SEED.p1.id, SEED.p2.id, SEED.p3.id]);
  });

  test("sort=rating: čista ureditev po oceni (featured NE dominira)", async () => {
    if (!dbReachable) return;
    expect(await getIds("?sort=rating")).toEqual([SEED.p2.id, SEED.p3.id, SEED.p1.id]);
  });

  test("sort=newest: ureditev po createdAt desc", async () => {
    if (!dbReachable) return;
    // p2 (12:00) → p3 (11:00) → p1 (10:00)
    expect(await getIds("?sort=newest")).toEqual([SEED.p2.id, SEED.p3.id, SEED.p1.id]);
  });

  test("sort=garbage: pošteno odpade na privzeti featured (NE 500)", async () => {
    if (!dbReachable) return;
    expect(await getIds("?sort=garbage")).toEqual([SEED.p1.id, SEED.p2.id, SEED.p3.id]);
  });

  test("filter category=restaurant (+ sentinel all)", async () => {
    if (!dbReachable) return;
    expect(await getIds("?category=restaurant")).toEqual([SEED.p1.id, SEED.p3.id]);
    expect((await getIds("?category=all")).length).toBe(3);
  });

  test("filter destinationId=bohinj (+ sentinel all)", async () => {
    if (!dbReachable) return;
    expect(await getIds("?destinationId=bohinj")).toEqual([SEED.p2.id]);
    expect((await getIds("?destinationId=all")).length).toBe(3);
  });

  test("filter plan=premium in featured=true", async () => {
    if (!dbReachable) return;
    expect(await getIds("?plan=premium")).toEqual([SEED.p1.id]);
    expect(await getIds("?featured=true")).toEqual([SEED.p1.id]);
  });

  test("HROŠČ #1 POPRAVEK: limit=abc → 200 (ne 500), varovalni privzeti 50", async () => {
    if (!dbReachable) return;
    const res = await getListings("?limit=abc");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { listings: unknown[]; total: number };
    expect(data.total).toBe(3);
  });

  test("limit=-5 / limit=0: varovalka ( degenerirana vrednost → privzeti 50)", async () => {
    if (!dbReachable) return;
    for (const lim of ["-5", "0"]) {
      const res = await getListings(`?limit=${lim}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { total: number };
      expect(data.total).toBe(3);
    }
  });

  test("limit>100: pokrit s cap 100 (brez napake)", async () => {
    if (!dbReachable) return;
    const res = await getListings("?limit=9999");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { total: number };
    expect(data.total).toBe(3); // sema ima 3 — cap 100 ne povzroči napake
  });
});

describe("QH LOKALI: funkcionalno — GET /api/listings/[slug] (DB-gated)", () => {
  let dbReachable = false;

  beforeEach(() => {
    clearProviderRateLimits();
  });

  beforeAll(async () => {
    try {
      const { db } = await import("@/lib/db");
      await db.listing.count();
      dbReachable = true;
    } catch {
      dbReachable = false;
      return;
    }
    // Semena izven try/catch ( enaka poštenost kot zgornji blok):
    const { db } = await import("@/lib/db");
    await db.listing.deleteMany({ where: { id: { in: ALL_IDS } } });
    await ensureOwner();
    const { ownerId: _slugOwner, ...p1Seed } = SEED.p1;
    await db.listing.create({
      data: { ...p1Seed, ownerId: OWNER_ID } as never,
    });
    await db.listing.create({ data: { ...SEED.draft } as never });
  });

  afterAll(async () => {
    if (!dbReachable) return;
    try {
      const { db } = await import("@/lib/db");
      await db.listing.deleteMany({ where: { id: { in: ALL_IDS } } });
      await db.owner.deleteMany({ where: { id: OWNER_ID } });
    } catch {
      // čiščenje je best-effort
    }
  });

  function getSlug(slug: string) {
    return import("@/app/api/listings/[slug]/route").then(({ GET }) =>
      GET(new Request(`http://localhost/api/listings/${slug}`), {
        params: Promise.resolve({ slug }),
      })
    );
  }

  test("published slug: 200 + oblika {listing} + sanitiziran (FW1)", async () => {
    if (!dbReachable) {
      console.log("[qh-lokali/slug] DB ni dosegljiva — preskakujem DB primer");
      return;
    }
    const res = await getSlug(SEED.p1.slug);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { listing: Record<string, unknown> };
    expect(data.listing.id).toBe(SEED.p1.id);
    expect(Array.isArray(data.listing.images)).toBe(true);
    expect(data.listing.images).toHaveLength(2);
    const body = JSON.stringify(data);
    expect(body).not.toContain("qh217-tajni@ponudnik.example");
    expect(body).not.toContain("QH217 interni razlog");
    expect(body).not.toContain(OWNER_ID);
  });

  test("OSNUTEK slug: iskren 404 (moderacijska vrata — javno ne obstaja)", async () => {
    if (!dbReachable) return;
    const res = await getSlug(SEED.draft.slug);
    expect(res.status).toBe(404);
  });

  test("neobstoječi slug: 404", async () => {
    if (!dbReachable) return;
    const res = await getSlug("qh217-ne-obstaja");
    expect(res.status).toBe(404);
  });

  test("viewCount se poveča ob ogledu (async increment)", async () => {
    if (!dbReachable) return;
    const { db } = await import("@/lib/db");
    const before = (await db.listing.findUnique({
      where: { id: SEED.p1.id },
      select: { viewCount: true },
    }))!.viewCount;

    const res = await getSlug(SEED.p1.slug);
    expect(res.status).toBe(200);

    // Increment je fire-and-forget — polling z (časovno varovanim) oknom:
    let after = before;
    for (let i = 0; i < 20 && after <= before; i++) {
      await new Promise((r) => setTimeout(r, 100));
      after = (await db.listing.findUnique({
        where: { id: SEED.p1.id },
        select: { viewCount: true },
      }))!.viewCount;
    }
    expect(after).toBeGreaterThan(before);
  });
});
