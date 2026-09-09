import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { commissionInvoiceEmail } from "@/lib/email-templates";
import { verifyCronAuth } from "@/lib/security";
import { monthRange, monthLabel, isPremiumOwner, issueCommissionInvoice } from "@/lib/commissions";

// GET / POST /api/cron/commission-invoices
//
// Samodejni mesečni obračun provizij (Faza 4b) — Booking-style:
// 1. dan v mesecu izda provizijske račune za PREJŠNJI koledarski mesec
// vsem FREE partnerjem z vsaj eno rezervacijo, ki jo je prinesla AI
// konzultacija (Booking.source = "consultation"), in jim pošlje e-poštno
// obvestilo z računom. Premium/featured partnerji (0 %) ne dobijo računa.
//
// PRIPOROČEN RAZPORED KLICANJA: 1. dan meseca ob 08:00 UTC (09/10h po Ljubljani)
//   - Vercel Cron (vercel.json): { "schedule": "0 8 1 * *" }
//   - External cron: curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//       https://domena.si/api/cron/commission-invoices
//
// IDEMPOTENTEN: unique(ownerId, periodStart) — ponovni klic istega dne
// ne izda duplikatov (vrne issued: 0, skippedDuplicate: N).
//
// VARNOST: endpoint zahteva CRON_SECRET (Bearer) ali admin geslo (timing-safe).
// V produkciji brez CRON_SECRET fail-closed; v developmentu dovoljen ročni klic.

export async function GET(request: Request) {
  return runCommissionInvoicing(request);
}

export async function POST(request: Request) {
  return runCommissionInvoicing(request);
}

async function runCommissionInvoicing(request: Request) {
  try {
    const unauthorized = verifyCronAuth(request);
    if (unauthorized) return unauthorized;

    const last = monthRange(-1);
    const lastMonthLabel = monthLabel(last.start);

    // 1. Poišči vse atribuirane rezervacije v prejšnjem mesecu (brez owner filtrov —
    //    skozi izkušnje pridemo do lastnikov; rezervacija brez lastnika preskočimo)
    const bookings = await db.booking.findMany({
      where: {
        source: "consultation",
        createdAt: { gte: last.start, lt: last.end },
      },
      select: { experienceId: true },
    });
    const experienceIds = [...new Set(bookings.map((b) => b.experienceId))];

    if (experienceIds.length === 0) {
      return NextResponse.json({
        ok: true,
        period: lastMonthLabel,
        issued: 0,
        emailsSent: 0,
        totalAmount: 0,
        candidates: 0,
        message: `Ni atribuiranih rezervacij v obdobju ${lastMonthLabel} — nič za obračun.`,
      });
    }

    // 2. Lastniki izkušenj (brez lastnika → sirote preskočimo)
    const experiences = await db.experience.findMany({
      where: { id: { in: experienceIds }, ownerId: { not: null } },
      select: { ownerId: true },
    });
    const ownerIdSet = new Set(experiences.map((e) => e.ownerId as string));

    if (ownerIdSet.size === 0) {
      return NextResponse.json({
        ok: true,
        period: lastMonthLabel,
        issued: 0,
        emailsSent: 0,
        totalAmount: 0,
        candidates: 0,
        message: "Ni lastnikov z atribuiranimi rezervacijami.",
      });
    }

    const owners = await db.owner.findMany({
      where: { id: { in: [...ownerIdSet] } },
      select: {
        id: true,
        name: true,
        email: true,
        plan: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
      },
    });

    // 3. Za vsakega kandidata: izdaj račun (idempotentno) + e-poštno obvestilo
    let issued = 0;
    let emailsSent = 0;
    let emailsFailed = 0;
    let skippedPremium = 0;
    let skippedDuplicate = 0;
    let totalAmount = 0;
    const issuedInvoices: Array<{ owner: string; invoiceNumber: string; amount: number }> = [];

    for (const owner of owners) {
      if (isPremiumOwner(owner)) {
        // Premium: 0 % provizije — računov ne izdajamo (vključeno v naročnino)
        skippedPremium++;
        continue;
      }

      const result = await issueCommissionInvoice(owner);

      if (result.status === "duplicate") {
        skippedDuplicate++;
        continue;
      }
      if (result.status !== "issued") {
        // no_bookings ne bi smel nastopiti (kandidati imajo rezervacije)
        continue;
      }

      const inv = result.invoice;
      issued++;
      totalAmount += inv.amount;
      issuedInvoices.push({
        owner: owner.name,
        invoiceNumber: inv.invoiceNumber,
        amount: inv.amount,
      });

      // E-poštno obvestilo z računom (napaka pošiljanja NE prepreči izdaje)
      try {
        const { subject, html, text } = commissionInvoiceEmail({
          ownerName: owner.name,
          invoiceNumber: inv.invoiceNumber,
          periodStart: inv.periodStart,
          periodEnd: inv.periodEnd,
          bookingCount: inv.bookingCount,
          commissionBase: inv.commissionBase,
          rate: inv.rate,
          amount: inv.amount,
        });
        await sendEmail({ to: owner.email, subject, html, text });
        emailsSent++;
      } catch (emailError) {
        emailsFailed++;
        console.error(
          `[cron/commission-invoices] Email napaka za ${owner.email}:`,
          emailError
        );
      }
    }

    const summary = {
      ok: true,
      period: lastMonthLabel,
      candidates: owners.length,
      issued,
      emailsSent,
      emailsFailed,
      skippedPremium,
      skippedDuplicate,
      totalAmount,
      invoices: issuedInvoices,
    };

    console.log(
      `[cron/commission-invoices] ${lastMonthLabel}: izdanih ${issued} računov (` +
        `${totalAmount.toLocaleString("sl-SI")} €), emailov ${emailsSent}, ` +
        `premium preskočenih ${skippedPremium}, duplikatov ${skippedDuplicate}`
    );

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[cron/commission-invoices] napaka:", error);
    return NextResponse.json({ error: "Napaka pri samodejnem obračunu" }, { status: 500 });
  }
}
