import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { renewalReminderEmail } from "@/lib/email-templates";
import { verifyCronAuth } from "@/lib/security";

// GET / POST /api/cron/renewal-reminders
//
// Poišče vse ownerje z active naročnino, katerih subscriptionEndsAt je v 7 dneh
// in renewalReminderSent = false. Pošlje opomnik za obnovitev in setira flag.
//
// PRIPOROČEN RAZPORED KLICANJA: dnevno (npr. ob 09:00 UTC)
//   - Vercel Cron: dodaj v vercel.json
//       { "crons": [{ "path": "/api/cron/renewal-reminders", "schedule": "0 9 * * *" }] }
//   - Vercel samodejno pošlje Authorization: Bearer <CRON_SECRET>, ko je
//     CRON_SECRET nastavljen v env.
//   - External cron (curl): 0 9 * * * curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://domena.si/api/cron/renewal-reminders
//
// VARNOST: endpoint zahteva CRON_SECRET (Bearer) ali admin geslo (timing-safe).
// V produkciji brez CRON_SECRET fail-closed; v developmentu dovoljen ročni klic.

const REMINDER_WINDOW_DAYS = 7;

export async function GET(request: Request) {
  return runRenewalReminders(request);
}

export async function POST(request: Request) {
  return runRenewalReminders(request);
}

async function runRenewalReminders(request: Request) {
  try {
    // Avtentikacija (prej je bil endpoint popolnoma odprt)
    const unauthorized = verifyCronAuth(request);
    if (unauthorized) return unauthorized;

    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + REMINDER_WINDOW_DAYS);

    // Poišči ownerje z active naročnino, renewal datum v naslednjih 7 dneh,
    // ki še niso prejeli opomnika
    const owners = await db.owner.findMany({
      where: {
        subscriptionStatus: "active",
        subscriptionEndsAt: {
          gte: now,
          lte: horizon,
        },
        renewalReminderSent: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        businessName: true,
        plan: true,
        subscriptionEndsAt: true,
      },
    });

    let sent = 0;
    let failed = 0;

    for (const owner of owners) {
      if (!owner.subscriptionEndsAt) continue;

      const msLeft = owner.subscriptionEndsAt.getTime() - now.getTime();
      const daysLeft = Math.max(1, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

      try {
        const { subject, html, text } = renewalReminderEmail(
          owner.name,
          owner.plan,
          daysLeft,
          owner.subscriptionEndsAt
        );
        await sendEmail({ to: owner.email, subject, html, text });
        sent++;
      } catch (err) {
        console.error(
          `[cron/renewal-reminders] napaka za ${owner.email}:`,
          err
        );
        failed++;
        // Nadaljuj z naslednjim — ne prekini cele serije
      }
    }

    // Označi vse obdelane kot "opomnik poslan"
    if (owners.length > 0) {
      await db.owner.updateMany({
        where: {
          id: { in: owners.map((o) => o.id) },
        },
        data: { renewalReminderSent: true },
      });
    }

    return NextResponse.json({
      success: true,
      checked: owners.length,
      sent,
      failed,
      windowDays: REMINDER_WINDOW_DAYS,
      runAt: now.toISOString(),
    });
  } catch (error) {
    console.error("[cron/renewal-reminders] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pošiljanju opomnikov" },
      { status: 500 }
    );
  }
}
