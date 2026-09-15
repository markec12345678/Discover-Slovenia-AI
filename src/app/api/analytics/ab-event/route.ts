import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { AB_TEST_NAME, getAbVariant } from "@/lib/ab-testing";

// POST /api/analytics/ab-event — sledi dogodkom A/B testa naročninskega
// nagovora (P2-4, test "subscription_pitch_v1").
//
// P3c-3 (SPREMEMBA POGODBE, dokumentirano): endpoint je prej sprejel
// ANONIMNE dogodke s client-izbrano varianto (A/B) — vsak curl je lahko
// zapisal poljuben (variant, event) par. Dogodki danes prihajajo SAMO iz
// owner dashboarda (dashboard/page.tsx trackAbEvent), kjer je owner seja
// OBVEZNA — zato:
//   - brez seje → 401
//   - B2C seja (popotnik, accountType "user") → 403 (ni deležen testa)
//   - varianta se NE sprejme iz telesa več — strežnik jo izračuna
//     deterministično iz seje: getAbVariant(id ?? email ?? "anon") —
//     IDENTIČNO formulo kot dashboard uporablja za prikaz (SSR/klient
//     vidita isto varianto, zato so bili prejšnji client poslani podatki
//     pravilni; sedaj jih ni mogoče več ponarediti).
// Klient (dashboard) še naprej pošilja `variant` v telesu — strežnik ga
// NAMENOMO ignorira (zod shema ga stripne); dashboarda ne spreminjamo.
//
// PII ostaja izključena: v DB se zapišejo IZKLJUČNO {test, variant, event,
// plan} — ne userId, ne email (varianta je deterministična izpeljanka,
// reverzibilna le z znanjem semena, ki ga ne zapisujemo).

const abEventSchema = z.object({
  // `variant` NI del sheme več (P3c-3): strežniško izračunana.
  // event/plan validacija ostaja nespremenjena.
  event: z.enum(["impression", "calculator_interact", "upgrade_click"]),
  plan: z.string().max(32).optional(),
});

export async function POST(request: Request) {
  // Rate limit analitike (spam zaščita) — vzorec iz /api/track-funnel
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: 60000,
    key: "ab-event",
  });
  if (limited) return limited;

  // P3c-3: seja je obvezna (dogodki prihajajo samo iz owner dashboarda)
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Niste prijavljeni" },
      { status: 401 }
    );
  }
  // B2C (popotniška) seja nima dostopa do B2B A/B telemetrije
  if (session.user.accountType === "user") {
    return NextResponse.json(
      { error: "Ta endpoint je namenjen izključno ponudnikom" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  const parsed = abEventSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return NextResponse.json(
      { error: firstError?.message ?? "Neveljavni podatki" },
      { status: 400 }
    );
  }

  const { event, plan } = parsed.data;

  // P3c-3: strežniško izračunana varianta — ista deterministična formula
  // (FNV-1a mod 2) kot v dashboardu, iz seje (ne iz telesa!)
  const variant = getAbVariant(
    session.user.id ?? session.user.email ?? "anon"
  );

  try {
    await db.analyticsEvent.create({
      data: {
        type: "ab_subscription",
        metadata: JSON.stringify({
          test: AB_TEST_NAME,
          variant,
          event,
          plan: plan ?? null,
        }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ab-event] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
