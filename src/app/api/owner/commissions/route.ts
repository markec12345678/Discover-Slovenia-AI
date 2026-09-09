import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomUUID } from "crypto";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";

// ============================================================================
// /api/owner/commissions — provizijski model (Faza 4a, Booking-style)
// ============================================================================
// GET  → trenutna stopnja, predogled tekočega meseca, podatki prejšnjega
//        meseca (za izdajo) in seznam izdanih računov lastnika.
// POST → { action: "generate" }  — izda provizijski račun za PREJŠNJI
//        koledarski mesec (12 % na atribuirane rezervacije: Booking.source
//        = "consultation"). Idempotentno: @@unique([ownerId, periodStart]).
//        { action: "mark_paid", invoiceId } — označi račun kot plačan
//        (demo obračun; v produkciji SEPA/Stripe).
//
// Politika: free partner → 12 %; premium/featured (aktivna naročnina) → 0 %
// (vključeno v Premium 149 €/mes). Stopnja se zapiše (snapshot) ob izdaji.
// Turist vedno plača polno ceno neposredno ponudniku — kot pri Booking.com.

const COMMISSION_RATE = 0.12; // 12 % — free partnerji
const PREMIUM_PLANS = ["premium", "enterprise"];

type OwnerPremiumFields = {
  id: string;
  name: string;
  plan: string;
  subscriptionStatus: string;
  subscriptionEndsAt: Date | null;
};

function isPremiumOwner(owner: OwnerPremiumFields): boolean {
  if (!PREMIUM_PLANS.includes(owner.plan)) return false;
  if (owner.subscriptionStatus === "canceled") return false;
  // Pretekla naročnina ne šteje več (enak princip kot premiumUntil pri listingih)
  if (owner.subscriptionEndsAt && owner.subscriptionEndsAt.getTime() <= Date.now()) {
    return false;
  }
  return true;
}

// Koledarski mesec glede na lokalni čas (DST-varen — konstruktor Date(y, m, 1)).
// offset 0 = tekoči mesec, -1 = prejšnji mesec.
function monthRange(offset: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start, end };
}

const monthLabel = (d: Date) =>
  new Intl.DateTimeFormat("sl-SI", { month: "long", year: "numeric" }).format(d);

function invoiceNumberFor(periodStart: Date): string {
  const ym = `${periodStart.getFullYear()}${String(periodStart.getMonth() + 1).padStart(2, "0")}`;
  const suffix = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `INV-${ym}-${suffix}`;
}

// ============================================================================
// GET — predogled + zgodovina računov
// ============================================================================
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
    }

    const owner = await db.owner.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        name: true,
        plan: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
      },
    });
    if (!owner) {
      return NextResponse.json({ error: "Lastnik ni najden" }, { status: 404 });
    }

    const premium = isPremiumOwner(owner);
    const rate = premium ? 0 : COMMISSION_RATE;

    // Izkušnje ownerja — rezervacije so vezane na izkušnje
    const experiences = await db.experience.findMany({
      where: { ownerId: owner.id },
      select: { id: true },
    });
    const experienceIds = experiences.map((e) => e.id);

    const current = monthRange(0);
    const last = monthRange(-1);

    const currentWhere = experienceIds.length
      ? {
          source: "consultation" as const,
          experienceId: { in: experienceIds },
          createdAt: { gte: current.start, lt: current.end },
        }
      : null;
    const lastWhere = experienceIds.length
      ? {
          source: "consultation" as const,
          experienceId: { in: experienceIds },
          createdAt: { gte: last.start, lt: last.end },
        }
      : null;

    const [currentAgg, lastAgg, invoices, lastInvoice] = await Promise.all([
      currentWhere
        ? db.booking.aggregate({ _count: true, _sum: { total: true }, where: currentWhere })
        : Promise.resolve({ _count: 0, _sum: { total: null as number | null } }),
      lastWhere
        ? db.booking.aggregate({ _count: true, _sum: { total: true }, where: lastWhere })
        : Promise.resolve({ _count: 0, _sum: { total: null as number | null } }),
      db.commissionInvoice.findMany({
        where: { ownerId: owner.id },
        orderBy: { periodStart: "desc" },
      }),
      db.commissionInvoice.findFirst({
        where: { ownerId: owner.id, periodStart: last.start },
        select: { id: true },
      }),
    ]);

    const currentBase = currentAgg._sum.total ?? 0;
    const lastBase = lastAgg._sum.total ?? 0;

    return NextResponse.json({
      rate,
      isPremium: premium,
      commissionRateStandard: COMMISSION_RATE,
      currentMonth: {
        monthLabel: monthLabel(current.start),
        bookingCount: currentAgg._count,
        commissionBase: currentBase,
        estimatedAmount: Math.round(currentBase * rate * 100) / 100,
      },
      lastMonth: {
        monthLabel: monthLabel(last.start),
        bookingCount: lastAgg._count,
        commissionBase: lastBase,
        amount: Math.round(lastBase * rate * 100) / 100,
        invoiceExists: Boolean(lastInvoice),
      },
      invoices,
    });
  } catch (error) {
    console.error("[owner/commissions GET] napaka:", error);
    return NextResponse.json({ error: "Napaka pri pridobivanju provizij" }, { status: 500 });
  }
}

