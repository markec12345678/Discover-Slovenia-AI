import { db } from "@/lib/db";

// ============================================================================
// AUDIT LOG — beleženje admin/owner akcij
// ============================================================================

export interface AuditLogParams {
  actorId?: string;
  actorEmail?: string;
  // ISSUE #4 §13 (val 2): "user" = B2C popotnik (vloga na poti);
  // "edit-token-owner" = anonimni lastnik poti (brez računa) — iskreno
  // ločeno od sistema (dejanje je človekovo, žeton je dokaz).
  actorRole:
    | "admin"
    | "owner"
    | "system"
    | "stripe"
    | "user"
    | "edit-token-owner";
  action: string;
  // P3c-9: "product" | "experience" — moderacijska zanka tržnice
  // ISSUE #4 §13: "trip" | "trip_collaborator" — sodelovanje na poti
  // ISSUE #4 §4+§14 (val 3): "journey_booking" | "trip_expense" —
  // rezervacije in stroški na poti
  // ISSUE #4 §15 (val 4): "trip_document" — dokumenti poti (metapodatki)
  // TASK 34 (Tier 2 #2): "payout_settlement" — mesečne poravnave (ledger)
  resourceType:
    | "listing"
    | "product"
    | "experience"
    | "sponsorship"
    | "owner"
    | "user"
    | "booking"
    | "commission_invoice"
    | "payout_settlement"
    | "trip"
    | "trip_collaborator"
    | "journey_booking"
    | "trip_expense"
    | "trip_document";
  resourceId?: string;
  resourceName?: string;
  metadata?: Record<string, unknown>;
}

export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: params.actorId,
        actorEmail: params.actorEmail,
        actorRole: params.actorRole,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        resourceName: params.resourceName,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  } catch (error) {
    console.error("[audit-log] napaka:", error);
    // Ne zaustavljaj glavne operacije če audit log odpove
  }
}

// Pred definirane akcije (za konsistentnost)
export const AUDIT_ACTIONS = {
  LISTING_APPROVED: "listing_approved",
  LISTING_REJECTED: "listing_rejected",
  LISTING_SUBMITTED: "listing_submitted",
  LISTING_PUBLISHED: "listing_published",
  LISTING_FEATURED: "listing_featured",
  LISTING_UNFEATURED: "listing_unfeatured",
  // P4-2b: eksplicitna admin verifikacija (znak "Preverjen partner")
  LISTING_VERIFIED: "listing_verified",
  LISTING_UNVERIFIED: "listing_unverified",
  // P3c-9: moderacijska zanka izdelkov in izkušenj tržnice
  PRODUCT_APPROVED: "product_approved",
  PRODUCT_REJECTED: "product_rejected",
  EXPERIENCE_APPROVED: "experience_approved",
  EXPERIENCE_REJECTED: "experience_rejected",
  SPONSORSHIP_CREATED: "sponsorship_created",
  SPONSORSHIP_ACTIVATED: "sponsorship_activated",
  SPONSORSHIP_CANCELLED: "sponsorship_cancelled",
  SPONSORSHIP_EXPIRED: "sponsorship_expired",
  PLAN_CHANGED: "plan_changed",
  OWNER_REGISTERED: "owner_registered",
  OWNER_LOGIN: "owner_login",
  // FW1 (audit R3 🟠): prehodi statusov rezervacij prek owner booking
  // managerja — forenzika proti evaziji provizije prek tihega preklica
  BOOKING_STATUS_CHANGED: "booking_status_changed",
  COMMISSION_INVOICE_ISSUED: "commission_invoice_issued",
  COMMISSION_INVOICE_PAID: "commission_invoice_paid",
  // ISSUE #4 §13 (val 2) — sodelovanje na poti (celoten življenjski cikel
  // vabil: izdaja / sprejem / sprememba vloge / odvzem / vsebina CAS)
  TRIP_INVITE_SENT: "trip_invite_sent",
  TRIP_COLLABORATOR_ACCEPTED: "trip_collaborator_accepted",
  TRIP_COLLABORATOR_ROLE_CHANGED: "trip_collaborator_role_changed",
  TRIP_COLLABORATOR_REVOKED: "trip_collaborator_revoked",
  TRIP_LINK_SHARING_CHANGED: "trip_link_sharing_changed",
  TRIP_CONTENT_UPDATED: "trip_content_updated",
  TRIP_CONTENT_CONFLICT: "trip_content_conflict",
  // ISSUE #4 §4+§14 (val 3) — rezervacije (uvoz/parse) + stroški poti
  RESERVATION_IMPORTED: "reservation_imported",
  RESERVATION_IMPORT_CONFIRMED: "reservation_import_confirmed",
  TRIP_EXPENSE_ADDED: "trip_expense_added",
  TRIP_EXPENSE_REMOVED: "trip_expense_removed",
  // ISSUE #4 §15 (val 4) — dokumenti poti (metapodatki + povezava)
  TRIP_DOCUMENT_ADDED: "trip_document_added",
  TRIP_DOCUMENT_REMOVED: "trip_document_removed",
  // ISSUE #4 §22 (val 5) — revizije vsebine poti (undo na strežniku)
  TRIP_REVISION_READ: "trip_revision_read",
} as const;
