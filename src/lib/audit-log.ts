import { db } from "@/lib/db";

// ============================================================================
// AUDIT LOG — beleženje admin/owner akcij
// ============================================================================

export interface AuditLogParams {
  actorId?: string;
  actorEmail?: string;
  actorRole: "admin" | "owner" | "system" | "stripe";
  action: string;
  // P3c-9: "product" | "experience" — moderacijska zanka tržnice
  resourceType:
    | "listing"
    | "product"
    | "experience"
    | "sponsorship"
    | "owner"
    | "user"
    | "booking"
    | "commission_invoice";
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
} as const;
