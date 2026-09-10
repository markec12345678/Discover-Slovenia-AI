import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";

// Statusi lead-a (admin upravljanje)
export type LeadStatus = "nov" | "kontaktiran" | "zakljucen";

// P4-2a: prej data/leads.json (fs) — zdaj PostgreSQL (model Lead).
// Odgovor ohranja polje "timestamp" (ISO string) za nazajnejsko
// združljivost z admin UI (Leadi tab).

const VALID_STATUSES: LeadStatus[] = ["nov", "kontaktiran", "zakljucen"];

function unauthorized() {
  return NextResponse.json(
    { error: "Neavtoriziran dostop" },
    { status: 401 }
  );
}

// GET /api/admin/leads — vsi leadovi (admin)
export async function GET(request: Request) {
  const adminPassword = request.headers.get("x-admin-password");
  if (!checkAdmin(adminPassword)) {
    return unauthorized();
  }

  try {
    const leads = await db.lead.findMany({ orderBy: { createdAt: "desc" } });
    const normalized = leads.map((l) => ({
      id: l.id,
      timestamp: l.createdAt.toISOString(),
      name: l.name,
      email: l.email,
      phone: l.phone ?? undefined,
      businessName: l.businessName,
      businessType: l.businessType,
      location: l.location,
      plan: l.plan,
      message: l.message ?? undefined,
      gdprConsent: l.gdprConsent,
      status: VALID_STATUSES.includes(l.status as LeadStatus)
        ? (l.status as LeadStatus)
        : "nov",
    }));
    return NextResponse.json({ leads: normalized, total: normalized.length });
  } catch (error) {
    console.error("[admin/leads] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju leadov" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/leads — posodobi status lead-a
// Telo: { id: string, status: "nov" | "kontaktiran" | "zakljucen" }
export async function PUT(request: Request) {
  const adminPassword = request.headers.get("x-admin-password");
  if (!checkAdmin(adminPassword)) {
    return unauthorized();
  }

  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return NextResponse.json(
        { error: "Manjkajoči podatki" },
        { status: 400 }
      );
    }
    const data = body as Record<string, unknown>;
    const id = typeof data.id === "string" ? data.id : null;
    const status = typeof data.status === "string" ? data.status : null;

    if (!id) {
      return NextResponse.json(
        { error: "ID lead-a je obvezen" },
        { status: 400 }
      );
    }
    if (!status || !VALID_STATUSES.includes(status as LeadStatus)) {
      return NextResponse.json(
        { error: "Neveljaven status" },
        { status: 400 }
      );
    }

    const updated = await db.lead.update({
      where: { id },
      data: { status: status as LeadStatus },
    }).catch(() => null);
    if (!updated) {
      return NextResponse.json(
        { error: "Lead ni najden" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      lead: {
        id: updated.id,
        timestamp: updated.createdAt.toISOString(),
        name: updated.name,
        email: updated.email,
        phone: updated.phone ?? undefined,
        businessName: updated.businessName,
        businessType: updated.businessType,
        location: updated.location,
        plan: updated.plan,
        message: updated.message ?? undefined,
        gdprConsent: updated.gdprConsent,
        status: updated.status as LeadStatus,
      },
      message: "Status posodobljen",
    });
  } catch (error) {
    console.error("[admin/leads] PUT napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri posodabljanju statusa" },
      { status: 500 }
    );
  }
}
