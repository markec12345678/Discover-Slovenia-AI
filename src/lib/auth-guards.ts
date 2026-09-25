import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { timingSafeEqual, adminSessionFrom } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// TIPI
// ============================================================================

export type Role =
  | "visitor"
  | "user"
  | "provider"
  | "premium"
  | "enterprise"
  | "moderator"
  | "admin"
  | "super_admin";

export type Resource =
  | "listing"
  | "product"
  | "experience"
  | "sponsorship"
  | "analytics"
  | "admin"
  | "user"
  | "owner"
  | "*"; // wildcard — vsi resursi (admin/super_admin)

export type Action = "read" | "create" | "update" | "delete" | "approve" | "manage" | "*";

export type Scope = "own" | "all";

export interface Permission {
  resource: Resource;
  action: Action;
  scope: Scope;
}

// ============================================================================
// ROLE → PERMISSIONS MAPPING
// ============================================================================

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  visitor: [
    { resource: "listing", action: "read", scope: "all" },
    { resource: "product", action: "read", scope: "all" },
    { resource: "experience", action: "read", scope: "all" },
  ],
  user: [
    { resource: "listing", action: "read", scope: "all" },
    { resource: "product", action: "read", scope: "all" },
    { resource: "experience", action: "read", scope: "all" },
    { resource: "user", action: "manage", scope: "own" },
  ],
  provider: [
    { resource: "listing", action: "read", scope: "all" },
    { resource: "listing", action: "create", scope: "own" },
    { resource: "listing", action: "update", scope: "own" },
    { resource: "listing", action: "delete", scope: "own" },
    { resource: "product", action: "create", scope: "own" },
    { resource: "product", action: "update", scope: "own" },
    { resource: "product", action: "delete", scope: "own" },
    { resource: "experience", action: "create", scope: "own" },
    { resource: "experience", action: "update", scope: "own" },
    { resource: "experience", action: "delete", scope: "own" },
    { resource: "analytics", action: "read", scope: "own" },
    { resource: "owner", action: "manage", scope: "own" },
  ],
  premium: [
    // Vse od provider +
    { resource: "listing", action: "read", scope: "all" },
    { resource: "listing", action: "create", scope: "own" },
    { resource: "listing", action: "update", scope: "own" },
    { resource: "listing", action: "delete", scope: "own" },
    { resource: "product", action: "create", scope: "own" },
    { resource: "product", action: "update", scope: "own" },
    { resource: "product", action: "delete", scope: "own" },
    { resource: "experience", action: "create", scope: "own" },
    { resource: "experience", action: "update", scope: "own" },
    { resource: "experience", action: "delete", scope: "own" },
    { resource: "analytics", action: "read", scope: "own" },
    { resource: "sponsorship", action: "create", scope: "own" },
    { resource: "owner", action: "manage", scope: "own" },
  ],
  enterprise: [
    // Vse od premium + API dostop
    { resource: "listing", action: "read", scope: "all" },
    { resource: "listing", action: "create", scope: "own" },
    { resource: "listing", action: "update", scope: "own" },
    { resource: "listing", action: "delete", scope: "own" },
    { resource: "product", action: "create", scope: "own" },
    { resource: "product", action: "update", scope: "own" },
    { resource: "product", action: "delete", scope: "own" },
    { resource: "experience", action: "create", scope: "own" },
    { resource: "experience", action: "update", scope: "own" },
    { resource: "experience", action: "delete", scope: "own" },
    { resource: "analytics", action: "read", scope: "own" },
    { resource: "sponsorship", action: "create", scope: "own" },
    { resource: "owner", action: "manage", scope: "own" },
  ],
  moderator: [
    { resource: "listing", action: "read", scope: "all" },
    { resource: "listing", action: "update", scope: "all" },
    { resource: "listing", action: "approve", scope: "all" },
    { resource: "listing", action: "delete", scope: "all" },
    { resource: "product", action: "update", scope: "all" },
    { resource: "product", action: "delete", scope: "all" },
    { resource: "experience", action: "update", scope: "all" },
    { resource: "experience", action: "delete", scope: "all" },
  ],
  admin: [
    { resource: "*", action: "*", scope: "all" },
  ],
  super_admin: [
    { resource: "*", action: "*", scope: "all" },
  ],
};

// ============================================================================
// HELPER FUNKCIJE
// ============================================================================

