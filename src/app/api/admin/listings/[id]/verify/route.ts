import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/admin/listings/[id]/verify — eksplicitna admin verifikacija lokala
// Header: x-admin-password
// Body: { verify?: boolean } (default true)
//
// P4-2b: znak "Preverjen partner" ni več samodejen ob odobritvi —
// admin ga podeli/umakne z explicitno odločitvijo TUKAJ.
//
// verify=true:
//   - verifiedByAdmin → true, verified → true
//   - partnerStatus → "verified" (samo če je trenutno "standard";
//     premium/featured sta višja in se ne pomanjšata)
//
// verify=false (umik):
//   - verifiedByAdmin → false, verified → false
//   - partnerStatus: "verified" → "standard" (premium/featured nedotaknjena)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: 60_000,
    key: "admin-verify-listing",
  });
  if (limited) return limited;

  const adminPassword = request.headers.get("x-admin-password");
  if (!checkAdmin(adminPassword)) {
    return NextResponse.json({ error: "Neavtoriziran dostop" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body: unknown = await request.json().catch(() => ({}));
    const verify =
      typeof body === "object" &&
      body !== null &&
      "verify" in body &&
      typeof (body as Record<string, unknown>).verify === "boolean"
        ? (body as Record<string, unknown>).verify
        : true;

    const listing = await db.listing.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        partnerStatus: true,
        verifiedByAdmin: true,
      },
    });
    if (!listing) {
      return NextResponse.json({ error: "Lokal ni najden" }, { status: 404 });
    }

    // Idempotenca: ni spremembe → samo potrdi trenutno stanje
    if (listing.verifiedByAdmin === verify) {
      return NextResponse.json({
        success: true,
        alreadyInState: true,
        partnerStatus: listing.partnerStatus,
      });
    }

    const updated = await db.listing.update({
      where: { id },
      data: verify
        ? {
            verifiedByAdmin: true,
            verified: true,
            partnerStatus:
              listing.partnerStatus === "standard"
                ? "verified"
                : listing.partnerStatus,
          }
        : {
            verifiedByAdmin: false,
            verified: false,
            partnerStatus:
              listing.partnerStatus === "verified"
                ? "standard"
                : listing.partnerStatus,
          },
      select: { partnerStatus: true, verifiedByAdmin: true },
    });

    await logAudit({
      actorRole: "admin",
      action: verify
        ? AUDIT_ACTIONS.LISTING_VERIFIED
        : AUDIT_ACTIONS.LISTING_UNVERIFIED,
      resourceType: "listing",
      resourceId: id,
      resourceName: listing.name,
      metadata: { partnerStatus: updated.partnerStatus },
    });

    console.log(
      `[admin/verify] ${listing.name}: verify=${verify} → partnerStatus=${updated.partnerStatus}`
    );

    return NextResponse.json({
      success: true,
      partnerStatus: updated.partnerStatus,
      verifiedByAdmin: updated.verifiedByAdmin,
    });
  } catch (error) {
    console.error("[admin/listings/verify] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri verifikaciji lokala" },
      { status: 500 }
    );
  }
}
