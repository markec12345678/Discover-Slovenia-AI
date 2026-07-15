import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

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
  | "owner";

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
  if (request) {
    const adminPassword = request.headers.get("x-admin-password");
    if (adminPassword && adminPassword === process.env.ADMIN_PASSWORD) {
      return "admin";
    }
  }

  // 2. Preveri NextAuth sejo
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return "visitor";
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
  if (!session?.user?.email) {
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
 * Preveri ali je uporabnik admin (preko admin gesla).
 */
export function checkAdmin(password: string | null | undefined): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  return password === adminPassword;
}

/**
 * Preveri ali trenutni uporabnik lasti specifičen resource.
 * Za "own" scope — preveri ali je ownerId lastnika enak trenutnemu.
 */
export async function requireOwnership(
  resource: "listing" | "product" | "experience",
  resourceId: string
): Promise<{ authorized: boolean; ownerId: string | null }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { authorized: false, ownerId: null };
  }

  const owner = await db.owner.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  });

  if (!owner) {
    return { authorized: false, ownerId: null };
  }

  // Admin in moderator lahko dostopajo do vsega
  if (owner.role === "admin" || owner.role === "super_admin" || owner.role === "moderator") {
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
