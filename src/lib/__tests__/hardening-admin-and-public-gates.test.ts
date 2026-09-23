// ============================================================================
// HARDENING MASTER TASK — V1/V2/V3/M2/M3: ADMIN ORACLES + JAVNI STATUS VRATA
// ============================================================================
// V1-V3 (P2): GET /api/debug-db, GET /api/analytics/funnel in GET
//   /api/admin/reject/[id] so klicali go checkAdmin BREZ rateLimit() —
//   vsak je bil neomezen brute-force oracle na skupno admin geslo
//   (401-vs-200), mimo kvot drugih admin rut ( projektova lastna konvencija
//   iz auth-guards.ts:268).
// M2 (P2): /api/listings/[slug]/track je sprejel vsak slug ( obstoj-only)
//   → naštevanje neobjavljenih slugov + napihovanje B2B metrik.
// M3 (P2): /api/reviews je sprejel recenzije za neobjavljene izdelke/
//   izkušnje ( obstoj-only) → recenzije, ki se pokažejo ob prihodnji objavi.
// ============================================================================
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("HARDENING V1-V3: admin GET rute uporabljajo requireAdmin (limit + preverba)", () => {
  test("debug-db: requireAdmin nadomešča go checkAdmin", () => {
    const src = read("src/app/api/debug-db/route.ts");
    expect(src).toContain("requireAdmin(request)");
    expect(src).not.toMatch(/if \(!checkAdmin\(/);
  });

  test("analytics/funnel: requireAdmin nadomešča go checkAdmin", () => {
    const src = read("src/app/api/analytics/funnel/route.ts");
    expect(src).toContain("requireAdmin(request)");
    expect(src).not.toMatch(/if \(!checkAdmin\(/);
  });

  test("admin/reject GET: requireAdmin ( POST obdrži lastni limit + checkAdmin)", () => {
    const src = read("src/app/api/admin/reject/[id]/route.ts");
    // GET sekcia
    const getIdx = src.indexOf("export async function GET");
    const getSection = src.slice(getIdx, getIdx + 500);
    expect(getSection).toContain("requireAdmin(request)");
    expect(getSection).not.toContain("if (!checkAdmin(");
    // POST obdrži svoj rateLimit + checkAdmin (dvojno štetje bi zategnilo)
    const postSection = src.slice(0, getIdx);
    expect(postSection).toContain("rateLimit(request");
    expect(postSection).toContain("checkAdmin(request.headers.get");
  });
});

describe("HARDENING M2: track sprejme SAMO objavljene lokale", () => {
  test("findUnique izbere status + uniformna 404 (brez razkritja statusa)", () => {
    const src = read("src/app/api/listings/[slug]/track/route.ts");
    expect(src).toContain("select: { id: true, status: true }");
    expect(src).toContain('listing.status !== "published"');
    // enak odgovor za neobjavljenega kot za neobstoječega
    expect(src).toContain("!listing || listing.status !== \"published\"");
  });
});

describe("HARDENING M3: recenzije SAMO za objavljene izdelke/izkušnje", () => {
  test("product in experience obstoj preverjata status", () => {
    const src = read("src/app/api/reviews/route.ts");
    expect(src.match(/exists\.status !== "published"/g)?.length).toBe(2);
    expect(src.match(/select: \{ id: true, status: true \}/g)?.length).toBe(2);
  });
});
