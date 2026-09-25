import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  AVAILABILITY_DAY_STATUSES,
  expandDateRange,
  isValidDateKey,
  type AvailabilityDayStatus,
} from "@/lib/experience-availability";

/**
 * TASK 33 (Tier 2 #1): LASTNIŠKI dnevi koledarja (blackout / izjemni dan).
 *
 * POST   /api/owner/experiences/[id]/availability/days
 *        — prepis ENEGA dneva { date, status, capacity?, note? } ali
 *          OBSEGA { dateFrom, dateTo, status, note? } (orodje "zapri obseg":
 *          npr. zimski zaprti vikendi — max 366 dni na klic, varovalka).
 *          Upsert: ponovni klic istega dnega prepiše prepis.
 * DELETE /api/owner/experiences/[id]/availability/days?date=YYYY-MM-DD
 *        — ali ?dateFrom=&dateTo= — odstrani prepis(e); dan se vrne na
 *          privzeto vedenje (sezona/default kapaciteta).
 *
 * Varnost: session + lastništvo (vzorec [id]/route.ts), bucket "owner-api",
 * AuditLog za vsako operacijo. capacity velja SAMO za "open" dneve
 * (zaprtem dnevu kapaciteta nima pomena → zavrnjena, iskrena napaka).
 */
interface RouteParams {
  params: Promise<{ id: string }>;
}

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

export async function POST(request: Request, { params }: RouteParams) {
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
      date?: unknown;
      dateFrom?: unknown;
      dateTo?: unknown;
      status?: unknown;
      capacity?: unknown;
      note?: unknown;
    } | null;
    if (!body) {
      return NextResponse.json(
        { error: "Neveljaven JSON" },
        { status: 400 }
      );
    }

    // Status — edina obvezna vrednost, whitelist
    const statusRaw = String(body.status ?? "");
    if (!AVAILABILITY_DAY_STATUSES.includes(statusRaw as AvailabilityDayStatus)) {
      return NextResponse.json(
        { error: "status mora biti \"open\" ali \"closed\"." },
        { status: 400 }
      );
    }
    const status = statusRaw as AvailabilityDayStatus;

    // Kapaciteta (samo za open dneve; null = podeduje privzeto)
    let capacity: number | null = null;
    if ("capacity" in body && body.capacity !== null && body.capacity !== "") {
      const n = Number(body.capacity);
      if (!Number.isInteger(n) || n < 1 || n > 10_000) {
        return NextResponse.json(
          {
            error:
              "Kapaciteta dneva mora biti celo število med 1 in 10 000 (ali prazno = privzeta).",
          },
          { status: 400 }
        );
      }
      capacity = n;
    }
    if (status === "closed" && capacity !== null) {
      return NextResponse.json(
        {
          error:
            "Zaprt dan nima kapacitete — nastavite status \"open\" ali počistite kapaciteto.",
        },
        { status: 400 }
      );
    }

    const note =
      typeof body.note === "string" && body.note.trim()
        ? body.note.trim().slice(0, 200)
        : null;

    // Dnevi: en datum ALI obseg
    let dates: string[];
    if (body.date !== undefined && body.date !== null && body.date !== "") {
      if (!isValidDateKey(body.date)) {
        return NextResponse.json(
          { error: "date ni veljaven datum (YYYY-MM-DD)." },
          { status: 400 }
        );
      }
      dates = [body.date as string];
    } else if (
      body.dateFrom !== undefined &&
      body.dateTo !== undefined &&
      body.dateFrom !== null &&
      body.dateTo !== null
    ) {
      const expanded = expandDateRange(
        String(body.dateFrom),
        String(body.dateTo)
      );
      if (expanded === null) {
        return NextResponse.json(
          {
            error:
              "Obseg datumov ni veljaven (od ≤ do, vsak dan kot YYYY-MM-DD, največ 366 dni).",
          },
          { status: 400 }
        );
      }
      dates = expanded;
    } else {
      return NextResponse.json(
        { error: "Podajte date ali obseg dateFrom + dateTo." },
        { status: 400 }
      );
    }

    // Upsert vseh dni v eni transakciji + audit
    await db.$transaction([
      ...dates.map((date) =>
        db.experienceAvailabilityDay.upsert({
          where: {
            experienceId_date: { experienceId: experience.id, date },
          },
          create: {
            experienceId: experience.id,
            date,
            status,
            capacity: status === "open" ? capacity : null,
            note,
          },
          update: {
            status,
            capacity: status === "open" ? capacity : null,
            note,
          },
        })
      ),
      db.auditLog.create({
        data: {
          actorRole: "owner",
          action: "availability_day_upserted",
          resourceType: "experience",
          resourceId: experience.id,
          resourceName: experience.name,
          metadata: JSON.stringify({
            ownerId: session.user.id,
            status,
            capacity,
            note,
            datesCount: dates.length,
            firstDate: dates[0],
            lastDate: dates[dates.length - 1],
          }),
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      savedDays: dates.length,
      message:
        dates.length === 1
          ? status === "closed"
            ? "Dan je zaprt (blackout)."
            : "Dan je odprt s prepisom."
          : `${dates.length} dni ${status === "closed" ? "zaprto" : "odprto"}.`,
    });
  } catch (error) {
    console.error("[owner/availability/days] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri shranjevanju dni" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
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
    const date = url.searchParams.get("date");
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");

    let dates: string[];
    if (date) {
      if (!isValidDateKey(date)) {
        return NextResponse.json(
          { error: "date ni veljaven datum (YYYY-MM-DD)." },
          { status: 400 }
        );
      }
      dates = [date];
    } else if (dateFrom && dateTo) {
      const expanded = expandDateRange(dateFrom, dateTo);
      if (expanded === null) {
        return NextResponse.json(
          { error: "Obseg datumov ni veljaven (od ≤ do, največ 366 dni)." },
          { status: 400 }
        );
      }
      dates = expanded;
    } else {
      return NextResponse.json(
        { error: "Podajte date ali obseg dateFrom + dateTo." },
        { status: 400 }
      );
    }

    const removed = await db.experienceAvailabilityDay.deleteMany({
      where: {
        experienceId: experience.id,
        date: { in: dates },
      },
    });

    if (removed.count > 0) {
      await db.auditLog.create({
        data: {
          actorRole: "owner",
          action: "availability_day_deleted",
          resourceType: "experience",
          resourceId: experience.id,
          resourceName: experience.name,
          metadata: JSON.stringify({
            ownerId: session.user.id,
            removedCount: removed.count,
            firstDate: dates[0],
            lastDate: dates[dates.length - 1],
          }),
        },
      });
    }

    return NextResponse.json({
      success: true,
      removedDays: removed.count,
      message:
        removed.count === 0
          ? "Ni bilo prepisov za odstranitev."
          : `Odstranjenih prepisov: ${removed.count}.`,
    });
  } catch (error) {
    console.error("[owner/availability/days] DELETE napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri odstranjevanju dni" },
      { status: 500 }
    );
  }
}
