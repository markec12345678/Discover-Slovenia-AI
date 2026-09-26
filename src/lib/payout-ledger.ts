import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-log";
import {
  COMMISSION_RATE,
  isPremiumOwner,
  monthRange,
  monthRangeFor,
  monthKeyFor,
  type OwnerPremiumFields,
} from "@/lib/commissions";
import type { PayoutEntry, PayoutSettlement } from "@prisma/client";

// ============================================================================
// PAYOUT LEDGER — knjigovodska evidenca prihodkov ponudnika (TASK 34, B3)
// ============================================================================
// Mandat docs/COMPETITIVE-ANALYSIS.md B3: "Payout ledger / settlement report —
// računovodstvo ponudnika (kdor je dobil koliko)". DETERMINISTIČNO, brez
// prenosov denarja (B2 — Stripe Connect/PayPal izplačila — ostaja prihodnji
// korak po filozofiji "najprej funkcionalna celota").
//
// Denarni model (enak kot pri provizijah): turist plača polno ceno
// NEPOSREDNO ponudniku. Ledger ima dve plasti:
//   - PayoutEntry (postavka po rezervaciji, SNAPSHOT): bruto = kar je
//     ponudnik prejel; provizija = obveznost platformi SAMO za rezervacije
//     iz AI kanala (source "consultation") pri free partnerju — ISTI pogoj
//     kot CommissionInvoice (FW1/P7-C3 invariant: paymentStatus "paid" +
//     status confirmed/completed); neto = bruto − provizija.
//   - PayoutSettlement (mesečna poravnava): zajame VSE odprte postavke do
//     vključno poravnanega meseca (zameta tudi pozneje plačane starejše
//     rezervacije — knjigovodski "sweep"). Status pending → settled je
//     POTRDITEV uskladitve evidence, NE prenos denarja.
//
// Uporabniki:
//   - GET/POST /api/owner/payouts (dashboard, zavihek Izplačila)
//   - POST /api/cron/… (prihodnje: samodejna izdaja — enak vzorec kot cron
//     commission-invoices; danes ročno prek dashboarda)

export const PAYOUT_ENTRY_STATUSES = ["pending", "settled"] as const;
export const PAYOUT_SETTLEMENT_STATUSES = ["pending", "settled"] as const;

const round2 = (v: number) => Math.round(v * 100) / 100;

/** PAYOUT-YYYYMM-XXXXXX (ista mehanika številčenja kot INV-YYYYMM). */
export function settlementNumberFor(periodStart: Date): string {
  const ym = monthKeyFor(periodStart);
  const suffix = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `PAYOUT-${ym}-${suffix}`;
}

/**
 * Provizijska stopnja za posamezno postavko ledgerja (snapshot ob nastanku).
 * Provizija nastopi SAMO za rezervacije iz AI kanala (vir resnice:
 * lib/commissions.ts — "consultation") in SAMO za free partnerje
 * (premium/enterprise = 0 %, vključeno v naročnino).
 */
export function payoutRateForBooking(
  booking: { source: string | null },
  owner: OwnerPremiumFields
): number {
  if (booking.source !== "consultation") return 0;
  if (isPremiumOwner(owner)) return 0;
  return COMMISSION_RATE;
}

/** Zneski postavke iz bruto zneska in stopnje (zaokroženo na cent). */
export function payoutAmountsFor(gross: number, rate: number) {
  const commissionAmount = round2(gross * rate);
  const netAmount = round2(gross - commissionAmount);
  return { commissionAmount, netAmount };
}

/**
 * Merilo, ali rezervacija SPADA v ledger (en vir resnice za sync + teste).
 * FW1 invariant: SAMO dejansko plačane (paymentStatus "paid"), nepreklicane
 * (status confirmed/completed) rezervacije — demo/unpaid NIKOLI ne vstopi
 * (enak pogoj kot provizijska osnova v lib/commissions.ts).
 */
export function isLedgerEligibleBooking(booking: {
  status: string;
  paymentStatus: string;
}): boolean {
  return (
    (booking.status === "confirmed" || booking.status === "completed") &&
    booking.paymentStatus === "paid"
  );
}

