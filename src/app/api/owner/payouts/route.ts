import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  COMMISSION_RATE,
  isPremiumOwner,
  monthRange,
  monthLabel,
} from "@/lib/commissions";
import {
  syncPayoutEntries,
  issuePayoutSettlement,
  settlePayoutSettlement,
} from "@/lib/payout-ledger";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// /api/owner/payouts — PAYOUT LEDGER lastnika (TASK 34, Tier 2 #2, B3)
// ============================================================================
// GET  → samo-zdravi evidenco (idempotenten sync VSEH upravičenih rezervacij
//        do konca tekočega meseca — tudi pozneje plačane starejše obdobje),
//        vrne predogled tekočega + prejšnjega meseca (bruto/provizija/neto),
//        število vseh odprtih postavk, zgodovino poravnav in nedavne odprte
//        postavke.
// POST → { action: "generate" } — izda poravnavo za PREJŠNJI koledarski mesec
//        (zajame VSE odprte postavke do vključno tega meseca). Idempotentno:
//        @@unique([ownerId, periodStart]).
//        { action: "settle", settlementId } — potrdi uskladitev poravnave
//        (knjigovodska potrditev evidence, NE prenos denarja).
//
// Za razliko od provizijskih računov (P7-C3: mark_paid gated na demo) TU
// lastnik potrjuje SVOJO evidenco prihodkov — obveznost provizije ima ločen,
// varovan CommissionInvoice. Jedro logike je deljeno v src/lib/payout-ledger.ts.

// ============================================================================
// GET — predogled ledgerja + zgodovina poravnav
// ============================================================================
export async function GET(request: Request) {
  // ISSUE #4 §24 (VAL 8, P3): session-gated owner API brez abuse-meje —
  // skupni bucket "owner-api" (vzorec requireAdmin "admin-any").
  const limited = rateLimit(request, {
    limit: 120,
    windowMs: 60_000,
    key: "owner-api",
  });
  if (limited) return limited;

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

    // SAMO-ZDRAVLJENJE evidence: idempotentno dopolni postavke za VSE
    // upravičene rezervacije do konca tekočega meseca (bookingId @@unique
    // varuje pred podvajanjem; zameta tudi pozneje plačane starejše obdobje).
    await syncPayoutEntries(owner);

    const current = monthRange(0);
    const last = monthRange(-1);

    const [currentAgg, lastAgg, lastSettlement, settlements, openCount, olderOpenCount, pendingEntries] =
      await Promise.all([
        db.payoutEntry.aggregate({
          _count: true,
          _sum: {
            grossAmount: true,
            commissionAmount: true,
            netAmount: true,
          },
          where: {
            ownerId: owner.id,
            periodStart: { gte: current.start, lt: current.end },
          },
        }),
        db.payoutEntry.aggregate({
          _count: true,
          _sum: {
            grossAmount: true,
            commissionAmount: true,
            netAmount: true,
          },
          where: {
            ownerId: owner.id,
            periodStart: { gte: last.start, lt: last.end },
          },
        }),
        db.payoutSettlement.findFirst({
          where: {
            ownerId: owner.id,
            periodStart: { gte: last.start, lt: last.end },
          },
          select: { id: true },
        }),
        db.payoutSettlement.findMany({
          where: { ownerId: owner.id },
          orderBy: { periodStart: "desc" },
        }),
        db.payoutEntry.count({
          where: { ownerId: owner.id, status: "pending" },
        }),
        // Odprte postavke iz obdobij STAREJŠIH od poravnavanega meseca — te bo
        // izdaja zajela kot „sweep" (tekoči mesec NE — pripada naslednji).
        db.payoutEntry.count({
          where: {
            ownerId: owner.id,
            status: "pending",
            periodEnd: { lte: last.start },
          },
        }),
        db.payoutEntry.findMany({
          where: { ownerId: owner.id, status: "pending" },
          orderBy: { periodStart: "desc" },
          take: 25,
        }),
      ]);

    return NextResponse.json({
      rate,
      isPremium: premium,
      currentMonth: {
        monthLabel: monthLabel(current.start),
        entryCount: currentAgg._count,
        gross: currentAgg._sum.grossAmount ?? 0,
        commission: currentAgg._sum.commissionAmount ?? 0,
        net: currentAgg._sum.netAmount ?? 0,
      },
      lastMonth: {
        monthLabel: monthLabel(last.start),
        entryCount: lastAgg._count,
        gross: lastAgg._sum.grossAmount ?? 0,
        commission: lastAgg._sum.commissionAmount ?? 0,
        net: lastAgg._sum.netAmount ?? 0,
        settlementExists: Boolean(lastSettlement),
      },
      openPendingCount: openCount,
      // Odprte postavke iz obdobij starejših od poravnavanega meseca (sweep).
      olderOpenCount,
      settlements,
      pendingEntries,
    });
  } catch (error) {
    console.error("[owner/payouts GET] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju izplačil" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST — izdaja poravnave (generate) ali potrditev uskladitve (settle)
// ============================================================================
export async function POST(request: Request) {
  // ISSUE #4 §24 (VAL 8, P3): session-gated owner API brez abuse-meje —
  // skupni bucket "owner-api" (vzorec requireAdmin "admin-any").
  const limited = rateLimit(request, {
    limit: 120,
    windowMs: 60_000,
    key: "owner-api",
  });
  if (limited) return limited;

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
    const { action, settlementId } = body as {
      action?: string;
      settlementId?: string;
    };

    // ------------------------------------------------------------------
    // GENERATE — poravnava za prejšnji koledarski mesec (deljena logika)
    // ------------------------------------------------------------------
    if (action === "generate") {
      const result = await issuePayoutSettlement(owner);

      if (result.status === "duplicate") {
        return NextResponse.json(
          {
            error: `Poravnava za to obdobje je že izdana (${result.settlementNumber}).`,
          },
          { status: 409 }
        );
      }
      if (result.status === "no_entries") {
        const last = monthRange(-1);
        return NextResponse.json(
          {
            error: `Ni odprtih postavk do vključno ${monthLabel(last.start)} — nič za poravnavo.`,
          },
          { status: 400 }
        );
      }

      return NextResponse.json({ settlement: result.settlement }, { status: 201 });
    }

    // ------------------------------------------------------------------
    // SETTLE — potrditev uskladitve evidence (knjigovodska, NE plačilo)
    // ------------------------------------------------------------------
    if (action === "settle") {
      if (!settlementId) {
        return NextResponse.json({ error: "Manjka settlementId" }, { status: 400 });
      }

      const result = await settlePayoutSettlement(owner.id, settlementId);

      if (result.status === "not_found") {
        return NextResponse.json(
          { error: "Poravnava ni najdena ali nimate dovoljenja" },
          { status: 404 }
        );
      }
      if (result.status === "already") {
        return NextResponse.json(
          { error: "Poravnava je že potrjena" },
          { status: 400 }
        );
      }

      return NextResponse.json({
        settlement: result.settlement,
        entriesSettled: result.entriesSettled,
      });
    }

    return NextResponse.json(
      { error: "Neveljavna akcija. Dovoljeno: generate | settle" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[owner/payouts POST] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri obdelavi poravnave" },
      { status: 500 }
    );
  }
}
