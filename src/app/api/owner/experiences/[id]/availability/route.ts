import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  isValidDateKey,
  isValidMonthKey,
  monthDayKeys,
  resolveDayPolicy,
  CAPACITY_NON_OCCUPYING_STATUSES,
  toDayKey,
  type AvailabilitySettings,
  type AvailabilityDayOverride,
} from "@/lib/experience-availability";

/**
 * TASK 33 (Tier 2 #1): LASTNIŠKI koledar razpoložljivosti izkušnje.
 *
 * GET  /api/owner/experiences/[id]/availability?month=YYYY-MM
 *      — mesečni pogled Z lastniškimi podrobnostmi (note, kapaciteta,
 *        zasedenost) za urejevalnik koledarja;
 * PUT  /api/owner/experiences/[id]/availability
 *      — nastavitve: { defaultCapacity?, seasonStart?, seasonEnd? }
 *        (explicit null POČISTI vrednost; izpuščeno polje pusti pri miru).
 *
 * Varnost: session-gated + lastništvo izkušnje (getOwnedExperience vzorec
 * iz [id]/route.ts), skupni rate limit bucket "owner-api". Vsaka sprememba
 * zapiše AuditLog (sledljivost).
 *
 * Validacija (iskrena, brez tihih popravkov):
 *  - defaultCapacity: null ali celo število 1–10 000;
 *  - seasonStart/End: null ali veljaven koledarski dan YYYY-MM-DD;
 *  - start > end JE DOVOLJEN = čezletna sezona (15.11. → 15.3., zimski
 *    ponudniki) — resolveDayPolicy jo podpira.
 */
interface RouteParams {
  params: Promise<{ id: string }>;
}

// Pomožna funkcija: preveri lastništvo izkušnje (vzorec iz [id]/route.ts)
async function getOwnedExperience(id: string, ownerId: string) {
  const experience = await db.experience.findUnique({ where: { id } });
  if (!experience) {
    return { error: "not-found" as const, experience: null };
  }
  if (experience.ownerId !== ownerId) {
    return { error: "forbidden" as const, experience: null };
  }
  return { error: null, experience };
}

