import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import {
  isValidMonthKey,
  monthDayKeys,
  resolveDayPolicy,
  CAPACITY_NON_OCCUPYING_STATUSES,
  toDayKey,
  type AvailabilitySettings,
  type AvailabilityDayOverride,
} from "@/lib/experience-availability";

/**
 * GET /api/experiences/[slug]/availability?month=YYYY-MM
 *
 * TASK 33 (Tier 2 #1): JAVNI mesečni pogled koledarja razpoložljivosti
 * izkušnje (gostovska stran — experience-modal ga pokliče ob izbiri datuma).
 *
 * [slug] sprejme SLUG ALI ID izkušnje (modal ima pri roki id; javna stran
 * slug — iskreni poskus obeh, ena poizvedba dodatno samo ob zgrešku).
 *
 * Varnost/iskrenost:
 *  - samo OBJAVLJENE izkušnje (pending/rejected → enoten 404, brez
 *    razkrivanja moderacijskega stanja — isti vzorec kot /api/experiences/[slug]);
 *  - NOTE (razlog zaprtja dneva) se JAVNO ne razkriva — lastniški podatek
 *    (javno je samo, da dan ni na voljo);
 *  - month brez parametra = tekoči mesec; validacija YYYY-MM (sicer 400).
 *
 * Odgovor: { month, seasonStart, seasonEnd, defaultCapacity, days: [...] }
 * — days pokriva VSE dneve meseca (past flag za pretekle), remaining je
 * null pri neomejeni kapaciteti.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const limited = rateLimit(request, {
      limit: 120,
      windowMs: 60_000,
      key: "experience-availability",
    });
    if (limited) return limited;

    const { slug } = await params;
    if (!slug) {
      return NextResponse.json(
        { error: "Manjka identifikator izkušnje" },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const monthParam = url.searchParams.get("month");

    // Tekoči mesec (UTC) kot privzet — modal vedno pošlje month izbrane datume
    let month = toDayKey(new Date()).slice(0, 7);
    if (monthParam !== null) {
      if (!isValidMonthKey(monthParam)) {
        return NextResponse.json(
          { error: "Neveljaven parameter month (pričakovan zapis YYYY-MM)" },
          { status: 400 }
        );
      }
      month = monthParam;
    }

    // Slug ALI id (enoten javni 404 za neobstoječe/neobjavljene)
    const experience =
      (await db.experience.findUnique({ where: { slug } })) ??
      (await db.experience.findUnique({ where: { id: slug } }));
    if (!experience || experience.status !== "published") {
      return NextResponse.json(
        { error: "Izkušnja ni najdena" },
        { status: 404 }
      );
    }

    // Obseg meseca (UTC)
    const [yearStr, monthStr] = month.split("-");
    const year = Number(yearStr);
    const monthNum = Number(monthStr);
    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const monthEnd = new Date(Date.UTC(year, monthNum, 1));

    const days = monthDayKeys(month);

    const [settingsRow, dayRows, bookedRows] = await Promise.all([
      db.experienceAvailability.findUnique({
        where: { experienceId: experience.id },
      }),
      db.experienceAvailabilityDay.findMany({
        where: { experienceId: experience.id, date: { in: days } },
      }),
      db.booking.groupBy({
        by: ["bookingDate"],
        where: {
          experienceId: experience.id,
          bookingDate: { gte: monthStart, lt: monthEnd },
          status: { notIn: [...CAPACITY_NON_OCCUPYING_STATUSES] },
        },
        _sum: { groupSize: true },
      }),
    ]);

    const settings: AvailabilitySettings | null = settingsRow
      ? {
          defaultCapacity: settingsRow.defaultCapacity,
          seasonStart: settingsRow.seasonStart,
          seasonEnd: settingsRow.seasonEnd,
        }
      : null;

    const overridesByDate = new Map<string, AvailabilityDayOverride>(
      dayRows.map((row) => [
        row.date,
        {
          date: row.date,
          status: row.status === "closed" ? "closed" : "open",
          capacity: row.capacity,
        },
      ])
    );

    const bookedByDate = new Map<string, number>(
      bookedRows.map((row) => [
        toDayKey(row.bookingDate),
        row._sum.groupSize ?? 0,
      ])
    );

    const todayKey = toDayKey(new Date());

    const dayViews = days.map((date) => {
      const policy = resolveDayPolicy({
        dateKey: date,
        settings,
        dayOverride: overridesByDate.get(date) ?? null,
      });
      const booked = bookedByDate.get(date) ?? 0;
      const capacity =
        policy.kind === "open" ? policy.capacity : null;
      const remaining =
        capacity !== null ? Math.max(0, capacity - booked) : null;
      return {
        date,
        past: date < todayKey,
        // "unrestricted"/"open" = na voljo; "closed" = zavrnjeno
        available: policy.kind !== "closed",
        reason: policy.kind === "closed" ? policy.reason : null,
        capacity,
        booked,
        remaining,
      };
    });

    return NextResponse.json({
      month,
      experienceId: experience.id,
      seasonStart: settings?.seasonStart ?? null,
      seasonEnd: settings?.seasonEnd ?? null,
      defaultCapacity: settings?.defaultCapacity ?? null,
      days: dayViews,
    });
  } catch (error) {
    console.error("[experiences/availability] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju razpoložljivosti" },
      { status: 500 }
    );
  }
}
