// ============================================================================
// TASK 28 (Tier 1 #2) — ŽETON »OVERJENA REZERVACIJA« (GYG-model zaupanja)
// ============================================================================
// Spremembe, ki jih ta datoteka varuje:
//   1. Review.verified (schema + prisma/migrations/20260926100000 +
//      startup samoozdravitvena dvojnica src/lib/review-verified-migration.ts
//      + registracija v instrumentation.ts) — SNIMAK ob objavi, ne živa veza;
//   2. POST /api/reviews IZRAČUNA verified strežniško (nikoli klientova
//      trditev): veriga A sessionUser→SavedItinerary.userId→shareId→own-rezervacija
//      (CONFIRMED/PAID/MODIFIED — PROVIDER_CONFIRMED_STATUSES, EN vir v
//      booking.ts) + veriga B plannerSessionKey→JourneyBooking.sessionKey;
//   3. Izdelki (Product) NIKOLI ne dobijo žetona (affiliate rezervacije pri
//      zunanjih ponudnikih — ni deterministične veze, ne lažemo);
//   4. GET /api/reviews vrača verified; ReviewSection prikaže žeton
//      »Overjena rezervacija« SAMO ob verified === true in pošlje
//      plannerSessionKey SAMO za izkušnje.
//
// Struktura (konvencija issue6-d6b-pdf.test.ts):
//   · UNIT migracije z vbrizganim klientom (sqlite/postgres detekcija);
//   · SOURCE-CONTRACT rute/komponent/sheme/migracije;
//   · FUNKCIONALNO ruto (samo kadar je DB dosegljiva — pošten skip;
//     TASK 76 higiena: clearProviderRateLimits v beforeEach). Veriga A
//     (prijavljen uporabnik) je izven funkcionalnega testa — suite NE
//     mocka next-auth seje (kanon „NO mock.module"); njena koda je
//     pokrita s source-contractom spodaj.
// ============================================================================
import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
// TASK 76 higiena: funkcionalni blok dinamično uvaža route handler prek
// @/app/api → troši žetone deljenega omejevalnika runnerja → okno OBVEZNO
// počistimo (konvencija suite-a, glej task76-suite-hygiene.test.ts).
import { clearProviderRateLimits } from "@/lib/supply/search";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const reviewsRouteSrc = read("src/app/api/reviews/route.ts");
const reviewSectionSrc = read("src/components/review-section.tsx");
const bookingSrc = read("src/lib/journey/booking.ts");
const migrationSrc = read("src/lib/review-verified-migration.ts");
const instrumentationSrc = read("src/instrumentation.ts");
const schemaSrc = read("prisma/schema.prisma");
const migrationSqlPath = join(
  ROOT,
  "prisma/migrations/20260926100000_review_verified/migration.sql"
);

// ---------------------------------------------------------------------------
// 1. UNIT — startup migracija z vbrizganim klientom (vzorec task87)
// ---------------------------------------------------------------------------

