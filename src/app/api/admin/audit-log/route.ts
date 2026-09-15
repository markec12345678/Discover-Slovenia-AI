import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";

// GET /api/admin/audit-log — zadnje admin/owner akcije
// Header: x-admin-password
// Query: ?action=listing_approved&limit=50
export async function GET(request: Request) {
  try {
    if (!checkAdmin(request.headers.get("x-admin-password"))) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const resourceType = searchParams.get("resourceType");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (resourceType) where.resourceType = resourceType;

    const logs = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Parse metadata JSON
    const parsed = logs.map((l) => ({
      ...l,
      metadata: l.metadata ? JSON.parse(l.metadata) : null,
      timeAgo: Math.round((Date.now() - l.createdAt.getTime()) / 1000 / 60), // minutes ago
    }));

    return NextResponse.json({
      logs: parsed,
      total: parsed.length,
    });
  } catch (error) {
    console.error("[admin/audit-log] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
