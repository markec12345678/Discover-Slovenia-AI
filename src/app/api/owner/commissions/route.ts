import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";
import {
  COMMISSION_RATE,
  isPremiumOwner,
  monthRange,
  monthLabel,
  issueCommissionInvoice,
} from "@/lib/commissions";
import { isStripeDemo } from "@/lib/stripe-server";

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
// Jedro logike (izdaja) je deljeno v src/lib/commissions.ts (tudi cron).

// ============================================================================
// GET — predogled + zgodovina računov
// ============================================================================
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.accountType === "user") {
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
          // P7-C3 (P1): preklicane rezervacije ne štejejo (usklajeno z lib/commissions.ts)
          status: { in: ["confirmed", "completed"] },
          // FW1 (audit R3 🔴 #1): samo PLAČANE rezervacije (glej invariant v
          // lib/commissions.ts) — demo rezervacije so vedno "unpaid".
          paymentStatus: "paid" as const,
        }
      : null;
    const lastWhere = experienceIds.length
      ? {
          source: "consultation" as const,
          experienceId: { in: experienceIds },
          createdAt: { gte: last.start, lt: last.end },
          status: { in: ["confirmed", "completed"] },
          paymentStatus: "paid" as const,
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
      // Faza 5: ali je kartično plačilo (Stripe Checkout) na voljo —
      // dashboard skrije gumb "Plačaj s kartico" v demo načinu.
      stripeEnabled: !isStripeDemo(),
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
    if (!session?.user?.email || session.user.accountType === "user") {
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
    // GENERATE — provizijski račun za prejšnji koledarski mesec (deljena logika)
    // ------------------------------------------------------------------
    if (action === "generate") {
      const result = await issueCommissionInvoice(owner);

      if (result.status === "premium") {
        return NextResponse.json(
          {
            error:
              "S Premium naročnino je provizija 0 % — računov ni treba izdajati.",
          },
          { status: 400 }
        );
      }
      if (result.status === "duplicate") {
        return NextResponse.json(
          { error: `Račun za to obdobje je že izdan (${result.invoiceNumber}).` },
          { status: 409 }
        );
      }
      if (result.status === "no_bookings") {
        const last = monthRange(-1);
        return NextResponse.json(
          {
            error: `Ni rezervacij iz AI konzultacij v obdobju ${monthLabel(last.start)} — nič za obračun.`,
          },
          { status: 400 }
        );
      }

      return NextResponse.json({ invoice: result.invoice }, { status: 201 });
    }

    // ------------------------------------------------------------------
    // MARK_PAID — demo obračun (produkcija: SEPA/Stripe potrditev)
    // ------------------------------------------------------------------
    if (action === "mark_paid") {
      // P7-C3 (P0): lastnik NE sme sam označiti svojega računa za plačan
      // brez dokaza o plačilu — sicer bi dolžnik vodil evidence prihodkov
      // platforme. Dovoljeno SAMO v demo načinu (ni pravih Stripe ključev);
      // v produkciji plačilo potrdi izključno Stripe webhook (kartica) oz.
      // admin po SEPA potrditvi.
      if (!isStripeDemo()) {
        return NextResponse.json(
          {
            error:
              "Ročna oznaka plačila je onemogočena v produkcijskem načinu — plačilo potrdi Stripe (kartica) ali administrator (SEPA).",
          },
          { status: 403 }
        );
      }
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