describe("TASK 28: review-verified-migration — unit z vbrizganim klientom", () => {
  function sqliteClient(columns: string[]) {
    const executed: string[] = [];
    return {
      client: {
        $queryRawUnsafe: async (sql: string) => {
          if (sql.startsWith("PRAGMA table_info(Review)")) {
            return columns.map((name, cid) => ({ cid, name, type: "BOOLEAN" }));
          }
          throw new Error("neočekivana poizvedba: " + sql);
        },
        $executeRawUnsafe: async (sql: string) => {
          executed.push(sql);
          return 1;
        },
      } as never,
      executed,
    };
  }

  function postgresClient(columns: string[], includeVerified: boolean) {
    const executed: string[] = [];
    const cols = includeVerified
      ? columns.concat("verified")
      : columns.slice();
    return {
      client: {
        $queryRawUnsafe: async (sql: string) => {
          if (sql.includes("information_schema.columns")) {
            return cols.map((column_name) => ({ column_name }));
          }
          throw new Error("PRAGMA na postgresu je sintaksna napaka");
        },
        $executeRawUnsafe: async (sql: string) => {
          executed.push(sql);
          return 1;
        },
      } as never,
      executed,
    };
  }

  test("sqlite: manjkajoč stolpec → ADD COLUMN (goli identifikatorji)", async () => {
    const { migrateReviewVerifiedColumnWith } = await import(
      "@/lib/review-verified-migration"
    );
    const { client, executed } = sqliteClient(["id", "authorName", "rating"]);
    const r = await migrateReviewVerifiedColumnWith(client);
    expect(r.dialect).toBe("sqlite");
    expect(r.columnAdded).toBe(true);
    expect(executed.length).toBe(1);
    expect(executed[0]).toContain("ALTER TABLE Review ADD COLUMN verified");
    expect(executed[0]).toContain("BOOLEAN NOT NULL DEFAULT false");
    // citirani identifikatorji NE (sqlite driver jih ubeži — kanon t87)
    expect(executed[0]).not.toContain('"verified"');
  });

  test("sqlite: stolpec ŽE obstaja → idempotentno brez ALTER", async () => {
    const { migrateReviewVerifiedColumnWith } = await import(
      "@/lib/review-verified-migration"
    );
    const { client, executed } = sqliteClient([
      "id",
      "authorName",
      "rating",
      "verified",
    ]);
    const r = await migrateReviewVerifiedColumnWith(client);
    expect(r.dialect).toBe("sqlite");
    expect(r.columnAdded).toBe(false);
    expect(executed.length).toBe(0);
  });

  test("postgres: manjkajoč stolpec → citiran ADD COLUMN", async () => {
    const { migrateReviewVerifiedColumnWith } = await import(
      "@/lib/review-verified-migration"
    );
    const { client, executed } = postgresClient(
      ["id", "authorName", "rating"],
      false
    );
    const r = await migrateReviewVerifiedColumnWith(client);
    expect(r.dialect).toBe("postgres");
    expect(r.columnAdded).toBe(true);
    expect(executed.length).toBe(1);
    expect(executed[0]).toContain(
      'ALTER TABLE "Review" ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false'
    );
  });

  test("nedosegljiva DB → unknown, fail-open (0 ALTER, 0 napak)", async () => {
    const { migrateReviewVerifiedColumnWith } = await import(
      "@/lib/review-verified-migration"
    );
    const client = {
      $queryRawUnsafe: async () => {
        throw new Error("DB down");
      },
      $executeRawUnsafe: async () => {
        throw new Error("NE SME se klicati");
      },
    } as never;
    const r = await migrateReviewVerifiedColumnWith(client);
    expect(r.dialect).toBe("unknown");
    expect(r.columnAdded).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. SOURCE-CONTRACT — integracijske točke
// ---------------------------------------------------------------------------

describe("TASK 28: source-contract — žeton »overjena rezervacija«", () => {
  test("schema.prisma: Review.verified Boolean @default(false)", () => {
    expect(schemaSrc).toMatch(
      /verified\s+Boolean\s+@default\(false\)/
    );
  });

  test("prisma migracija obstaja z additive-only ALTER (NOT NULL DEFAULT false)", () => {
    expect(existsSync(migrationSqlPath)).toBe(true);
    const sql = readFileSync(migrationSqlPath, "utf8");
    expect(sql).toContain(
      'ALTER TABLE "Review" ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false;'
    );
    // additive-only: nikoli ne DROP/spreminja obstoječih stolpcev
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
    expect(sql).not.toMatch(/ALTER\s+COLUMN/i);
  });

  test("instrumentation.ts registrira schema:review-verified (4 statusi)", () => {
    expect(instrumentationSrc).toContain('"schema:review-verified"');
    const statuses = instrumentationSrc.match(
      /name: "schema:review-verified",\s*\n\s*status: "(\w+)"/g
    );
    expect(statuses).not.toBeNull();
    expect(statuses!.length).toBe(4);
  });

  test("booking.ts: PROVIDER_CONFIRMED_STATUSES = en vir resnice", () => {
    expect(bookingSrc).toContain(
      'export const PROVIDER_CONFIRMED_STATUSES: ConfirmationStatus[] = ['
    );
    expect(bookingSrc).toContain('"CONFIRMED"');
    expect(bookingSrc).toContain('"PAID"');
    expect(bookingSrc).toContain('"MODIFIED"');
    // isProviderConfirmed uporablja ISTO množico (drift nemogoč)
    expect(bookingSrc).toContain(
      "return PROVIDER_CONFIRMED_STATUSES.includes(status);"
    );
  });

  test("reviews route: izračun je strežniški (žeton se NE zaupa klientu)", () => {
    // verigi A + B prisotni
    expect(reviewsRouteSrc).toContain("computeReviewVerified");
    expect(reviewsRouteSrc).toContain("SavedItinerary");
    expect(reviewsRouteSrc).toContain("sessionKey: plannerSessionKey");
    // status filter iz ENEGA vira (ne ad-hoc seznama v ruti)
    expect(reviewsRouteSrc).toContain(
      "status: { in: PROVIDER_CONFIRMED_STATUSES }"
    );
    // fail-closed žetona ob napaki — objava nadaljuje
    expect(reviewsRouteSrc).toContain("Fail-closed SAMO za žeton");
    // klientova trditev NE obstaja kot vnos (žeton ni v telesu!)
    expect(reviewsRouteSrc).not.toContain("body.verified");
    expect(reviewsRouteSrc).not.toContain("b.verified");
    // formatna validacija seje pred poizvedbo
    expect(reviewsRouteSrc).toContain("PLANNER_SESSION_KEY_RE");
  });

  test("reviews route: žeton SAMO za izkušnje (izdelek → vedno false)", () => {
    expect(reviewsRouteSrc).toContain(
      "const verified = target.experienceId"
    );
    expect(reviewsRouteSrc).toContain(": false;");
  });

  test("reviews route: verified v SELECTU objave IN seznama (GET)", () => {
    // 2 pojavitve: POST select + GET select (create data nosi IZRAČUNANO
    // spremenljivko verified, ne literal true — to varuje drug test)
    expect(reviewsRouteSrc.match(/verified: true/g)?.length).toBe(2);
    // create nosi izračun (ne konstanto!)
    expect(reviewsRouteSrc).toContain(
      "data: { ...target, authorName, rating, comment, verified }"
    );
  });

  test("ReviewSection: žeton prikazan SAMO ob verified === true", () => {
    expect(reviewSectionSrc).toContain("{r.verified === true && (");
    expect(reviewSectionSrc).toContain("Overjena rezervacija");
    expect(reviewSectionSrc).toContain("BadgeCheck");
    // tooltip nosi RESNICO (kaj žeton dokazuje — ne pretirujemo)
    expect(reviewSectionSrc).toContain(
      "Ob objavi mnenja je obstajala potrjena rezervacija"
    );
  });

  test("ReviewSection: plannerSessionKey poslan SAMO za izkušnje", () => {
    expect(reviewSectionSrc).toContain(
      "...(experienceId ? { plannerSessionKey: plannerSessionId() } : {}),"
    );
  });
});

// ---------------------------------------------------------------------------
// 3. FUNKCIONALNO — POST/GET /api/reviews (DB-gated, TASK 76)
// ---------------------------------------------------------------------------

describe("TASK 28: funkcionalno — žeton v POST/GET /api/reviews", () => {
  let dbReachable = false;
  const createdReviewIds: string[] = [];
  const createdBookingIds: string[] = [];
  const createdExperienceIds: string[] = [];
  const createdProductIds: string[] = [];

  beforeEach(() => {
    clearProviderRateLimits();
  });

  beforeAll(async () => {
    try {
      const { db } = await import("@/lib/db");
      await db.review.count();
      dbReachable = true;
    } catch {
      dbReachable = false;
    }
  });

  afterAll(async () => {
    if (!dbReachable) return;
    try {
      const { db } = await import("@/lib/db");
      if (createdReviewIds.length > 0) {
        await db.review.deleteMany({ where: { id: { in: createdReviewIds } } });
      }
      if (createdBookingIds.length > 0) {
        await db.journeyBooking.deleteMany({
          where: { id: { in: createdBookingIds } },
        });
      }
      if (createdExperienceIds.length > 0) {
        await db.experience.deleteMany({
          where: { id: { in: createdExperienceIds } },
        });
      }
      if (createdProductIds.length > 0) {
        await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
      }
    } catch {
      // čiščenje je best-effort
    }
  });

  function expData(id: string, name: string) {
    return {
      id,
      name,
      slug: `t28-${id}`,
      description: "Testna izkušnja T28 (funkcijski test).",
      category: "tour",
      pricePerPerson: 25,
      durationHours: 2,
      languages: "[\"sl\"]",
      address: "Testna 1, Ljubljana",
      images: "[]",
      providerName: "Testni ponudnik T28",
      status: "published",
    };
  }

  function prodData(id: string, name: string) {
    return {
      id,
      name,
      slug: `t28-p-${id}`,
      description: "Testni izdelek T28 (funkcijski test).",
      category: "souvenir",
      price: 15,
      images: "[]",
      sellerName: "Testni prodajalec T28",
      status: "published",
    };
  }

  function postReview(body: Record<string, unknown>, ip: string) {
    return import("@/app/api/reviews/route").then(({ POST }) =>
      POST(
        new Request("http://localhost/api/reviews", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": ip,
          },
          body: JSON.stringify(body),
        })
      )
    );
  }

  function getReviews(param: string, id: string, ip: string) {
    return import("@/app/api/reviews/route").then(({ GET }) =>
      GET(
        new Request(`http://localhost/api/reviews?${param}=${id}`, {
          headers: { "x-forwarded-for": ip },
        })
      )
    );
  }

  test("veriga B: CONFIRMED own-rezervacija + plannerSessionKey → verified TRUE", async () => {
    if (!dbReachable) {
      console.log("[task28] DB ni dosegljiva — preskakujem DB primer");
      return;
    }
    const { db } = await import("@/lib/db");
    const expId = "t28exp0000000000000001";
    createdExperienceIds.push(expId);
    await db.experience.create({ data: expData(expId, "Testna izkušnja T28") });
    const bookingId = "t28book0000000000000001";
    createdBookingIds.push(bookingId);
    await db.journeyBooking.create({
      data: {
        id: bookingId,
        sessionKey: "t28-session-key-1",
        provider: "own",
        providerProductId: expId,
        status: "CONFIRMED",
        source: "USER",
      } as never,
    });

    const res = await postReview(
      {
        experienceId: expId,
        authorName: "Ana Testna",
        rating: 5,
        comment: "Odlična izkušnja, vse po pričakovanjih!",
        plannerSessionKey: "t28-session-key-1",
      },
      "10.88.28.1"
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as {
      review?: { id?: string; verified?: boolean };
    };
    expect(data.review?.verified).toBe(true);
    createdReviewIds.push(data.review!.id!);

    // GET tudi vrača verified (javni seznam)
    const list = await getReviews("experienceId", expId, "10.88.28.2");
    expect(list.status).toBe(200);
    const listData = (await list.json()) as {
      reviews?: Array<{ id: string; verified?: boolean }>;
    };
    const mine = listData.reviews?.find((r) => r.id === data.review!.id);
    expect(mine?.verified).toBe(true);
  });

  test("NEPOTRJENA rezervacija (SELECTED) → verified FALSE (iskrenost)", async () => {
    if (!dbReachable) return;
    const { db } = await import("@/lib/db");
    const expId = "t28exp0000000000000002";
    createdExperienceIds.push(expId);
    await db.experience.create({ data: expData(expId, "Testna izkušnja T28 b") });
    const bookingId = "t28book0000000000000002";
    createdBookingIds.push(bookingId);
    // SELECTED = izbrano, NE potrjeno — žeton iskreno NE sme zasvetiti
    await db.journeyBooking.create({
      data: {
        id: bookingId,
        sessionKey: "t28-session-key-2",
        provider: "own",
        providerProductId: expId,
        status: "SELECTED",
      } as never,
    });

    const res = await postReview(
      {
        experienceId: expId,
        authorName: "Borut Testni",
        rating: 4,
        comment: "Zelo dobro, priporočam obisk vsebovalcem.",
        plannerSessionKey: "t28-session-key-2",
      },
      "10.88.28.3"
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as {
      review?: { id?: string; verified?: boolean };
    };
    expect(data.review?.verified).toBe(false);
    createdReviewIds.push(data.review!.id!);
  });

  test("TUJA seja / brez seje → verified FALSE (ne moremo dokazati)", async () => {
    if (!dbReachable) return;
    const { db } = await import("@/lib/db");
    const expId = "t28exp0000000000000003";
    createdExperienceIds.push(expId);
    await db.experience.create({ data: expData(expId, "Testna izkušnja T28 c") });
    const bookingId = "t28book0000000000000003";
    createdBookingIds.push(bookingId);
    await db.journeyBooking.create({
      data: {
        id: bookingId,
        sessionKey: "t28-session-key-3",
        provider: "own",
        providerProductId: expId,
        status: "CONFIRMED",
        source: "USER",
      } as never,
    });

    // druga seja (nelastna rezervacija)
    const res = await postReview(
      {
        experienceId: expId,
        authorName: "Cilka Testna",
        rating: 5,
        comment: "Najboljša izkušnja letos, brez zadržkov!",
        plannerSessionKey: "t28-session-key-DRUGA-seja",
      },
      "10.88.28.4"
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as {
      review?: { id?: string; verified?: boolean };
    };
    expect(data.review?.verified).toBe(false);
    createdReviewIds.push(data.review!.id!);
  });

  test("IZDELEK: niti lastna CONFIRMED own-rezervacija ne da žetona", async () => {
    if (!dbReachable) return;
    const { db } = await import("@/lib/db");
    const prodId = "t28prod0000000000000001";
    createdProductIds.push(prodId);
    await db.product.create({ data: prodData(prodId, "Testni izdelek T28") });
    // sabotažni poskus: rezervacija z providerProductId = izdelek.id
    // (product target) — žeton VSEENO ne sme zasvetiti (koda tega ne šteje)
    const bookingId = "t28book0000000000000004";
    createdBookingIds.push(bookingId);
    await db.journeyBooking.create({
      data: {
        id: bookingId,
        sessionKey: "t28-session-key-4",
        provider: "own",
        providerProductId: prodId,
        status: "CONFIRMED",
        source: "USER",
      } as never,
    });

    const res = await postReview(
      {
        productId: prodId,
        authorName: "Denis Testni",
        rating: 3,
        comment: "Zadovoljiv izdelek za to ceno, nič posebnega.",
        plannerSessionKey: "t28-session-key-4",
      },
      "10.88.28.5"
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as {
      review?: { id?: string; verified?: boolean };
    };
    expect(data.review?.verified).toBe(false);
    createdReviewIds.push(data.review!.id!);
  });

  test("neveljaven plannerSessionKey format → varno ignoriran (objava uspe)", async () => {
    if (!dbReachable) return;
    const { db } = await import("@/lib/db");
    const expId = "t28exp0000000000000004";
    createdExperienceIds.push(expId);
    await db.experience.create({ data: expData(expId, "Testna izkušnja T28 d") });
    const res = await postReview(
      {
        experienceId: expId,
        authorName: "Eva Testna",
        rating: 5,
        comment: "Čudovito doživetje v slovenski naravi!",
        plannerSessionKey: "INLINE-SCRIPT-<script>!",
      },
      "10.88.28.6"
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as {
      review?: { id?: string; verified?: boolean };
    };
    expect(data.review?.verified).toBe(false);
    createdReviewIds.push(data.review!.id!);
  });
});