/**
 * P1: ali je seja B2C računa popotnika (provider "user")?
 *
 * VARNOST: Owner in User tabele imata NEODVISNA unique omejitve na email —
 * isti email lahko obstaja v obeh. Ker requireOwner/requireOwnership
 * resolverata Owner zapise prek session email, bi B2C seja s "kollideranim"
 * emailom dobila dostop do tujega ponudniškega računa. accountType v žetonu
 * (nastavljen ob prijavi) to zanesljivo prepreči.
 */
function isUserAccount(session: { user?: { accountType?: string } | null } | null): boolean {
  return session?.user?.accountType === "user";
}

/**
 * Preveri ali ima določena vloga določeno dovoljenje.
 */
export function canPerform(role: Role, perm: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.some(
    (p) =>
      (p.resource === perm.resource || p.resource === "*") &&
      (p.action === perm.action || p.action === "*") &&
      p.scope === perm.scope
  );
}

/**
 * Določi vlogo trenutnega uporabnika na podlagi seje ali admin gesla.
 */
export async function getCurrentRole(request?: Request): Promise<Role> {
  // 1. Preveri admin password (header-based auth za admin endpointe)
  // VARNOST (1.28.0, uporabnikova revizija #8): timing-safe prek checkAdmin()
  // — prej navaden `===` (edino preostalo mesto z napačno politiko; vse
  // ostale admin poti so že uporabljale checkAdmin/verifyCronAuth).
  // Semantika enaka: fail-closed brez ADMIN_PASSWORD, enak 401 potek.
  if (request) {
    if (checkAdmin(request)) {
      return "admin";
    }
  }

  // 2. Preveri NextAuth sejo
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return "visitor";
  }

  // P1: B2C račun (popotnik) — nikoli ponudniške pravice, tudi če bi
  // naključno kollideral z Owner emailom (glej isUserAccount)
  if (isUserAccount(session)) {
    return "user";
  }

  // 3. Pridobi owner iz baze za aktualni role in plan
  const owner = await db.owner.findUnique({
    where: { email: session.user.email },
    select: { plan: true, role: true },
  });

  if (!owner) {
    return "user"; // registriran uporabnik brez owner zapisa
  }

  // 4. Če je role moderator/admin/super_admin, uporabi ta role
  if (owner.role === "moderator") return "moderator";
  if (owner.role === "admin") return "admin";
  if (owner.role === "super_admin") return "super_admin";

  // 5. Sicer določi glede na plan
  if (owner.plan === "premium") return "premium";
  if (owner.plan === "enterprise") return "enterprise";

  return "provider";
}

/**
 * Pridobi trenutno sejo in owner ID (za provider endpointe).
 */
export async function requireOwner() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || isUserAccount(session)) {
    return {
      error: NextResponse.json(
        { error: "Niste prijavljeni", code: "UNAUTHORIZED" },
        { status: 401 }
      ),
      session: null,
      ownerId: null,
    };
  }

  const owner = await db.owner.findUnique({
    where: { email: session.user.email },
    select: { id: true, plan: true, role: true },
  });

  if (!owner) {
    return {
      error: NextResponse.json(
        { error: "Lastnik ni najden", code: "NOT_FOUND" },
        { status: 404 }
      ),
      session: null,
      ownerId: null,
    };
  }

  return {
    error: null,
    session,
    ownerId: owner.id,
    ownerPlan: owner.plan,
    ownerRole: owner.role,
  };
}

/**
 * Preveri ali je uporabnik admin.
 *
 * ISSUE #4 §24 (VAL 8, P2): sprejme tudi CELO zahtevo — takrat preveri
 * najprej HTTPONLY session piškotek `dsa_admin_session` (izda ga
 * POST /api/admin/verify ob pravilnem geslu; geslo NE živi v brskalniku),
 * nato še klasično glavo x-admin-password (nazaj kompatibilno za
 * skripte/integracije). Nizi ostanejo sprejeti za neposredne primerjave
 * gesla (npr. verify route iz telesa zahteve).
 *
 * VARNOST: constant-time (timing-safe) primerjava — preprečuje timing
 * napade na ugibanje admin gesla. Fail-closed, če ADMIN_PASSWORD ni nastavljen.
 */
export function checkAdmin(
  input: Request | string | null | undefined
): boolean {
  // Pot A (VAL 8): httpOnly session piškotek — preverjen PRVI.
  if (typeof input === "object" && input != null) {
    if (adminSessionFrom(input)) return true;
    const header = input.headers.get("x-admin-password");
    return checkAdmin(header);
  }
  // Pot B: surovo geslo (glava / telo / skripte).
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || !input) return false;
  return timingSafeEqual(input, adminPassword);
}

