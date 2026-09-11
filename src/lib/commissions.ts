import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";
import type { CommissionInvoice } from "@prisma/client";

// ============================================================================
// PROVIZIJSKI MODEL — deljena logika (Faza 4a API + Faza 4b cron)
// ============================================================================
// Kot pri Booking.com: turist plača polno ceno neposredno ponudniku, platforma
// pa ponudniku obračuna provizijo le za rezervacije iz AI kanala
// (Booking.source = "consultation"). Uporabniki:
//   - POST /api/owner/commissions (ročna izdaja v dashboardu)
//   - GET|POST /api/cron/commission-invoices (samodejna izdaja 1. v mesecu)

export const COMMISSION_RATE = 0.12; // 12 % — free partnerji
export const PREMIUM_PLANS = ["premium", "enterprise"];

export type OwnerPremiumFields = {
  id: string;
  name: string;
  plan: string;
  subscriptionStatus: string;
  subscriptionEndsAt: Date | null;
};

export function isPremiumOwner(owner: OwnerPremiumFields): boolean {
  if (!PREMIUM_PLANS.includes(owner.plan)) return false;
  if (owner.subscriptionStatus === "canceled") return false;
  // Pretekla naročnina ne šteje več (enak princip kot premiumUntil pri listingih)
  if (owner.subscriptionEndsAt && owner.subscriptionEndsAt.getTime() <= Date.now()) {
    return false;
  }
  return true;
}

// Koledarski mesec glede na lokalni čas (DST-varen — Date(y, m, 1)).
// offset 0 = tekoči mesec, -1 = prejšnji mesec. periodEnd je EKSKLUSIVEN.
export function monthRange(offset: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start, end };
}

export const monthLabel = (d: Date) =>
  new Intl.DateTimeFormat("sl-SI", { month: "long", year: "numeric" }).format(d);

export function invoiceNumberFor(periodStart: Date): string {
  const ym = `${periodStart.getFullYear()}${String(periodStart.getMonth() + 1).padStart(2, "0")}`;
  const suffix = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `INV-${ym}-${suffix}`;
}

export type IssueResult =
  | { status: "issued"; invoice: CommissionInvoice }
  | { status: "duplicate"; invoiceNumber: string }
  | { status: "no_bookings" }
  | { status: "premium" };

// ============================================================================
// issueCommissionInvoice — izda provizijski račun za PREJŠNJI koledarski mesec
// ============================================================================
// Idempotentno (unique ownerId+periodStart), stopnja se zapiše kot snapshot,
// znesek se izračuna strežno iz atribuiranih rezervacij. Tudi audit sled.
export async function issueCommissionInvoice(
  owner: OwnerPremiumFields
): Promise<IssueResult> {
  if (isPremiumOwner(owner)) {
    return { status: "premium" };
  }

  const last = monthRange(-1);

  // Idempotenca: en račun na obdobje
  const existing = await db.commissionInvoice.findFirst({
    where: { ownerId: owner.id, periodStart: last.start },
    select: { invoiceNumber: true },
  });
  if (existing) {
    return { status: "duplicate", invoiceNumber: existing.invoiceNumber };
  }

  // Agregacija atribuiranih rezervacij v obdobju
  const experiences = await db.experience.findMany({
    where: { ownerId: owner.id },
    select: { id: true },
  });
  const experienceIds = experiences.map((e) => e.id);

  const agg = experienceIds.length
    ? await db.booking.aggregate({
        _count: true,
        _sum: { total: true },
        where: {
          source: "consultation",
          experienceId: { in: experienceIds },
          createdAt: { gte: last.start, lt: last.end },
          // P7-C3 (P1): preklicane rezervacije NE štejejo v provizijsko osnovo
          // (usklajeno z lastniškimi prihodki, ki štejejo samo confirmed/completed)
          status: { in: ["confirmed", "completed"] },
        },
      })
    : { _count: 0, _sum: { total: null as number | null } };

  const bookingCount = agg._count;
  const commissionBase = agg._sum.total ?? 0;

  if (bookingCount === 0) {
    return { status: "no_bookings" };
  }

  const rate = COMMISSION_RATE; // snapshot ob izdaji
  const amount = Math.round(commissionBase * rate * 100) / 100;

  // P8 (🟠): findFirst → create je race-prone — sočasna izdaja (cron 1. v
  // mesecu + ročni "generate" v dashboardu) oba preglesta "še ni računa",
  // oba kreirata; @@unique([ownerId, periodStart]) drugega zavrne s P2002.
  // P2002 obravnavamo kot idempotenten rezultat "duplicate" (ne 500) —
  // enako semantiko ima že cron pot; s tem je pokrita tudi owner generate.
  let invoice: CommissionInvoice;
  try {
    invoice = await db.commissionInvoice.create({
      data: {
        ownerId: owner.id,
        invoiceNumber: invoiceNumberFor(last.start),
        periodStart: last.start,
        periodEnd: last.end,
        bookingCount,
        commissionBase,
        rate,
        amount,
        status: "issued",
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await db.commissionInvoice.findFirst({
        where: { ownerId: owner.id, periodStart: last.start },
        select: { invoiceNumber: true },
      });
      if (existing) {
        return {
          status: "duplicate",
          invoiceNumber: existing.invoiceNumber,
        };
      }
    }
    throw error;
  }

  await logAudit({
    actorId: owner.id,
    actorRole: "owner",
    action: AUDIT_ACTIONS.COMMISSION_INVOICE_ISSUED,
    resourceType: "commission_invoice",
    resourceId: invoice.id,
    resourceName: invoice.invoiceNumber,
    metadata: {
      period: `${last.start.toISOString()} — ${last.end.toISOString()}`,
      bookingCount,
      commissionBase,
      rate,
      amount,
      via: "lib",
    },
  });

  console.log(
    `[commissions] Izdan ${invoice.invoiceNumber} za ${owner.name}: ${bookingCount} rezervacij, ${amount} €`
  );

  return { status: "issued", invoice };
}
