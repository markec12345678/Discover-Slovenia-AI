/**
 * TASK 33 (Tier 2 #1, 1.110.0) — KOLEDAR RAZPOLOŽLJIVOSTI IZKUŠNJE:
 * domena, en vir resnice.
 *
 * Mandat docs/COMPETITIVE-ANALYSIS.md (C1 / priporočilo #3): "vsaj
 * kapaciteta/dan + blackout datumi (prepreči overbooking)". Slovar:
 *   - KAPACITETA/DAN  — največja vsota groupSize rezervacij enega dne;
 *   - BLACKOUT        — dan, ki je izrecno ZAPRT (praznik, vzdrževanje,
 *                       zasebni dogodek …);
 *   - SEZONA          — okvo delovanja (npr. 15.6.–30.9.; čezletna sezona
 *                       15.11.→15.3. je dovoljena: start > end).
 *
 * ISKRENA SEMANTIKA (testno varovana v task33-experience-availability):
 *   1. Brez vrstice v ExperienceAvailability in brez dnevnih prepisov je
 *      dan NEOMEJEN (dormant — obstoječe obnašanje tržnice se ne spremeni).
 *   2. Day "closed" vedno ZAVRNE (blackout ima prednost pred vsem).
 *   3. Day "open" je IZJEMNI DAN: prepiše sezono; kapaceta =
 *      day.capacity ?? settings.defaultCapacity ?? null (neomejeno).
 *   4. Izven sezone (brez prepisa) → ZAVRNE ("out-of-season").
 *   5. Zasedenost = Σ groupSize rezervacij dneva s statusom ≠ "cancelled"
 *      (preklic sprosti mesto; pending/confirmed/completed GAJO).
 *
 * Datumi so kanonski nizi "YYYY-MM-DD" (UTC-dan). Date objekti iz
 * Booking.bookingDate se pretvorijo prek toDayKey() (UTC komponente!) —
 * rezervacije iz obrazca pošiljajo "YYYY-MM-DD", ki se razčleni kot UTC
 * polnoč, zato je pretvorba enolična.
 */

import type { PrismaClient } from "@prisma/client";

// ── Tipi (strukturni — primerni tudi za JSON odgovore API-jev) ─────────────

/** Status dnevnega prepisa (ExperienceAvailabilityDay.status). */
export type AvailabilityDayStatus = "open" | "closed";

export const AVAILABILITY_DAY_STATUSES: readonly AvailabilityDayStatus[] = [
  "open",
  "closed",
];

/**
 * Statusi rezervacije, ki ZASEDAJO kapaciteto dneva. Vse razen "cancelled":
 * preklicana rezervacija sprosti mesto (gost odjavljen), pending (Stripe
 * checkout v teku) in completed (opravljena) pa ga držita.
 */
export const CAPACITY_NON_OCCUPYING_STATUSES: readonly string[] = ["cancelled"];

/** Nastavitve razpoložljivosti izkušnje (ExperienceAvailability vrstnica). */
export interface AvailabilitySettings {
  defaultCapacity: number | null;
  seasonStart: string | null;
  seasonEnd: string | null;
}

/** Dnevni prepis (ExperienceAvailabilityDay vrstnica). */
export interface AvailabilityDayOverride {
  date: string;
  status: AvailabilityDayStatus;
  capacity: number | null;
  note?: string | null;
}

/**
 * Odločitev za en dan. "unrestricted" = koledar ne omejuje (dormant);
 * "closed" = zavrnjena rezervacija (razlog za iskreno sporočilo);
 * "open" = dovoljena, capacity null = neomejeno.
 */
export type DayPolicy =
  | { kind: "unrestricted" }
  | { kind: "open"; capacity: number | null }
  | { kind: "closed"; reason: "blackout" | "out-of-season" };

// ── Veljavnost datumov (STROGA: pravi koledarski dnevi, ne samo regex) ─────

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY_RE = /^(\d{4})-(\d{2})$/;

