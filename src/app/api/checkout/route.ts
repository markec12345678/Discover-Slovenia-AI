import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * POST /api/checkout
 *
 * Telo: {
 *   items: Array<{ productId, name, slug, price, quantity, image?, sellerName? }>,
 *   buyer: { email, name, phone, address, city, postalCode, country }
 * }
 *
 * - Validira vhod (email, ime, naslov required; items ne sme biti prazen)
 * - Server-side izračuna subtotal, shipping, total (ne zaupaj clientu)
 * - Generira orderNumber: IF-2025-XXXXXX
 * - DEMO mode (STRIPE_SECRET_KEY vsebuje "demo_placeholder"):
 *     - direktno ustvari Order s status="paid" + paidAt=now
 * - PRODUCTION mode: TODO — Stripe Checkout Session
 * - Shrani Order v bazo
 * - Vrne { success, orderNumber, total, status }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Neveljaven payload." },
        { status: 400 }
      );
    }

    const { items, buyer } = body as {
      items?: unknown;
      buyer?: Record<string, unknown>;
    };

    // --- Validacija items ---
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Košarica je prazna." },
        { status: 400 }
      );
    }

    // Sanitiziraj in validiraj vsak item
    const sanitizedItems: Array<{
      productId: string;
      name: string;
      slug: string;
      price: number;
      quantity: number;
      image?: string;
      sellerName?: string;
    }> = [];

    for (const raw of items) {
      if (!raw || typeof raw !== "object") {
        return NextResponse.json(
          { error: "Neveljaven izdelek v košarici." },
          { status: 400 }
        );
      }
      const it = raw as Record<string, unknown>;
      const productId =
        typeof it.productId === "string"
          ? it.productId
          : String(it.productId ?? "");
      const name = typeof it.name === "string" ? it.name : "";
      const slug = typeof it.slug === "string" ? it.slug : "";
      const price =
        typeof it.price === "number" && Number.isFinite(it.price)
          ? it.price
          : 0;
      const quantity =
        typeof it.quantity === "number" &&
        Number.isFinite(it.quantity) &&
        it.quantity > 0
          ? Math.floor(it.quantity)
          : 0;

      if (!productId || !name || quantity <= 0) {
        return NextResponse.json(
          { error: `Neveljaven izdelek: ${name || "neznan"}.` },
          { status: 400 }
        );
      }
      if (price < 0) {
        return NextResponse.json(
          { error: `Cena izdelka "${name}" je negativna.` },
          { status: 400 }
        );
      }

      sanitizedItems.push({
        productId,
        name,
        slug,
        price,
        quantity,
        image: typeof it.image === "string" ? it.image : undefined,
        sellerName:
          typeof it.sellerName === "string" ? it.sellerName : undefined,
      });
    }

    // --- Validacija buyer ---
    if (!buyer || typeof buyer !== "object") {
      return NextResponse.json(
        { error: "Manjkajo podatki kupca." },
        { status: 400 }
      );
    }

    const email = typeof buyer.email === "string" ? buyer.email.trim() : "";
    const name = typeof buyer.name === "string" ? buyer.name.trim() : "";
    const phone =
      typeof buyer.phone === "string" ? buyer.phone.trim() : undefined;
    const address =
      typeof buyer.address === "string" ? buyer.address.trim() : "";
    const city = typeof buyer.city === "string" ? buyer.city.trim() : "";
    const postalCode =
      typeof buyer.postalCode === "string" ? buyer.postalCode.trim() : "";
    const country =
      typeof buyer.country === "string" && buyer.country.trim()
        ? buyer.country.trim()
        : "Slovenija";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Veljavna e-pošta je obvezna." },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json(
        { error: "Ime in priimek sta obvezna." },
        { status: 400 }
      );
    }
    if (!address) {
      return NextResponse.json(
        { error: "Naslov za dostavo je obvezen." },
        { status: 400 }
      );
    }
    if (!city) {
      return NextResponse.json(
        { error: "Mesto je obvezno." },
        { status: 400 }
      );
    }
    if (!postalCode) {
      return NextResponse.json(
        { error: "Poštna številka je obvezna." },
        { status: 400 }
      );
    }

    // --- Pridobi podatke iz baze (cena + zaloga + shippingFree) ---
    const productIds = sanitizedItems.map((i) => i.productId);
    const dbProducts = await db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, shippingFree: true, price: true, stock: true },
    });

    // Overridaj cene iz baze (ne zaupaj clientu) in preveri zalogo
    for (const item of sanitizedItems) {
      const dbProduct = dbProducts.find((p) => p.id === item.productId);
      if (dbProduct) {
        item.price = dbProduct.price;
        if (dbProduct.stock < item.quantity) {
          return NextResponse.json(
            {
              error: `Izdelek "${item.name}" ni na zalogi v zahtevani količini (na zalogi: ${dbProduct.stock}).`,
            },
            { status: 400 }
          );
        }
      }
    }

    // --- Server-side izračun zneskov ---
    const subtotal = sanitizedItems.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0
    );

    // Shipping logika (enaka kot v cart-store):
    // - Brezplačno če subtotal >= 50 EUR
    // - Brezplačno če vsi izdelki imajo shippingFree
    // - Drugače 4.90 EUR
    let shipping = 0;
    if (subtotal > 0 && subtotal < 50) {
      const allFree = sanitizedItems.every((i) => {
        const dbProduct = dbProducts.find((p) => p.id === i.productId);
        return dbProduct?.shippingFree ?? false;
      });
      shipping = allFree ? 0 : 4.9;
    }

    const total = subtotal + shipping;

    // --- Generiraj orderNumber ---
    const year = new Date().getFullYear();
    const random = Date.now().toString().slice(-6);
    const orderNumber = `IF-${year}-${random}`;

    // --- Preveri ali je Stripe v demo načinu ---
    const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
    const isDemo = !stripeKey || stripeKey.includes("demo_placeholder");

    // Pripravi items JSON za bazo
    const itemsJson = JSON.stringify(
      sanitizedItems.map((i) => ({
        productId: i.productId,
        name: i.name,
        slug: i.slug,
        price: i.price,
        quantity: i.quantity,
        image: i.image,
        sellerName: i.sellerName,
      }))
    );

    // === DEMO MODE ===
    // direktno ustvari Order s status="paid"
    const order = await db.order.create({
      data: {
        orderNumber,
        buyerEmail: email,
        buyerName: name,
        buyerPhone: phone ?? null,
        buyerAddress: address,
        buyerCity: city,
        buyerPostalCode: postalCode,
        buyerCountry: country,
        status: "paid",
        paymentMethod: isDemo ? "demo" : "stripe",
        stripeSessionId: isDemo ? null : `demo_session_${orderNumber}`,
        subtotal,
        shippingCost: shipping,
        total,
        currency: "EUR",
        items: itemsJson,
        paidAt: new Date(),
      },
    });

    // Posodobi saleCount za vsak izdelek (ne-blokirajoče)
    for (const item of sanitizedItems) {
      db.product
        .update({
          where: { id: item.productId },
          data: { saleCount: { increment: item.quantity } },
        })
        .catch(() => {
          // ne-blokirajoče — ne moti checkout flow
        });
    }

    // Pošlji email kupcu (samo log za zdaj — TODO: pravi email servis)
    console.log(
      `[checkout] POSLAN EMAIL → ${email}: Naročilo ${order.orderNumber} potrjeno (skupaj: ${total.toFixed(2)} EUR). Demo=${isDemo}.`
    );

    return NextResponse.json({
      success: true,
      orderNumber: order.orderNumber,
      total,
      status: order.status,
      demo: isDemo,
    });

    // === PRODUCTION MODE ===
    // TODO: ko bo STRIPE_SECRET_KEY pravi:
    // 1. const stripe = new Stripe(stripeKey)
    // 2. Ustvari Stripe Checkout Session z line_items iz sanitizedItems
    // 3. Shrani Order s status="pending", stripeSessionId=session.id
    // 4. Vrni { url: session.url } za redirect
    // 5. Webhook (stripe/webhook) posodobi status na "paid" ob uspehu
  } catch (error) {
    console.error("[api/checkout] napaka:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Napaka pri obdelavi naročila.",
      },
      { status: 500 }
    );
  }
}