// ============================================================================
// syncPayoutEntries — idempotentno vzpostavljanje/dopolnjevanje evidence
// ============================================================================
// Ustvari MANKAJOČE postavke za VSE ledger-upravičene rezervacije lastnikovih
// izkušenj z createdAt < upTo (privzeto: konec tekočega meseca — torej vse,
// kar se je doslej zgodilo). bookingId @@unique + P2002 → preskoči (večkratni
// klic NE podvoji). Pokliče jo GET /api/owner/payouts (samo-zdravljenje
// evidence ob vsakem ogledu) in issuePayoutSettlement (pred zajemom, z mejo
// na poravnano obdobje — prihodnje rezervacije pustijo pri miru).
export async function syncPayoutEntries(
  owner: OwnerPremiumFields,
  opts?: { upTo?: Date }
): Promise<{ upTo: Date; created: number }> {
  const upTo = opts?.upTo ?? monthRange(0).end;

  const experiences = await db.experience.findMany({
    where: { ownerId: owner.id },
    select: { id: true },
  });
  const experienceIds = experiences.map((e) => e.id);
  if (experienceIds.length === 0) {
    return { upTo, created: 0 };
  }

  // Ledger-upravičene rezervacije do zgornje meje (FW1/P7-C3 — glej
  // isLedgerEligibleBooking; pogoji tu so istoimenski vir resnice synca).
  const bookings = await db.booking.findMany({
    where: {
      experienceId: { in: experienceIds },
      createdAt: { lt: upTo },
      status: { in: ["confirmed", "completed"] },
      paymentStatus: "paid",
    },
    select: {
      id: true,
      bookingNumber: true,
      experienceName: true,
      bookingDate: true,
      groupSize: true,
      source: true,
      total: true,
      currency: true,
      createdAt: true,
    },
  });
  if (bookings.length === 0) {
    return { upTo, created: 0 };
  }

  // Idempotenca: preskoči rezervacije, ki že imajo postavko
  const existing = await db.payoutEntry.findMany({
    where: { bookingId: { in: bookings.map((b) => b.id) } },
    select: { bookingId: true },
  });
  const have = new Set(existing.map((e) => e.bookingId));

  let created = 0;
  for (const b of bookings) {
    if (have.has(b.id)) continue;
    const rate = payoutRateForBooking(b, owner);
    const { commissionAmount, netAmount } = payoutAmountsFor(b.total, rate);
    // Mesec REZERVACIJE (po createdAt) določi obdobje poravnave postavke —
    // ne čas synca (zameta pozneje plačane rezervacije starejših obdobij).
    const entryPeriod = monthRangeFor(b.createdAt);
    try {
      await db.payoutEntry.create({
        data: {
          ownerId: owner.id,
          bookingId: b.id,
          bookingNumber: b.bookingNumber,
          experienceName: b.experienceName,
          bookingDate: b.bookingDate,
          groupSize: b.groupSize,
          source: b.source,
          grossAmount: b.total,
          rate,
          commissionAmount,
          netAmount,
          currency: b.currency,
          periodStart: entryPeriod.start,
          periodEnd: entryPeriod.end,
          status: "pending",
        },
      });
      created += 1;
    } catch (error) {
      // P2002 (bookingId unique): sočasen sync je med tem ustvaril postavko —
      // idempotenten preskok (isti vzorec kot P2002 v issueCommissionInvoice).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  return { upTo, created };
}

export type SettlementResult =
  | { status: "issued"; settlement: PayoutSettlement }
  | { status: "duplicate"; settlementNumber: string }
  | { status: "no_entries" };

// ============================================================================
// issuePayoutSettlement — izda poravnavo za PREJŠNJI koledarski mesec
// ============================================================================
// Vzorec issueCommissionInvoice: idempotentno (@@unique ownerId+periodStart),
// tolerantna poizvedba gte/lt, P2002 → "duplicate". Razlika: premium lastniki
// PRVIJO poravnave (njihova provizija je 0, knjigovodstvo pa ostane); zajetje
// postavk je "VSE odprto do vključno periodEnd" (sweep starejših obdobij).
export async function issuePayoutSettlement(
  owner: OwnerPremiumFields
): Promise<SettlementResult> {
  const last = monthRange(-1);

  // Idempotenca: ena poravnava na obdobje (tolerantno gte/lt — isti vzorec
  // kot issueCommissionInvoice).
  const existing = await db.payoutSettlement.findFirst({
    where: {
      ownerId: owner.id,
      periodStart: { gte: last.start, lt: last.end },
    },
    select: { settlementNumber: true },
  });
  if (existing) {
    return { status: "duplicate", settlementNumber: existing.settlementNumber };
  }

  // Najprej vzpostavi evidenco do vključno poravnanega meseca (idempotentno;
  // zameta tudi pozneje plačane rezervacije starejših obdobij — njihove
  // postavke nato pobere sweep spodaj).
  await syncPayoutEntries(owner, { upTo: last.end });

  // Zajemi VSE odprte postavke do vključno poravnanega meseca.
  const entries = await db.payoutEntry.findMany({
    where: {
      ownerId: owner.id,
      status: "pending",
      periodEnd: { lte: last.end },
    },
    orderBy: { periodStart: "asc" },
    select: {
      id: true,
      grossAmount: true,
      commissionAmount: true,
      netAmount: true,
    },
  });
  if (entries.length === 0) {
    return { status: "no_entries" };
  }

  const grossTotal = round2(
    entries.reduce((acc, e) => acc + e.grossAmount, 0)
  );
  const commissionTotal = round2(
    entries.reduce((acc, e) => acc + e.commissionAmount, 0)
  );
  const netTotal = round2(entries.reduce((acc, e) => acc + e.netAmount, 0));

  // Create + vez postavk v ENI transakciji (atomarno). P2002 na
  // @@unique(ownerId, periodStart) → tolerantni "duplicate" (sočasna izdaja).
  let settlement: PayoutSettlement;
  try {
    settlement = await db.$transaction(async (tx) => {
      const s = await tx.payoutSettlement.create({
        data: {
          ownerId: owner.id,
          settlementNumber: settlementNumberFor(last.start),
          periodStart: last.start,
          periodEnd: last.end,
          entryCount: entries.length,
          grossTotal,
          commissionTotal,
          netTotal,
          status: "pending",
          method: "manual",
        },
      });
      await tx.payoutEntry.updateMany({
        where: { id: { in: entries.map((e) => e.id) }, status: "pending" },
        data: { settlementId: s.id },
      });
      return s;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const winner = await db.payoutSettlement.findFirst({
        where: {
          ownerId: owner.id,
          periodStart: { gte: last.start, lt: last.end },
        },
        select: { settlementNumber: true },
      });
      if (winner) {
        return {
          status: "duplicate",
          settlementNumber: winner.settlementNumber,
        };
      }
    }
    throw error;
  }

  await logAudit({
    actorId: owner.id,
    actorRole: "owner",
    action: "payout_settlement_generated",
    resourceType: "payout_settlement",
    resourceId: settlement.id,
    resourceName: settlement.settlementNumber,
    metadata: {
      period: `${last.start.toISOString()} — ${last.end.toISOString()}`,
      entryCount: entries.length,
      grossTotal,
      commissionTotal,
      netTotal,
      via: "lib",
    },
  });

  console.log(
    `[payout-ledger] Izdana ${settlement.settlementNumber} za ${owner.name}: ` +
      `${entries.length} postavk, bruto ${grossTotal} €, neto ${netTotal} €`
  );

  return { status: "issued", settlement };
}

export type SettleResult =
  | { status: "settled"; settlement: PayoutSettlement; entriesSettled: number }
  | { status: "not_found" }
  | { status: "already" };

// ============================================================================
// settlePayoutSettlement — potrditev uskladitve (knjigovodska, NE plačilo)
// ============================================================================
// Pogojni updateMany (anti-race, isti vzorec kot owner bookings PATCH):
// sočasna potrditev natanko ena uspe. Postavke poravnave se v ISTI transakciji
// prestavijo v "settled" — tudi pri že potrjeni poravnavi (samo-zdravljenje
// morebitne nekonsistentnosti). Za razliko od mark_paid provizijskih računov
// (P7-C3: dolžnik ne vodi prihodkov platforme) TU lastnik potrjuje SVOJO
// evidenco prihodkov — provizija kot obveznost ima ločen, lastno varovan
// CommissionInvoice.
export async function settlePayoutSettlement(
  ownerId: string,
  settlementId: string
): Promise<SettleResult> {
  const now = new Date();

  // Sekvencna transakcija: (1) pogojni prehod poravnave, (2) prestavitev
  // njenih odprtih postavk — vse ali nič.
  const [settlementUpdate, entriesUpdate] = await db.$transaction([
    db.payoutSettlement.updateMany({
      where: { id: settlementId, ownerId, status: "pending" },
      data: { status: "settled", settledAt: now },
    }),
    db.payoutEntry.updateMany({
      where: { settlementId, status: "pending" },
      data: { status: "settled", settledAt: now },
    }),
  ]);

  if (settlementUpdate.count === 0) {
    // Razloči: ne obstaja / ni lastnikovo (404) ali že potrjena (400)
    const existing = await db.payoutSettlement.findUnique({
      where: { id: settlementId },
      select: { ownerId: true, status: true },
    });
    if (!existing || existing.ownerId !== ownerId) {
      return { status: "not_found" };
    }
    if (existing.status === "settled") {
      return { status: "already" };
    }
    return { status: "not_found" };
  }

  const settlement = await db.payoutSettlement.findUnique({
    where: { id: settlementId },
  });
  if (!settlement) {
    return { status: "not_found" };
  }

  await logAudit({
    actorId: ownerId,
    actorRole: "owner",
    action: "payout_settlement_settled",
    resourceType: "payout_settlement",
    resourceId: settlement.id,
    resourceName: settlement.settlementNumber,
    metadata: {
      entryCount: settlement.entryCount,
      netTotal: settlement.netTotal,
      entriesSettled: entriesUpdate.count,
      via: "lib",
    },
  });

  return { status: "settled", settlement, entriesSettled: entriesUpdate.count };
}

/** Skupne zneske seznama postavk (helper za agregate/teste). */
export function sumPayoutEntries(entries: PayoutEntry[]) {
  return {
    entryCount: entries.length,
    grossTotal: round2(entries.reduce((acc, e) => acc + e.grossAmount, 0)),
    commissionTotal: round2(
      entries.reduce((acc, e) => acc + e.commissionAmount, 0)
    ),
    netTotal: round2(entries.reduce((acc, e) => acc + e.netAmount, 0)),
  };
}
