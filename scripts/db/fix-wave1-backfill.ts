// FW1 backfill — enkratna migracija podatkov ob Fix Wave 1 (audit R3)
// Zagon: cd /home/z/Discover-Slovenia-AI && DATABASE_URL="$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"')" bun scripts/db/fix-wave1-backfill.ts
//
// Naredi dve stvari (obe idempotentni — lahko se poganja večkrat):
//  1. Semenske demo atribuirane rezervacije (source="consultation",
//     guestEmail @guest.demo) označi kot paymentStatus "paid" — nadzorovani
//     demo podatek, da provizijski dashboard ohrani živ prikaz. Vse ŽIVE
//     demo rezervacije prek /api/bookings so od FW1 naprej vedno "unpaid".
//  2. Normalizira Experience.providerEmail: kjer se razlikuje od
//     Owner.email (email prijavljenega lastnika), ga nastavi na owner.email.
//     Razlog: providerEmail je postal avtorizacijska referenca za
//     booking-manager (prej cross-tenant vektor, audit R3 🟠 #2) — od FW1
//     API zahteva providerEmail === owner.email; ta skripta poravna
//     obstoječe vrstice z novim invariantom.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // ─── 1. Semenske atribuirane rezervacije → paymentStatus "paid" ────────
  const seedBookings = await db.booking.findMany({
    where: {
      source: "consultation",
      guestEmail: { endsWith: "@guest.demo" },
    },
    select: {
      id: true,
      bookingNumber: true,
      paymentStatus: true,
      status: true,
      total: true,
    },
  });
  console.log(
    `[1] Najdenih ${seedBookings.length} semenskih atribuiranih rezervacij (@guest.demo)`
  );
  for (const b of seedBookings) {
    if (b.paymentStatus === "paid") {
      console.log(`    · ${b.bookingNumber}: že "paid" — preskočeno`);
      continue;
    }
    await db.booking.update({
      where: { id: b.id },
      data: { paymentStatus: "paid" },
    });
    console.log(
      `    · ${b.bookingNumber}: paymentStatus → "paid" (${b.status}, ${b.total} €)`
    );
  }

  // Ločeno poročilo: ŽIVE (ne-semenske) atribuirane rezervacije — te morajo
  // ostati "unpaid" (če obstajajo, so nastale prek javnega APIja).
  const liveConsultBookings = await db.booking.count({
    where: {
      source: "consultation",
      guestEmail: { not: { endsWith: "@guest.demo" } },
    },
  });
  console.log(
    `    · ŽIVIH (ne-semenskih) atribuiranih rezervacij: ${liveConsultBookings} (ostanejo "unpaid" — v osnovo NE vstopijo)`
  );

  // ─── 2. Normalizacija Experience.providerEmail → Owner.email ───────────
  const experiences = await db.experience.findMany({
    where: { ownerId: { not: null } },
    select: {
      id: true,
      name: true,
      providerEmail: true,
      ownerId: true,
      owner: { select: { email: true } },
    },
  });
  let normalized = 0;
  for (const e of experiences) {
    const ownerEmail = e.owner?.email?.toLowerCase().trim();
    if (!ownerEmail) continue;
    const current = e.providerEmail?.toLowerCase().trim();
    if (current === ownerEmail) continue;
    await db.experience.update({
      where: { id: e.id },
      data: { providerEmail: e.owner?.email },
    });
    normalized++;
    console.log(
      `    · Izkušnja "${e.name}": providerEmail ${current ?? "null"} → ${e.owner?.email}`
    );
  }
  console.log(
    `[2] Normaliziranih providerEmail: ${normalized} (skupaj pregledanih ${experiences.length})`
  );

  // ─── Poročilo ──────────────────────────────────────────────────────────
  const paidCount = await db.booking.count({ where: { paymentStatus: "paid" } });
  const unpaidCount = await db.booking.count({
    where: { paymentStatus: "unpaid" },
  });
  console.log(
    `[report] Booking paymentStatus: paid=${paidCount}, unpaid=${unpaidCount}`
  );
  console.log("[done] FW1 backfill zaključen.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