// ============================================================================
// POST — izdaja računa (generate) ali oznaka plačila (mark_paid)
// ============================================================================
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
    }

    const owner = await db.owner.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        name: true,
        plan: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
      },
    });
    if (!owner) {
      return NextResponse.json({ error: "Lastnik ni najden" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { action, invoiceId } = body as { action?: string; invoiceId?: string };

    // ------------------------------------------------------------------
    // GENERATE — provizijski račun za prejšnji koledarski mesec
    // ------------------------------------------------------------------
    if (action === "generate") {
      if (isPremiumOwner(owner)) {
        return NextResponse.json(
          {
            error:
              "S Premium naročnino je provizija 0 % — računov ni treba izdajati.",
          },
          { status: 400 }
        );
      }

      const last = monthRange(-1);

      // Idempotenca: en račun na obdobje
      const existing = await db.commissionInvoice.findFirst({
        where: { ownerId: owner.id, periodStart: last.start },
        select: { id: true, invoiceNumber: true },
      });
      if (existing) {
        return NextResponse.json(
          { error: `Račun za to obdobje je že izdan (${existing.invoiceNumber}).` },
          { status: 409 }
        );
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
            },
          })
        : { _count: 0, _sum: { total: null as number | null } };

      const bookingCount = agg._count;
      const commissionBase = agg._sum.total ?? 0;

      if (bookingCount === 0) {
        return NextResponse.json(
          {
            error: `Ni rezervacij iz AI konzultacij v obdobju ${monthLabel(last.start)} — nič za obračun.`,
          },
          { status: 400 }
        );
      }

      const rate = COMMISSION_RATE; // snapshot ob izdaji
      const amount = Math.round(commissionBase * rate * 100) / 100;

      const invoice = await db.commissionInvoice.create({
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
        },
      });

      console.log(
        `[commissions] Izdan ${invoice.invoiceNumber} za ${owner.name}: ${bookingCount} rezervacij, ${amount} €`
      );

      return NextResponse.json({ invoice }, { status: 201 });
    }

    // ------------------------------------------------------------------
    // MARK_PAID — demo obračun (produkcija: SEPA/Stripe potrditev)
    // ------------------------------------------------------------------
    if (action === "mark_paid") {
      if (!invoiceId) {
        return NextResponse.json({ error: "Manjka invoiceId" }, { status: 400 });
      }

      const invoice = await db.commissionInvoice.findUnique({
        where: { id: invoiceId },
      });
      if (!invoice || invoice.ownerId !== owner.id) {
        return NextResponse.json(
          { error: "Račun ni najden ali nimate dovoljenja" },
          { status: 404 }
        );
      }
      if (invoice.status === "paid") {
        return NextResponse.json(
          { error: "Račun je že označen kot plačan" },
          { status: 400 }
        );
      }

      const paid = await db.commissionInvoice.update({
        where: { id: invoice.id },
        data: { status: "paid", paidAt: new Date() },
      });

      await logAudit({
        actorId: owner.id,
        actorRole: "owner",
        action: AUDIT_ACTIONS.COMMISSION_INVOICE_PAID,
        resourceType: "commission_invoice",
        resourceId: paid.id,
        resourceName: paid.invoiceNumber,
        metadata: { amount: paid.amount },
      });

      return NextResponse.json({ invoice: paid });
    }

    return NextResponse.json(
      { error: "Neveljavna akcija. Dovoljeno: generate | mark_paid" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[owner/commissions POST] napaka:", error);
    return NextResponse.json({ error: "Napaka pri obračunu provizije" }, { status: 500 });
  }
}