export async function GET(request: Request, { params }: RouteParams) {
  // ISSUE #4 §24 (VAL 8, P3): skupni bucket "owner-api" (vzorec ostalih
  // owner rut).
  const limited = rateLimit(request, {
    limit: 120,
    windowMs: 60_000,
    key: "owner-api",
  });
  if (limited) return limited;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
  }

  const { id } = await params;
  const { error, experience } = await getOwnedExperience(id, session.user.id);
  if (error === "not-found") {
    return NextResponse.json({ error: "Izkušnja ni najdena" }, { status: 404 });
  }
  if (error === "forbidden") {
    return NextResponse.json(
      { error: "Nimate dostopa do te izkušnje" },
      { status: 403 }
    );
  }

  try {
    const url = new URL(request.url);
    const monthParam = url.searchParams.get("month");
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
        orderBy: { date: "asc" },
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
          note: row.note,
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
      const capacity = policy.kind === "open" ? policy.capacity : null;
      const remaining =
        capacity !== null ? Math.max(0, capacity - booked) : null;
      return {
        date,
        past: date < todayKey,
        available: policy.kind !== "closed",
        reason: policy.kind === "closed" ? policy.reason : null,
        capacity,
        booked,
        remaining,
        override: overridesByDate.get(date) ?? null,
      };
    });

    return NextResponse.json({
      month,
      settings: settingsRow
        ? {
            defaultCapacity: settingsRow.defaultCapacity,
            seasonStart: settingsRow.seasonStart,
            seasonEnd: settingsRow.seasonEnd,
          }
        : null,
      days: dayViews,
    });
  } catch (error) {
    console.error("[owner/availability] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju koledarja" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  const limited = rateLimit(request, {
    limit: 120,
    windowMs: 60_000,
    key: "owner-api",
  });
  if (limited) return limited;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
  }

  const { id } = await params;
  const { error, experience } = await getOwnedExperience(id, session.user.id);
  if (error === "not-found") {
    return NextResponse.json({ error: "Izkušnja ni najdena" }, { status: 404 });
  }
  if (error === "forbidden") {
    return NextResponse.json(
      { error: "Nimate dostopa do te izkušnje" },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      defaultCapacity?: unknown;
      seasonStart?: unknown;
      seasonEnd?: unknown;
    } | null;
    if (!body) {
      return NextResponse.json(
        { error: "Neveljaven JSON" },
        { status: 400 }
      );
    }

    // defaultCapacity: null (počisti/neomejeno) | celo število 1–10 000
    let defaultCapacity: number | null | undefined;
    if ("defaultCapacity" in body) {
      const raw = body.defaultCapacity;
      if (raw === null || raw === "") {
        defaultCapacity = null;
      } else {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1 || n > 10_000) {
          return NextResponse.json(
            {
              error:
                "Dnevna kapaciteta mora biti celo število med 1 in 10 000 (ali prazno = neomejeno).",
            },
            { status: 400 }
          );
        }
        defaultCapacity = n;
      }
    }

    // Sezona: null (počisti) | veljaven koledarski dan
    let seasonStart: string | null | undefined;
    if ("seasonStart" in body) {
      const raw = body.seasonStart;
      if (raw === null || raw === "") {
        seasonStart = null;
      } else if (isValidDateKey(raw)) {
        seasonStart = raw;
      } else {
        return NextResponse.json(
          { error: "seasonStart ni veljaven datum (YYYY-MM-DD)." },
          { status: 400 }
        );
      }
    }
    let seasonEnd: string | null | undefined;
    if ("seasonEnd" in body) {
      const raw = body.seasonEnd;
      if (raw === null || raw === "") {
        seasonEnd = null;
      } else if (isValidDateKey(raw)) {
        seasonEnd = raw;
      } else {
        return NextResponse.json(
          { error: "seasonEnd ni veljaven datum (YYYY-MM-DD)." },
          { status: 400 }
        );
      }
    }

    // Preberi trenutne vrednosti (za končni upsert)
    const existing = await db.experienceAvailability.findUnique({
      where: { experienceId: experience.id },
    });
    const nextDefaultCapacity =
      defaultCapacity !== undefined
        ? defaultCapacity
        : (existing?.defaultCapacity ?? null);
    const nextSeasonStart =
      seasonStart !== undefined
        ? seasonStart
        : (existing?.seasonStart ?? null);
    const nextSeasonEnd =
      seasonEnd !== undefined ? seasonEnd : (existing?.seasonEnd ?? null);

    // Vsi trije "prazni" = koledar NE omejuje več → pošteno izbriši vrstico
    // (dormant stanje, enako kot pred nastavitvami).
    if (
      nextDefaultCapacity === null &&
      nextSeasonStart === null &&
      nextSeasonEnd === null
    ) {
      if (existing) {
        await db.$transaction([
          db.experienceAvailability.delete({
            where: { experienceId: experience.id },
          }),
          db.auditLog.create({
            data: {
              actorRole: "owner",
              action: "availability_settings_cleared",
              resourceType: "experience",
              resourceId: experience.id,
              resourceName: experience.name,
              metadata: JSON.stringify({
                ownerId: session.user.id,
              }),
            },
          }),
        ]);
      }
      return NextResponse.json({
        success: true,
        settings: null,
        message: "Koledar razpoložljivosti je izklopljen (neomejeno).",
      });
    }

    const saved = await db.$transaction([
      db.experienceAvailability.upsert({
        where: { experienceId: experience.id },
        create: {
          experienceId: experience.id,
          defaultCapacity: nextDefaultCapacity,
          seasonStart: nextSeasonStart,
          seasonEnd: nextSeasonEnd,
        },
        update: {
          ...(defaultCapacity !== undefined && { defaultCapacity }),
          ...(seasonStart !== undefined && { seasonStart }),
          ...(seasonEnd !== undefined && { seasonEnd }),
        },
        // Prva nastavitev mora postaviti VSE (create veja zgoraj pokriva;
        // update veja spreminja le podana polja)
      }),
      db.auditLog.create({
        data: {
          actorRole: "owner",
          action: "availability_settings_updated",
          resourceType: "experience",
          resourceId: experience.id,
          resourceName: experience.name,
          metadata: JSON.stringify({
            ownerId: session.user.id,
            defaultCapacity: nextDefaultCapacity,
            seasonStart: nextSeasonStart,
            seasonEnd: nextSeasonEnd,
          }),
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      settings: {
        defaultCapacity: saved[0].defaultCapacity,
        seasonStart: saved[0].seasonStart,
        seasonEnd: saved[0].seasonEnd,
      },
      message: "Nastavitve koledarja so shranjene.",
    });
  } catch (error) {
    console.error("[owner/availability] PUT napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri shranjevanju nastavitev" },
      { status: 500 }
    );
  }
}
