import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { randomId } from "@/lib/security";
import { sendEmail, isEmailDemo } from "@/lib/email";
import { orderConfirmationEmail } from "@/lib/email-templates";
import { isStripeConfigured, isStripeDemo } from "@/lib/stripe-server";
import {
  MARKETPLACE_ORDER_TYPE,
  ORDER_ACTIVE_STATUSES,
  buildOrderCheckoutLineItems,
  checkoutExpiresAt,
} from "@/lib/marketplace-checkout";
import { releasePendingOrder } from "@/lib/marketplace-checkout-server";

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
 * - DEMO mode (brez realnih ključev; v produkciji SAMO z DSA_DEMO_PAYMENTS=1):
 *     - direktno ustvari Order s status="paid" + paidAt=now
 * - PRODUCTION mode (Issue #20 §4 FAZA 2, 1.158.0): atomarno ustvari
 *     PENDING Order (rezervira zalogo) → Stripe Checkout Session (payment
 *     mode, metadata type=marketplace_order) → vrne { url } za preusmeritev.
 *     "paid" zapiše IZKLJUČNO overjeni webhook (checkout.session.completed
 *     z preverbo payment_status + zneska); potek/plačilni propad seje
 *     (expired | async_payment_failed) zalogo sprosti.
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

    // --- FW1 (audit R2 🔴 #1/#2): agregacija količin po produktu ---
    // Prej je zanka preverjala VSAKO vrstico posebej proti isti
    // (ne-dekrementirani) zalogi — payload [{X,1},{X,1}] pri stock=1 je
    // prestal oba checka in naročil 2× zalogo. Zdaj se količine ISTEGA
    // produkta seštejejo (kot jih deduplicira tudi UI cart-store), check
    // in decrement pa se izvedeta nad AGREGIRANO količino.
    if (items.length > 50) {
      return NextResponse.json(
        { error: "Preveč različnih izdelkov v košarici (največ 50)." },
        { status: 400 }
      );
    }
    const aggregated = new Map<
      string,
      {
        productId: string;
        name: string;
        slug: string;
        price: number;
        quantity: number;
        image?: string;
        sellerName?: string;
      }
    >();
    for (const item of sanitizedItems) {
      const existing = aggregated.get(item.productId);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        aggregated.set(item.productId, { ...item });
      }
    }
    // Deterministični vrstni red (sortirano po productId) — podlaga za
    // dedup ključ naročila spodaj.
    const canonicalItems = [...aggregated.values()].sort((a, b) =>
      a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0
    );

    // --- Pridobi podatke iz baze (cena + zaloga + shippingFree) ---
    // P3b-1/P3a-7: isčemo SAMO objavljene izdelke — pending/rejected/
    // unpublished se spodaj obravnavajo kot neveljavni (400).
    const productIds = canonicalItems.map((i) => i.productId);
    const dbProducts = await db.product.findMany({
      where: { id: { in: productIds }, status: "published" },
      select: { id: true, shippingFree: true, price: true, stock: true },
    });
    const dbProductMap = new Map(dbProducts.map((p) => [p.id, p]));

    // Overridaj cene iz baze (ne zaupaj clientu).
    // P3b-1/P3a-7: neznan ali neobjavljen productId → 400 — prej se je
    // obdržala CLIENT cena (živi dokaz iz audita: naročilo po 0,01 €).
    for (const item of canonicalItems) {
      const dbProduct = dbProductMap.get(item.productId);
      if (!dbProduct) {
        return NextResponse.json(
          { error: `Izdelek "${item.name}" ni na voljo.` },
          { status: 400 }
        );
      }
      item.price = dbProduct.price;
    }

    // --- Preveri ali je Stripe v demo načinu ---
    // 19e-1 (revizija 1.36.0, P2): prej INLINE detekcija po odstopnosti
    // ključa — v produkciji z unset STRIPE_SECRET_KEY bi se naročilo tiho
    // zapisalo kot "paid". Zdaj skupni fail-closed helper: demo v produkciji
    // zahteva izrecni DSA_DEMO_PAYMENTS=1, sicer fail-closed napaka.
    const isDemo = isStripeDemo();

    // ISSUE #20 §4 FAZA 2 (1.158.0): PRODUCTION MODE za izdelke — prej je
    // bila tu 501 varovalka (TODO). Zdaj je tu PRAVA aktivacijska pot:
    // pending Order (atomarno rezervira zalogo) → Stripe Checkout Session
    // (payment mode, metadata type=marketplace_order) → url preusmeritev →
    // webhook checkout.session.completed (edini writer "paid") /
    // checkout.session.expired|async_payment_failed (sprosti zalogo).
    // P7-C3/P7-C4 (P1) ostaja v veljavi: brez Stripe Checkout seje in
    // webhook potrditve naročilo NIKOLI ni "paid".
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!isDemo && (!isStripeConfigured() || !stripeKey)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Plačila niso konfigurirana (STRIPE_SECRET_KEY manjka). Nastavite Stripe ključe ali DSA_DEMO_PAYMENTS=1 za demo način.",
        },
        { status: 503 }
      );
    }

    // ISSUE #20 §4 FAZA 2: v produkciji dedup zajema SAMO aktivne naročilne
    // vrstice (pending = seja še čaka na plačilo, paid = opravljeno).
    // Preklicana (potekla/plačilno propadla) vrstica NOVEGA poskusa NE
    // blokira — njena rezervacija je bila sproščena. Demo (kjer so vrstice
    // vedno "paid") se obnaša nespremenjeno.
    const dedupStatusFilter = isDemo
      ? undefined
      : { in: [...ORDER_ACTIVE_STATUSES] };

    // FW1: DEDUP PRE-CHECK — pred preverjanjem zaloge. Duplikatni request
    // (dvoklik/retry) mora dobiti 409 s številko PRVEGA naročila TUDI takrat,
    // ko je prvotno naročilo medtem porabilo zadnjo zalogo (sicer bi kupec
    // videl zavajujoče "ni na zalogi" namesto "naročilo že obstaja").
    // Atomarna dedup varovalka ostaja znotraj transakcije spodaj — ta
    // pre-check je samo hitra (ne-tekmovalna) pot.
    const dupWindowStart = new Date(Date.now() - 10 * 60_000);
    // MF-6 (revizija 1.36.0, P3): ključ dedupa se zdaj sortira ENAKO kot
    // orderItemsKey spodaj (leksikografsko po "id:qty" nizu) — prej je bil
    // vrstni red po productId, shranjeni ključ pa sortiran po nizu; za
    // prefix-ID-je ("abc" vs "abc1") se vrstni red razlikuje → dvoklik
    // bi lahko ustvaril duplikat naročila.
    const dedupKey = canonicalItems
      .map((i) => `${i.productId}:${i.quantity}`)
      .sort()
      .join("|");
    const orderItemsKey = (itemsRaw: string): string => {
      try {
        const parsed = JSON.parse(itemsRaw) as Array<{
          productId?: unknown;
          quantity?: unknown;
        }>;
        if (!Array.isArray(parsed)) return "";
        return parsed
          .map((i) => `${String(i.productId)}:${Number(i.quantity)}`)
          .sort()
          .join("|");
      } catch {
        return "";
      }
    };
    const findRecentDuplicate = async (): Promise<string | null> => {
      const recent = await db.order.findMany({
        where: {
          buyerEmail: email,
          createdAt: { gte: dupWindowStart },
          ...(dedupStatusFilter ? { status: dedupStatusFilter } : {}),
        },
        select: { orderNumber: true, items: true },
      });
      for (const r of recent) {
        if (orderItemsKey(r.items) === dedupKey) return r.orderNumber;
      }
      return null;
    };
    const earlyDup = await findRecentDuplicate();
    if (earlyDup) {
      return NextResponse.json(
        {
          success: false,
          error:
            "To naročilo je bilo pravkar ustvarjeno. Preverite svojo e-pošto za potrditev.",
          orderNumber: earlyDup,
        },
        { status: 409 }
      );
    }

    // FW1: hitri predhodni check zaloge po AGREGIRANI količini (fast-fail
    // za boljšo UX); PRAVA varovalka je atomarni pogojni decrement v
    // transakciji spodaj (preprečuje overselling tudi ob současnosti).
    for (const item of canonicalItems) {
      const dbProduct = dbProductMap.get(item.productId);
      if (dbProduct && dbProduct.stock < item.quantity) {
        return NextResponse.json(
          {
            error: `Izdelek "${item.name}" ni na zalogi v zahtevani količini (na zalogi: ${dbProduct.stock}).`,
          },
          { status: 400 }
        );
      }
    }

    // --- Server-side izračun zneskov ---
    // MF-1 (revizija 1.36.0, P3): seštevanje v floatih je prag poštnine
    // lahko zaneslo čez mejo (14.20 + 17.90 + 17.90 = 49.99999999999999 < 50
    // → pravemu €50,00 košariki zaračunana €4,90 poštnina). Zdaj: celoti
    // v CENTIH (round na izdelek), deljeni nazaj za shranjevanje.
    const subtotalCents = canonicalItems.reduce(
      (sum, i) => sum + Math.round(i.price * 100) * i.quantity,
      0
    );
    const subtotal = subtotalCents / 100;

    // Shipping logika (enaka kot v cart-store):
    // - Brezplačno če subtotal >= 50 EUR
    // - Brezplačno če vsi izdelki imajo shippingFree
    // - Drugače 4.90 EUR
    let shipping = 0;
    if (subtotal > 0 && subtotalCents < 5000) {
      // P3b-1: vsi izdelki so od tu naprej veljavni published DB zapisi —
      // lookup po mapi je vedno zadet (?? false ostaja samo tipovska varovalka).
      const allFree = canonicalItems.every(
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

    // Pripravi items JSON za bazo (AGREGIRANO + sortirano — kanonska oblika)
    const itemsJson = JSON.stringify(
      canonicalItems.map((i) => ({
        productId: i.productId,
        name: i.name,
        slug: i.slug,
        price: i.price,
        quantity: i.quantity,
        image: i.image,
        sellerName: i.sellerName,
      }))
    );

    // === FW1 (audit R2 🔴 #1/#2/#3): ATOMICNA TRANSAKCIJA ===
    // Zaloga se od tu naprej DEJANSKO zmanjša ob uspešnem naročilu, in sicer
    // s POGOJNIM decrementedom (compare-and-decrement) ZNOTRAJ transakcije —
    // atomarno tudi ob současnih checkoutih (dva vzporedna klica pri stock=1:
    // prvi decremente uspe, drugi dobi count=0 → 400, overselling nemogoč).
    // Dodatno: deduplikacija naročil (dvoklik/browser retry) po vzorcu iz
    // /api/bookings (P8) — isti kupec + ista vsebina košarice v 10-minutnem
    // oknu → 409 s številko PRVEGA naročila, brez drugega emaila/decrementa.
    // SERIALIZABLE + retry na P2034 (PostgreSQL/Neon); SQLite (lokalna demo
    // baza) pusti privzeto raven — pogojni decrement je varen na obeh.
    class StockChangedError extends Error {
      constructor(public productName: string) {
        super(`Zaloga za "${productName}" se je medtem spremenila.`);
      }
    }
    const txOptions = process.env.DATABASE_URL?.startsWith("file:")
      ? undefined
      : {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        };
    const createOrderAtomically = async (): Promise<{
      duplicate: boolean;
      orderNumber: string;
    }> => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await db.$transaction(
            async (tx) => {
              // 1) Dedup — isto košarico + isti kupec v 10 min → idempotentno
              //    (produkcija: samo aktivne vrstice — glej dedupStatusFilter)
              const recent = await tx.order.findMany({
                where: {
                  buyerEmail: email,
                  createdAt: { gte: dupWindowStart },
                  ...(dedupStatusFilter ? { status: dedupStatusFilter } : {}),
                },
                select: { orderNumber: true, items: true },
              });
              for (const r of recent) {
                if (orderItemsKey(r.items) === dedupKey) {
                  return { duplicate: true, orderNumber: r.orderNumber };
                }
              }
              // 2) Pogojni decrement zaloga + saleCount (atomarno, v isti
              //    transakciji kot order.create — prej fire-and-forget)
              for (const item of canonicalItems) {
                const res = await tx.product.updateMany({
                  where: { id: item.productId, stock: { gte: item.quantity } },
                  data: {
                    stock: { decrement: item.quantity },
                    saleCount: { increment: item.quantity },
                  },
                });
                if (res.count === 0) {
                  throw new StockChangedError(item.name);
                }
              }
              // 3) Ustvari naročilo. ISSUE #20 §4 FAZA 2 (1.158.0):
              //    demo = takoj "paid" (izrecen demo z DSA_DEMO_PAYMENTS=1 v
              //    produkciji); produkcija = "pending" + paymentMethod
              //    "stripe" — "paid" in paidAt bo zapisal IZKLJUČNO overjeni
              //    Stripe webhook po preverjeni bremenitvi (P7-C3/P7-C4).
              const created = await tx.order.create({
                data: {
                  orderNumber,
                  buyerEmail: email,
                  buyerName: name,
                  buyerPhone: phone ?? null,
                  buyerAddress: address,
                  buyerCity: city,
                  buyerPostalCode: postalCode,
                  buyerCountry: country,
                  status: isDemo ? "paid" : "pending",
                  paymentMethod: isDemo ? "demo" : "stripe",
                  stripeSessionId: null,
                  subtotal,
                  shippingCost: shipping,
                  total,
                  currency: "EUR",
                  items: itemsJson,
                  paidAt: isDemo ? new Date() : null,
                },
                select: { orderNumber: true },
              });
              return { duplicate: false, orderNumber: created.orderNumber };
            },
            txOptions
          );
        } catch (error) {
          if (error instanceof StockChangedError) {
            throw error; // → namenski 400 handler spodaj (brez retryja)
          }
          const conflict =
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2034";
          if (!conflict || attempt >= 2) {
            // Nepričakovana napaka ali izčrpani poskusi: če je drug request
            // vmes uspel, vrnemo duplikat (idempotenten odgovor), sicer napaka
            // gre v splošni handler (500).
            const lateDup = await findRecentDuplicate();
            if (lateDup) {
              return { duplicate: true, orderNumber: lateDup };
            }
            throw error;
          }
          await new Promise((r) => setTimeout(r, 60));
        }
      }
    };

    // === DEMO MODE ===
    // direktno ustvari Order s status="paid" (izključno demo — glej 501
    // varovalko zgoraj) — atomarno z decrementedom zaloge (glej zgoraj)
    let outcome: { duplicate: boolean; orderNumber: string };
    try {
      outcome = await createOrderAtomically();
    } catch (error) {
      if (error instanceof StockChangedError) {
        return NextResponse.json(
          {
            error: `Izdelek "${error.productName}" ni več na zalogi v zahtevani količini. Poskusite znova z manjšim številom kosov.`,
          },
          { status: 400 }
        );
      }
      throw error;
    }
    if (outcome.duplicate) {
      return NextResponse.json(
        {
          success: false,
          error:
            "To naročilo je bilo pravkar ustvarjeno. Preverite svojo e-pošto za potrditev.",
          orderNumber: outcome.orderNumber,
        },
        { status: 409 }
      );
    }
    const createdOrderNumber = outcome.orderNumber;

    // === PRODUCTION MODE (Issue #20 §4 FAZA 2) — Stripe Checkout Session ===
    // Pending naročilo (z rezervirano zalogo) že varno obstaja v bazi; zdaj
    // odpremo plačilno sejo in shranimo njen ID. Ta koda NE piše "paid" —
    // to stori izključno webhook po overitvi podpisa in zneska.
    if (!isDemo) {
      if (!stripeKey) {
        // Defenzivna tipovska ozka vrata — 503 preverba zgoraj že varuje.
        return NextResponse.json(
          { success: false, error: "Stripe ni konfiguriran" },
          { status: 503 }
        );
      }
      try {
        const stripe = new Stripe(stripeKey, {
          // FIXME: stripe v22 tipi pričakujejo le LatestApiVersion
          // ("2026-05-27.dahlia"); pin ostaja na "2024-12-18.acacia"
          // (nespremenjeno obnašanje, enako ostalim Stripe rutam).
          apiVersion: "2024-12-18.acacia" as NonNullable<
            ConstructorParameters<typeof Stripe>[1]
          >["apiVersion"],
        });
        const baseUrl =
          process.env.NEXTAUTH_URL ??
          (process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : "http://localhost:3000");

        const checkoutSession = await stripe.checkout.sessions.create({
          mode: "payment",
          customer_email: email,
          // Cene so STREŽNIŠKE (iz DB, glej override zgoraj) — line items
          // iz kanonskih agregiranih postavk + poštnina kot lastna postavka.
          line_items: buildOrderCheckoutLineItems(
            canonicalItems.map((i) => ({
              productId: i.productId,
              name: i.name,
              quantity: i.quantity,
              unitAmountCents: Math.round(i.price * 100),
            })),
            Math.round(shipping * 100)
          ),
          metadata: {
            type: MARKETPLACE_ORDER_TYPE,
            orderNumber: createdOrderNumber,
          },
          // Rezervacija zaloge je časovno OMEJENA (60 min) — po poteku jo
          // webhook checkout.session.expired sprosti (glej
          // marketplace-checkout-server.ts).
          expires_at: checkoutExpiresAt(),
          success_url: `${baseUrl}/trznica?placilo=uspeh&narocilo=${createdOrderNumber}`,
          cancel_url: `${baseUrl}/trznica?placilo=preklicano`,
        });

        await db.order.update({
          where: { orderNumber: createdOrderNumber },
          data: { stripeSessionId: checkoutSession.id },
        });

        return NextResponse.json({
          success: true,
          url: checkoutSession.url,
          orderNumber: createdOrderNumber,
          total,
          status: "pending" as const,
          demo: false,
        });
      } catch (error) {
        // KOMPENZACIJA (Issue #20 §4 FAZA 2): seja ni nastala → pending
        // vrstica NIMA webhook-a, ki bi jo sprostil — prekličemo jo takoj
        // in vrnemo zalogo (best-effort; smer morebitne napake je varna:
        // zaloga pod-šteta, preprodaja ni mogoča).
        await releasePendingOrder(createdOrderNumber).catch((e) => {
          console.error(
            "[checkout] kompenzacija releasePendingOrder napaka:",
            e
          );
        });
        console.error("[checkout] stripe session napaka:", error);
        return NextResponse.json(
          { error: "Napaka pri pripravi plačila. Poskusite znova." },
          { status: 500 }
        );
      }
    }

    // === DEMO MODE — direktno "paid" (izključno demo; glej 503 vrata) ===
    const order = { orderNumber: createdOrderNumber, status: "paid" as const };

    // === Potrditveni email kupcu — NE-BLOKIRAJOČE (fire-and-forget) ===
    // Naročilo je že varno shranjeno v bazi — morebitna napaka emaila NE sme
    // sesuti odgovora (isti vzorec kot /api/listing-inquiry).
    try {
      const mail = orderConfirmationEmail({
        orderNumber: order.orderNumber,
        buyerName: name,
        items: canonicalItems.map((i) => ({
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
      demo: true,
    });
  } catch (error) {
    console.error("[api/checkout] napaka:", error);
    // INFO-LEAK FIX (revizija 1.33.0, 16-b P2): raw Prisma/DB napake so
    // lahko vsebovale dele povezovalnih nizov / imena omejitev — javni
    // endpoint zdaj vrača statično sporočilo; podrobnosti ostanejo v logu.
    return NextResponse.json(
      { error: "Napaka pri obdelavi naročila." },
      { status: 500 }
    );
  }
}