/** Veljaven koledarski dan "YYYY-MM-DD" (2026-02-30 ZAVRNE, 2028-02-29 NE). */
export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DATE_KEY_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/** Veljaven ključ meseca "YYYY-MM" (01–12). */
export function isValidMonthKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = MONTH_KEY_RE.exec(value);
  if (!m) return false;
  const month = Number(m[2]);
  return month >= 1 && month <= 12;
}

/** Pretvori Date v kanonski ključ dneva (UTC komponente — enolično). */
export function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ── Sezona ─────────────────────────────────────────────────────────────────

/**
 * Ali dan leži v sezonskem oknu (vključno). ČEZLETNA sezona (start > end,
 * npr. 15.11. → 15.3.) pokriva dneve ≥ start ALI ≤ end. Null meja = brez
 * omejitve na tej strani.
 */
export function isWithinSeason(
  dateKey: string,
  seasonStart: string | null,
  seasonEnd: string | null
): boolean {
  if (seasonStart === null && seasonEnd === null) return true;
  if (seasonStart !== null && seasonEnd !== null) {
    if (seasonStart <= seasonEnd) {
      return dateKey >= seasonStart && dateKey <= seasonEnd;
    }
    // Čezletna sezona (zimska): dec/jan/feb span
    return dateKey >= seasonStart || dateKey <= seasonEnd;
  }
  if (seasonStart !== null) return dateKey >= seasonStart;
  // Sem pride samo, če je seasonStart null (obe null sta že zgoraj vrnili
  // true) — seasonEnd je torej ne-null, a ga TS sam ne izpelje.
  return seasonEnd === null || dateKey <= seasonEnd;
}

// ── En vir resnice: odločitev za dan ───────────────────────────────────────

/**
 * Odloči politiko dneva iz nastavitev + dnevnega prepisa.
 * Vrstni red (dokumentiran v glavi datoteke): blackout > izjemni dan >
 * sezona > privzeto.
 */
export function resolveDayPolicy(input: {
  dateKey: string;
  settings: AvailabilitySettings | null;
  dayOverride: AvailabilityDayOverride | null;
}): DayPolicy {
  const { dateKey, settings, dayOverride } = input;

  // 1. Blackout ima NADPISANO prednost (izrecna lastnikova odločitev)
  if (dayOverride && dayOverride.status === "closed") {
    return { kind: "closed", reason: "blackout" };
  }

  // 2. Izjemni dan ("open" prepis) prepiše sezono — lastnik je dan izrecno
  //    odprl (npr. en majski vikend zunaj poletne sezone).
  if (dayOverride && dayOverride.status === "open") {
    return {
      kind: "open",
      capacity:
        dayOverride.capacity !== null
          ? dayOverride.capacity
          : (settings?.defaultCapacity ?? null),
    };
  }

  // 3. Nastavitve + sezona
  if (settings) {
    if (
      !isWithinSeason(
        dateKey,
        settings.seasonStart,
        settings.seasonEnd
      )
    ) {
      return { kind: "closed", reason: "out-of-season" };
    }
    return { kind: "open", capacity: settings.defaultCapacity };
  }

  // 4. Dormant: brez nastavitev in brez prepisov → neomejeno
  return { kind: "unrestricted" };
}

// ── Kapaciteta ─────────────────────────────────────────────────────────────

/**
 * Ali skupna zasedenost dneva + nova skupina presega kapaciteto.
 * capacity null = neomejeno (vedno dovoljeno); meja je VKLJUČNA
 * (booked + groupSize === capacity še gre skozi — zadnje mesto).
 */
export function capacitySufficient(input: {
  capacity: number | null;
  booked: number;
  groupSize: number;
}): boolean {
  const { capacity, booked, groupSize } = input;
  if (capacity === null) return true;
  return booked + groupSize <= capacity;
}

// ── Razorširjanje obsegov (lastnikov orodji "zapri obseg") ─────────────────

/** Največje število dni, ki jih ena bulk operacija sme ustvariti (varovalka). */
export const MAX_RANGE_DAYS = 366;

/**
 * Razširi obseg [from, to] (vključno) na kanonske ključe dni.
 * Vrne null, če je obseg obrnjen (from > to) ali daljši od MAX_RANGE_DAYS.
 */
