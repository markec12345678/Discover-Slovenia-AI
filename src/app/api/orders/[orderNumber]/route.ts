import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/orders/[orderNumber]?email=kupec@primer.si
 *
 * Vrne Order podatek po orderNumber (za potrditev/status).
 *
 * VARNOST: ker orderNumber ni skrivnost, zahtevamo, da klicatelj navede
 * email kupca, ki se mora ujemati z buyerEmail naročila. Brez ujemanja
 * ne vrnemo PII podatkov (prej je bil endpoint popolnoma odprt — PII leak).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    // Rate limit lookupov (preprečuje enumeracijo naročil)
    const limited = rateLimit(request, {
      limit: 20,
      windowMs: 10 * 60_000,
      key: "order-lookup",
    });
    if (limited) return limited;

    const { orderNumber } = await params;

    if (!orderNumber) {
      return NextResponse.json(
        { error: "Številka naročila je obvezna." },
        { status: 400 }
      );
    }

    // Email verifikacija — zahtevan in mora ustrezati kupcu
    const requestUrl = new URL(request.url);
    const email = requestUrl.searchParams.get("email")?.toLowerCase().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Za ogled naročila navedite veljaven email naslov (query ?email=)." },
        { status: 401 }
      );
    }

    const order = await db.order.findUnique({
      where: { orderNumber },
    });

    // Enako sporočilo za neobstoječe in tuje naročilo (brez razkrivanja)
    const NOT_FOUND = { error: "Naročilo ni najdeno." } as const;
    if (!order || order.buyerEmail.toLowerCase().trim() !== email) {
      return NextResponse.json(NOT_FOUND, { status: 404 });
    }

    // Parse items JSON za klienta
    let parsedItems: unknown = [];
    try {
      parsedItems = JSON.parse(order.items);
    } catch {
      parsedItems = [];
    }

    return NextResponse.json({
      order: {
        orderNumber: order.orderNumber,
        buyerEmail: order.buyerEmail,
        buyerName: order.buyerName,
        buyerPhone: order.buyerPhone,
        buyerAddress: order.buyerAddress,
        buyerCity: order.buyerCity,
        buyerPostalCode: order.buyerPostalCode,
        buyerCountry: order.buyerCountry,
        status: order.status,
        paymentMethod: order.paymentMethod,
        subtotal: order.subtotal,
        shippingCost: order.shippingCost,
        total: order.total,
        currency: order.currency,
        items: parsedItems,
        trackingNumber: order.trackingNumber,
        notes: order.notes,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
      },
    });
  } catch (error) {
    console.error("[api/orders/orderNumber] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju naročila." },
      { status: 500 }
    );
  }
}
