import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";
import type { CommissionInvoice } from "@prisma/client";

// ============================================================================
// PROVIZIJSKI MODEL — deljena logika (Faza 4a API + Faza 4b cron)
// ============================================================================
// Kot pri Booking.com: turist plača polno ceno neposredno ponudniku, platforma
// pa ponudniku obračuna provizijo le za rezervacije iz AI kanala
// (Booking.source = "consultation"). Uporabniki:
//   - POST /api/owner/commissions (ročna izdaja v dashboardu)
//   - GET|POST /api/cron/commission-invoices (samodejna izdaja 1. v mesecu)

export const COMMISSION_RATE = 0.12; // 12 % — free partnerji
export const PREMIUM_PLANS = ["premium", "enterprise"];

export type OwnerPremiumFields = {
  id: string;
  name: string;
  plan: string;
  subscriptionStatus: string;
  subscriptionEndsAt: Date | null;
};

export function isPremiumOwner(owner: OwnerPremiumFields): boolean {
  if (!PREMIUM_PLANS.includes(owner.plan)) return false;
  if (owner.subscriptionStatus === "canceled") return false;
  // Pretekla naročnina ne šteje več (enak princip kot premiumUntil pri listingih)
  if (owner.subscriptionEndsAt && owner.subscriptionEndsAt.getTime() <= Date.now()) {
    return false;
  }
  return true;
}

// ─── Časovni pas obračuna: Europe/Ljubljana ─────────────────────────────
// FIX (revizija #8, P1): prej so bile meje meseca računane po KRAJEVNEM
// času procesa (`new Date(y, m, 1)`) — na Vercelu/Render (UTC) je bil 1.
// september 00:30 po Ljubljani še 31. avgust po UTC → rezervacija je padla
// v NAPAČEN obračunski mesec (12 % provizije, bookingCount, commissionBase,
// račun, dashboard, cron). Dokumentacija obljublja koledarski mesec po
// Ljubljani — sedaj ga koda dejansko zagotavlja (isti princip kot
// startOfTodayLjubljana v /api/ask-local in /api/consultations).
const LJ_TZ = "Europe/Ljubljana";

/** Stenska ura trenutka `ts` v pasu Europe/Ljubljana. */
function ljParts(ts: number): {
  y: number;
  m: number;
  d: number;
  h: number;
  min: number;
  s: number;
} {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: LJ_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    })
      .formatToParts(new Date(ts))
      .map((p) => [p.type, p.value])
  );
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour),
    min: Number(parts.minute),
    s: Number(parts.second),
  };
}

/**
 * UTC-trenutek lokalne polnoči (00:00 Europe/Ljubljana) na 1. dnevu
 * meseca `m0` (0-based) leta `y`. DST-varen: prehoda CET/CEST v Sloveniji
 * sta ob 02:00/03:00 po lokalni uri — lokalna polnoč VEDNO obstaja in
 * ima enoten zamik.
 */
function ljMonthStartUtc(y: number, m0: number): Date {
  // Kandidat: UTC-polnoč 1. dneva meseca; izmerimo dejanski zamik LJ
  // (stena tega trenutka je 01:00/02:00 po Ljubljani) in ga odštejemo.
  const guess = Date.UTC(y, m0, 1);
  const p = ljParts(guess);
  const wallAsUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  const offsetMs = wallAsUtc - guess; // +3_600_000 (CET) ali +7_200_000 (CEST)
  return new Date(guess - offsetMs);
}

// Koledarski mesec glede na Europe/Ljubljana (DST-varen — glej zgoraj).
// offset 0 = tekoči mesec, -1 = prejšnji mesec. periodEnd je EKSKLUZIVEN.
export function monthRange(offset: number): { start: Date; end: Date } {
  const now = ljParts(Date.now());
  const m0 = now.m - 1 + offset; // Date.UTC sam premakne leto čez 12/-1
  return {
    start: ljMonthStartUtc(now.y, m0),
    end: ljMonthStartUtc(now.y, m0 + 1),
  };
}

export const monthLabel = (d: Date) =>
  new Intl.DateTimeFormat("sl-SI", {
    month: "long",
    year: "numeric",
    timeZone: LJ_TZ, // revizija #8: oznaka meseca po LJ stenski uri
  }).format(d);

export function invoiceNumberFor(periodStart: Date): string {
  // Y/M iz stenske ure po Ljubljani (ne po času procesa — revizija #8)
  const p = ljParts(periodStart.getTime());
  const ym = `${p.y}${String(p.m).padStart(2, "0")}`;
  const suffix = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `INV-${ym}-${suffix}`;
}

export type IssueResult =
  | { status: "issued"; invoice: CommissionInvoice }
  | { status: "duplicate"; invoiceNumber: string }
  | { status: "no_bookings" }
  | { status: "premium" };

