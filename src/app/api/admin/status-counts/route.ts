import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";

// GET /api/admin/status-counts — števci lokalov po statusu
// Header: x-admin-password
export async function GET(request: Request) {
  try {
    if (!checkAdmin(request.headers.get("x-admin-password"))) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    // Group by status
    const statusGroups = await db.listing.groupBy({
      by: ["status"],
      _count: { _all: true },
    });

    // Group by partnerStatus
    const partnerGroups = await db.listing.groupBy({
      by: ["partnerStatus"],
      _count: { _all: true },
    });

    // Build status counts
    const statusCounts: Record<string, number> = {
      draft: 0,
      pending: 0,
      approved: 0,
      published: 0,
      rejected: 0,
      expired: 0,
      archived: 0,
      deleted: 0,
    };

    for (const g of statusGroups) {
      statusCounts[g.status] = g._count._all;
    }

    // Build partner counts
    const partnerCounts: Record<string, number> = {
      standard: 0,
      verified: 0,
      premium: 0,
      featured: 0,
    };

    for (const g of partnerGroups) {
      partnerCounts[g.partnerStatus] = g._count._all;
    }

    // Total
    const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);

    return NextResponse.json({
      status: statusCounts,
      partner: partnerCounts,
      total,
      // Highlight pending (admin needs to act)
      pendingCount: statusCounts.pending,
    });
  } catch (error) {
    console.error("[admin/status-counts] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
