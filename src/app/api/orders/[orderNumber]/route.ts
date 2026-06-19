import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/orders/[orderNumber]
 *
 * Vrne Order podatek po orderNumber (za potrditev/status).
 * Uporablja se za order lookup (npr. po uspešnem checkoutu ali za tracking).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    const { orderNumber } = await params;

    if (!orderNumber) {
      return NextResponse.json(
        { error: "Številka naročila je obvezna." },
        { status: 400 }
      );
    }

    const order = await db.order.findUnique({
      where: { orderNumber },
    });

    if (!order) {
      return NextResponse.json(
        { error: "Naročilo ni najdeno." },
        { status: 404 }
      );
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