// ============================================================================
// issueCommissionInvoice — izda provizijski račun za PREJŠNJI koledarski mesec
// ============================================================================
// Idempotentno (unique ownerId+periodStart), stopnja se zapiše kot snapshot,
// znesek se izračuna strežno iz atribuiranih rezervacij. Tudi audit sled.
export async function issueCommissionInvoice(
  owner: OwnerPremiumFields
): Promise<IssueResult> {
  if (isPremiumOwner(owner)) {
    return { status: "premium" };
  }

  const last = monthRange(-1);

  // Idempotenca: en račun na obdobje. TOLERANTNA poizvedba (gte start,
  // lt end namesto točne enakosti): zgodovinski računi, izdani pred
  // LJ-popravkom (z UTC-polnočno mejo meseca), padejo V obdobje in se
  // še vedno prepoznajo kot duplikat — ni dvojne izdaje čez prelom.
  const existing = await db.commissionInvoice.findFirst({
    where: {
      ownerId: owner.id,
      periodStart: { gte: last.start, lt: last.end },
    },
    select: { invoiceNumber: true },
  });
  if (existing) {
    return { status: "duplicate", invoiceNumber: existing.invoiceNumber };
  }

  // Agregacija atribuiranih rezervacij v obdobju
  const experiences = await db.experience.findMany({
    where: { ownerId: owner.id },
    select: { id: true },
  });
  const experienceIds = experiences.map((e) => e.id);

  const agg = experienceIds.length
    ? await db.booking.aggregate({
        _count: true,
        _sum: { total: true },
        where: {
          source: "consultation",
          experienceId: { in: experienceIds },
          createdAt: { gte: last.start, lt: last.end },
          // P7-C3 (P1): preklicane rezervacije NE štejejo v provizijsko osnovo
          // (usklajeno z lastniškimi prihodki, ki štejejo samo confirmed/completed)
          status: { in: ["confirmed", "completed"] },
          // FW1 (audit R3 🔴 #1 — INVARIANT provizijske upravičenosti):
          // provizijsko upravičena rezervacija je IZKLJUČNO dejansko plačana
          // transakcija, ki ni preklicana/refundirana. Demo rezervacije so
          // vedno paymentStatus "unpaid" (glej /api/bookings) → anonimni
          // API obiskovalec NE MORE več ustvarjati provizijske obveznosti
          // ponudniku. "paid" nastavlja izključno Stripe webhook (future)
          // oz. nadzorovani demo seed (scripts/fix-wave1-backfill).
          paymentStatus: "paid",
        },
      })
    : { _count: 0, _sum: { total: null as number | null } };

  const bookingCount = agg._count;
  const commissionBase = agg._sum.total ?? 0;

  if (bookingCount === 0) {
    return { status: "no_bookings" };
  }

  const rate = COMMISSION_RATE; // snapshot ob izdaji
  const amount = Math.round(commissionBase * rate * 100) / 100;

  // P8 (🟠): findFirst → create je race-prone — sočasna izdaja (cron 1. v
  // mesecu + ročni "generate" v dashboardu) oba preglesta "še ni računa",
  // oba kreirata; @@unique([ownerId, periodStart]) drugega zavrne s P2002.
  // P2002 obravnavamo kot idempotenten rezultat "duplicate" (ne 500) —
  // enako semantiko ima že cron pot; s tem je pokrita tudi owner generate.
  let invoice: CommissionInvoice;
  try {
    invoice = await db.commissionInvoice.create({
      data: {
        ownerId: owner.id,
        invoiceNumber: invoiceNumberFor(last.start),
        periodStart: last.start,
        periodEnd: last.end,
        bookingCount,
        commissionBase,
        rate,
        amount,
        status: "issued",
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Tolerantno (isti razlog kot prva poizvedba): zmagovalec Race-a je
      // lahko zapisal staro (UTC) ali novo (LJ) mejo — prepoznamo obe.
      const existing = await db.commissionInvoice.findFirst({
        where: {
          ownerId: owner.id,
          periodStart: { gte: last.start, lt: last.end },
        },
        select: { invoiceNumber: true },
      });
      if (existing) {
        return {
          status: "duplicate",
          invoiceNumber: existing.invoiceNumber,
        };
      }
    }
    throw error;
  }

  await logAudit({
    actorId: owner.id,
    actorRole: "owner",
    action: AUDIT_ACTIONS.COMMISSION_INVOICE_ISSUED,
    resourceType: "commission_invoice",
    resourceId: invoice.id,
    resourceName: invoice.invoiceNumber,
    metadata: {
      period: `${last.start.toISOString()} — ${last.end.toISOString()}`,
      bookingCount,
      commissionBase,
      rate,
      amount,
      via: "lib",
    },
  });

  console.log(
    `[commissions] Izdan ${invoice.invoiceNumber} za ${owner.name}: ${bookingCount} rezervacij, ${amount} €`
  );

  return { status: "issued", invoice };
}
