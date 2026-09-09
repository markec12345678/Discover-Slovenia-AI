import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { randomId } from "@/lib/security";
import {
  CONSULTATION_NAME_MAX,
  CONSULTATION_NAME_MIN,
  EMAIL_RE,
  packageByKey,
} from "@/lib/consultations";

// ============================================================================
// POST /api/consultations/order — DEMO CHECKOUT paketa konzultacij
// ============================================================================
// Nakup paketa (single 1× / pack3 3×). Naročilo in krediti so REALNI v
// bazi; PLAČILO je demo (paymentMethod "demo") — v produkciji ta endpoint
// zamenja Stripe Checkout Session (stripeSessionId polje je pripravljeno,
// status takrat pending → paid prek webhooka). Iskrenost: UI to izrecno
// pove („demo način — zaračunavanje ni aktivirano").
//
// Funnel: ta endpoint je PLAČILNI moment — funnelStep "consultation_paid"
// zapiše STREŽNIŠKO (enak princip kot /go/[provider] affiliate klik).
// ============================================================================

interface OrderRequest {
  email?: string;
  name?: string;
  packageKey?: string;
}

export async function POST(request: Request) {
  // Checkout poskus — zmerna meja (brute-force/spam zaščita)
  const limited = rateLimit(request, {
    limit: 8,
    windowMs: 3600000,
    key: "consultations:order",
  });
  if (limited) return limited;

  let body: OrderRequest;
  try {
    body = (await request.json()) as OrderRequest;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  // === VALIDACIJA ===
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json(
      { error: "Vpišite veljaven e-poštni naslov" },
      { status: 400 }
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name && (name.length < CONSULTATION_NAME_MIN || name.length > CONSULTATION_NAME_MAX)) {
    return NextResponse.json(
      { error: `Ime mora imeti ${CONSULTATION_NAME_MIN}–${CONSULTATION_NAME_MAX} znakov` },
      { status: 400 }
    );
  }

  const pack = packageByKey(
    typeof body.packageKey === "string" ? body.packageKey.trim() : ""
  );
  if (!pack) {
    return NextResponse.json(
      { error: "Neznan paket — izberite enega izmed ponujenih" },
      { status: 400 }
    );
  }

  try {
    // === NAROČILO + KREDITI (transaction — brez delnih nakupov) ===
    const order = await db.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const created = await tx.consultationOrder.create({
        data: {
          orderNumber: `KONZ-${year}-${randomId(8)}`,
          buyerEmail: email,
          buyerName: name || null,
          packageKey: pack.key,
          packageName: pack.name,
          credits: pack.credits,
          amount: pack.priceEur,
          status: "paid", // demo plačilo takoj končano
          paymentMethod: "demo",
          paidAt: new Date(),
        },
      });

      // En kredit = ena vrstica (FIFO poraba v POST /api/consultations)
      await tx.consultationCredit.createMany({
        data: Array.from({ length: pack.credits }, () => ({
          email,
          orderId: created.id,
          source: "purchase",
          status: "available",
        })),
      });

      return created;
    });

    // === FUNNEL — plačni moment, strežniško (kot affiliate_click) ===
    try {
      await db.pageView.create({
        data: {
          path: "/konzultacija/checkout",
          funnelStep: "consultation_paid",
          title: `Paket: ${pack.name}`,
        },
      });
    } catch (trackError) {
      console.error("[consultations/order] funnel napaka:", trackError);
    }

    const credits = await db.consultationCredit.count({
      where: { email, status: "available" },
    });

    console.log(
      `[consultations/order] demo nakup — ${order.orderNumber} (${pack.key}), kreditov: ${credits}`
    );

    return NextResponse.json(
      {
        success: true,
        order: {
          orderNumber: order.orderNumber,
          packageName: order.packageName,
          credits: order.credits,
          amount: order.amount,
          currency: order.currency,
          paymentMethod: order.paymentMethod,
        },
        credits,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[consultations/order] POST napaka:", error);
    return NextResponse.json(
      { error: "Nakupa trenutno ni bilo mogoče zaključiti" },
      { status: 500 }
    );
  }
}
