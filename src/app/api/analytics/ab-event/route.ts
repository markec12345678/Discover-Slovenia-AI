import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { AB_TEST_NAME } from "@/lib/ab-testing";

// POST /api/analytics/ab-event — sledi dogodkom A/B testa naročninskega
// nagovora (P2-4, test "subscription_pitch_v1").
//
// Body: { variant: "A" | "B", event: "impression" | "calculator_interact"
//        | "upgrade_click", plan?: string }
//
// Dogodki so ANONIMNI po naravi (impression / interakcija / klik na
// nadgradnjo) — NE sprejmemo userId/PII iz telesa: zod objekt stripne
// neznana polja, v DB pa se zapišejo IZKLJUČNO validirana polja
// (test, variant, event, plan). Tudi seja ni zahtevana — isti vzorec
// kot javni /api/track-funnel in strežniški tracking v /go/[provider].

const abEventSchema = z.object({
  variant: z.enum(["A", "B"]),
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

  const { variant, event, plan } = parsed.data;

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
