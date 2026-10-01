// ============================================================================
// LASTNA TRŽNICA — SPROSTITEV PENDING REZERVACIJ (Issue #20 §4, FAZA 2)
// ============================================================================
// Db-plast (deljena med /api/checkout, /api/bookings in /api/stripe/webhook):
// pogojno, idempotentno prekliče pending naročilo/rezervacijo in sprosti
// rezervirano zalogo/kapaciteto. Uporaba:
//
//   1. webhook `checkout.session.expired` | `async_payment_failed` — kupec
//      ni plačal v oknu (ali je async bremenitev propadla) → rezervacija
//      gre nazaj v prodajo;
//   2. kompenzacija na ruti, če ustvarjanje Stripe seje pade TAKOJ po
//      zapisu pending vrstice (brez seje ni webhook-a, ki bi jo sprostil).
//
// Idempotenca: pogojni updateMany (WHERE status: "pending") je atomarna
// vrata — točno en klic izvede preklic, vsi ponovitveni (Stripe retry)
// dobijo count 0 in NE ponovno sproščajo zaloge (RC-4 vzorec).
// ============================================================================

import { db } from "@/lib/db";
import { orderItemsForStockRestore } from "@/lib/marketplace-checkout";

/**
 * Sprosti pending NAROČILO: pogojno preklicanje (pending → cancelled) in —
 * SAMO ob dejanskem preklicu — vrnitev zaloge ter saleCount po postavkah.
 *
 * Vrstni red je namerno PREKLIČI-NATO-SPROSTI: če bi se sprostitev zalogle
 * izvajala prva in padla, bi vrstica ostala pending brez možnosti ponovne
 * sprostitve. Zaloge se vrača posamezno (updateMany — izbrisan izdelek
 * pomeni 0 spremenjenih vrstic, NE napako), morebitna napaka srednjega
 * koraka se izpiše za ročno uskladitev (smer napake je varna: zaloga je
 * POD-štetja, preprodaja ni mogoča).
 *
 * @returns true, če je bila vrstica dejansko preklicana (false = ni bilo
 *          pending vrstice — že obdelano/ne obstaja; idempotentno).
 */
export async function releasePendingOrder(
  orderNumber: string
): Promise<boolean> {
  const cancel = await db.order.updateMany({
    where: { orderNumber, status: "pending" },
    data: { status: "cancelled" },
  });
  if (cancel.count !== 1) return false;

  const order = await db.order.findUnique({
    where: { orderNumber },
    select: { items: true },
  });
  const restore = order ? orderItemsForStockRestore(order.items) : null;
  if (restore) {
    for (const r of restore) {
      await db.product.updateMany({
        where: { id: r.productId },
        data: {
          stock: { increment: r.quantity },
          saleCount: { decrement: r.quantity },
        },
      });
    }
  } else {
    console.error(
      `[marketplace-checkout] releasePendingOrder ${orderNumber}: items JSON ni razčlenljiv — zaloga NI bila vrnjena (ročna uskladitev).`
    );
  }
  return true;
}

/**
 * Sprosti pending REZERVACIJO izkušnje: pogojno preklicanje (pending →
 * cancelled). Kapaciteta dneva se sprosti SAMA — checkDayAvailability
 * (TASK 33) šteje Σ groupSize rezervacij z statusom ≠ "cancelled".
 *
 * @returns true, če je bila vrstica dejansko preklicana (idempotentno).
 */
export async function releasePendingBooking(
  bookingNumber: string
): Promise<boolean> {
  const cancel = await db.booking.updateMany({
    where: { bookingNumber, status: "pending" },
    data: { status: "cancelled" },
  });
  return cancel.count === 1;
}