/**
 * requireAdmin — SKUPNA vrata za admin endpointe (revizija 1.33.0, auditorska
 * ugotovitev 16-a P2): rate limit + timing-safe preverba gesla v enem klicu.
 *
 * Zakaj: checkAdmin je timing-safe, a NE šteje poskusov — vsak admin route,
 * ki ga klice brez lastnega rateLimit(), je NEOMEJEN brute-force oracle
 * (401 vs 200 ugibanje gesla). Zdaj vse te rute delijo EN bucket na IP
 * (key "admin-any" — napadalec si z izbiro različnih rut ne pomnoži kvote).
 *
 * Limit 60/10 min: legit admin dashboard naredi ~6-10 zahtev na osvežitev —
 * 60 pomeni 6+ osvežitev na 10 min, kar za pokriva; vsako ugibanje gesla
 * pa šteje v isti bucket. Že rate-limited admin rute (verify 10/10min,
 * approve 60/10min, ...) obdržijo svoje limite (dvojno štetje bi jih le
 * zategnilo) — requireAdmin uporabljaj samo na rutah BREZ lastnega limita.
 *
 * Vrne `null`, če je klic avtoriziran; sicer 429 (preveč poskusov) ali 401.
 */
export function requireAdmin(request: Request): NextResponse | null {
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: 10 * 60_000,
    key: "admin-any",
  });
  if (limited) return limited;
  if (!checkAdmin(request)) {
    return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
  }
  return null;
}

/**
 * Preveri ali trenutni uporabnik lasti specifičen resource.
 * Za "own" scope — preveri ali je ownerId lastnika enak trenutnemu.
 *
 * VARNOST (1.29.0, uporabnikova revizija #9 — P7-B/P9 footgun):
 * ta helper je zdaj VARNA LASTNIŠKA MEJA po privzetem. Prej so vloge
 * admin / super_admin / moderator dobile `authorized: true` za KATERIKOLI
 * resource (bypass) — tiho, brez opt-in klicnega mesta. Novo vedenje:
 *
 *   - privzeto (brez opts): STROGA lastniška preverba za VSE — tudi osebje
 *     gre čez isto primerjavo ownerId kot vsi drugi (fail-closed);
 *   - opts.allowStaffAccess: true → izrecni, viden opt-in za prihodnje
 *     "support dostope", kjer je bypass želen (vsako takšno mesto je
 *     zdaj vidno v grep po allowStaffAccess).
 *
 * Status (P7-B audit, 2026-09): 0 klicalcev v API rteh → sprememba
 * ne spreminja obnašanja nobene obstoječe poti.
 */
export async function requireOwnership(
  resource: "listing" | "product" | "experience",
  resourceId: string,
  opts?: { allowStaffAccess?: boolean }
): Promise<{ authorized: boolean; ownerId: string | null }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || isUserAccount(session)) {
    return { authorized: false, ownerId: null };
  }

  const owner = await db.owner.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  });

  if (!owner) {
    return { authorized: false, ownerId: null };
  }

  // Osebje (admin/super_admin/moderator) samo z IZRICNIM opt-in klicnega
  // mesta — privzeto gredo čez isto lastniško preverbo kot vsi drugi.
  if (
    opts?.allowStaffAccess === true &&
    (owner.role === "admin" ||
      owner.role === "super_admin" ||
      owner.role === "moderator")
  ) {
    return { authorized: true, ownerId: owner.id };
  }

  // Preveri lastništvo
  const item = await (db[resource] as any).findUnique({
    where: { id: resourceId },
    select: { ownerId: true },
  });

  if (!item) {
    return { authorized: false, ownerId: null };
  }

  return {
    authorized: item.ownerId === owner.id,
    ownerId: owner.id,
  };
}

/**
 * Preveri ali ima uporabnik določeno dovoljenje in vrši API response če nima.
 * Uporaba v API route:
 *
 * const role = await getCurrentRole(request);
 * if (!canPerform(role, { resource: "listing", action: "approve", scope: "all" })) {
 *   return NextResponse.json({ error: "Nimate dovoljenja" }, { status: 403 });
 * }
 */
export function unauthorizedResponse(permission: Permission): NextResponse {
  return NextResponse.json(
    {
      error: "Nimate dovoljenja za to dejanje",
      code: "FORBIDDEN",
      required: permission,
    },
    { status: 403 }
  );
}
