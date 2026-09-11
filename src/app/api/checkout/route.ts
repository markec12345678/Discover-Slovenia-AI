import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { randomId } from "@/lib/security";
import { sendEmail, isEmailDemo } from "@/lib/email";
import { orderConfirmationEmail } from "@/lib/email-templates";

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
 * - Generira orderNumber: IF-<leto>-<naključni ID> (nerodljiv)
 * - DEMO mode (STRIPE_SECRET_KEY vsebuje "demo_placeholder"):
 *     - direktno ustvari Order s status="paid" + paidAt=now
 * - PRODUCTION mode: TODO — Stripe Checkout Session
 * - Shrani Order v bazo
 * - Pošlje potrditveni email kupcu (ne-blokirajoče — glej /api/listing-inquiry vzorec)
 * - Vrne { success, orderNumber, total, status }
 */
export async function POST(request: Request) {
  try {
    // Rate limit (preprečuje spam naročil)
    const limited = rateLimit(request, {
      limit: 10,
      windowMs: 60 * 60_000,
      key: "checkout",
    });
    if (limited) return limited;

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
    // P3b-1/P3a-7: isčemo SAMO objavljene izdelke — pending/rejected/
    // unpublished se spodaj obravnavajo kot neveljavni (400).
    const productIds = sanitizedItems.map((i) => i.productId);
    const dbProducts = await db.product.findMany({
      where: { id: { in: productIds }, status: "published" },
      select: { id: true, shippingFree: true, price: true, stock: true },
    });
    const dbProductMap = new Map(dbProducts.map((p) => [p.id, p]));

    // Overridaj cene iz baze (ne zaupaj clientu) in preveri zalogo.
    // P3b-1/P3a-7: neznan ali neobjavljen productId → 400 — prej se je
    // obdržala CLIENT cena (živi dokaz iz audita: naročilo po 0,01 €).
    for (const item of sanitizedItems) {
      const dbProduct = dbProductMap.get(item.productId);
      if (!dbProduct) {
        return NextResponse.json(
          { error: `Izdelek "${item.name}" ni na voljo.` },
          { status: 400 }
        );
      }
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
      // P3b-1: vsi izdelki so od tu naprej veljavni published DB zapisi —
      // lookup po mapi je vedno zadet (?? false ostaja samo tipovska varovalka).
      const allFree = sanitizedItems.every(
        (i) => dbProductMap.get(i.productId)?.shippingFree ?? false
      );
      shipping = allFree ? 0 : 4.9;
    }

    const total = subtotal + shipping;

    // --- Generiraj orderNumber (naključni — neurogljiv) ---
    // P3b-10: 12 hex znakov (48-bit entropije) namesto prej 8 (32-bit) —
    // daljši format ne seka starih številk (različna dolžina = vedno unikatno).
    const year = new Date().getFullYear();
    const orderNumber = `IF-${year}-${randomId(12)}`;

    // --- Preveri ali je Stripe v demo načinu ---
    const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
    const isDemo = !stripeKey || stripeKey.includes("demo_placeholder");

    // P7-C3/P7-C4 (P1): fail-closed kot /api/bookings — naročila v
    // produkciji NE smejo biti zapisana kot "paid" brez Stripe Checkout
    // Session-a in webhook potrditve (prej: status "paid" + lažen
    // stripeSessionId tudi ob pravih ključih; produkcija ni bila dosegljiva
    // iz mrtve TODO veje za return-om).
    if (!isDemo) {
      return NextResponse.json(
        {
          success: false,
          error: "Kartično plačilo tržnice še ni konfigurirano v produkcijskem načinu.",
        },
        { status: 501 }
      );
    }

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
    // direktno ustvari Order s status="paid" (izključno demo — glej 501 varovalko zgoraj)
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
        paymentMethod: "demo",
        stripeSessionId: null,
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

    // === Potrditveni email kupcu — NE-BLOKIRAJOČE (fire-and-forget) ===
    // Naročilo je že varno shranjeno v bazi — morebitna napaka emaila NE sme
    // sesuti odgovora (isti vzorec kot /api/listing-inquiry).
    try {
      const mail = orderConfirmationEmail({
        orderNumber: order.orderNumber,
        buyerName: name,
        items: sanitizedItems.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price,
        })),
        subtotal,
        shipping,
        total,
      });

      void sendEmail({
        to: email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      })
        .then((sent) => {
          console.log(
            `[checkout] potrditveni email za ${order.orderNumber} → ${email}: ${
              sent ? "poslan" : "NEUSPEŠEN"
            } (stripe demo: ${isDemo}, email demo: ${isEmailDemo()}).`
          );
        })
        .catch(() => {
          // email ne sme sesuti checkout odgovora
        });
    } catch (e) {
      console.error("[checkout] priprava potrditvenega emaila:", e);
    }

    return NextResponse.json({
      success: true,
      orderNumber: order.orderNumber,
      total,
      status: order.status,
      demo: isDemo,
    });

    // === PRODUCTION MODE ===
    // (onemogočeno — 501 varovalka zgoraj; ko bo implementirano: Stripe
    // Checkout Session z line_items iz sanitizedItems, Order s status
    // "pending" + stripeSessionId, webhook posodobi na "paid")
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