export function expandDateRange(
  from: string,
  to: string,
  maxDays: number = MAX_RANGE_DAYS
): string[] | null {
  if (!isValidDateKey(from) || !isValidDateKey(to)) return null;
  if (from > to) return null;
  const keys: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    keys.push(toDayKey(cursor));
    if (keys.length > maxDays) return null;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

/** Vsi ključi dni meseca "YYYY-MM" (1. … 28/29/30/31). */
export function monthDayKeys(monthKey: string): string[] {
  if (!isValidMonthKey(monthKey)) return [];
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const keys: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    keys.push(
      `${monthKey}-${String(day).padStart(2, "0")}`
    );
  }
  return keys;
}

// ── Zasedenost iz baze (transakcijska preverba v POST /api/bookings) ───────

/** Strukturalni tip transakcijskega klienta (Prisma tx ali db). */
type DbLike = Pick<
  PrismaClient,
  "experienceAvailability" | "experienceAvailabilityDay" | "booking"
>;

/**
 * Preveri razpoložljivost dneva ZNOTRAJ transakcije in vrni odločitev.
 * Uporablja se v POST /api/bookings (SERIALIZABLE) — atomarna preprečitev
 * overbookinga: dva sočasna requesta vidita isto vsoto.
 *
 * dayStart/dayEnd okvir zajame VSE rezervacije dneva (tudi tiste s časovnim
 * delom — klient lahko pošlje "2026-07-12T22:00", kapaciteta se šteje po
 * koledarskem dnevu UTC).
 */
export async function checkDayAvailability(input: {
  db: DbLike;
  experienceId: string;
  dayKey: string;
}): Promise<{ policy: DayPolicy; booked: number }> {
  const { db, experienceId, dayKey } = input;
  if (!isValidDateKey(dayKey)) {
    return { policy: { kind: "unrestricted" }, booked: 0 };
  }

  const dayStart = new Date(`${dayKey}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);

  const [settingsRow, dayRow, bookedAgg] = await Promise.all([
    db.experienceAvailability.findUnique({
      where: { experienceId },
    }),
    db.experienceAvailabilityDay.findUnique({
      where: { experienceId_date: { experienceId, date: dayKey } },
    }),
    db.booking.aggregate({
      _sum: { groupSize: true },
      where: {
        experienceId,
        bookingDate: { gte: dayStart, lt: dayEnd },
        status: { notIn: [...CAPACITY_NON_OCCUPYING_STATUSES] },
      },
    }),
  ]);

  const settings: AvailabilitySettings | null = settingsRow
    ? {
        defaultCapacity: settingsRow.defaultCapacity,
        seasonStart: settingsRow.seasonStart,
        seasonEnd: settingsRow.seasonEnd,
      }
    : null;

  const dayOverride: AvailabilityDayOverride | null = dayRow
    ? {
        date: dayRow.date,
        status:
          dayRow.status === "closed" ? "closed" : "open",
        capacity: dayRow.capacity,
        note: dayRow.note,
      }
    : null;

  return {
    policy: resolveDayPolicy({ dateKey: dayKey, settings, dayOverride }),
    booked: bookedAgg._sum.groupSize ?? 0,
  };
}

/** Iskrena slovenska sporočila zavrnitve (POST /api/bookings 409). */
export function refusalMessage(policy: DayPolicy, booked: number): string {
  if (policy.kind === "closed") {
    if (policy.reason === "blackout") {
      return "Izbrani datum ni na voljo — ponudnik je dan zaprl. Izberite drug datum.";
    }
    return "Izbrani datum je izven sezone ponudnika. Izberite datum znotraj sezone.";
  }
  if (policy.kind === "open" && policy.capacity !== null) {
    return `Ta datum je zaseden (kapaciteta ${policy.capacity} oseb na dan je dosežena${booked > 0 ? `, zasedenih ${booked}` : ""}). Izberite drug datum ali manj oseb.`;
  }
  return "Ta datum ni na voljo. Izberite drug datum.";
}
