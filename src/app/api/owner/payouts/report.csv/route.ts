import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// /api/owner/payouts/report.csv — RAČUNOVODSKO POROČILO poravnave (TASK 34)
// ============================================================================
// GET ?settlementId=… → CSV (znak ;, UTF-8 z BOM za Excel, decimalka vejica)
// vseh postavk poravnave + skupne vrstice. Lastniško + session-gated (isti
// kanon kot ostale owner rute). Binarni/tekstovni odziv po vzorcu
// /api/owner/commissions/invoice-pdf (Cache-Control: no-store, attachment).
//
// Datum je v ISO obliki YYYY-MM-DD (računovodsko nedvoumno; po LJ stenski uri
// — enaka cona kot mesečne meje ledgerja).

const LJ_TZ = "Europe/Ljubljana";

/** CSV celica: narekovaje pobegne (; " \n → "…" s podvojenimi ""). */
function csvCell(value: string): string {
  if (/[;"\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Število z dvema decimalkama in vejico (sl-SI računovodstvo, brez ločil tisočic). */
function csvAmount(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

/** Datum rezervacije kot YYYY-MM-DD po LJ stenski uri (en-CA = ISO format). */
function csvDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LJ_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export async function GET(request: Request) {
  // ISSUE #4 §24 (VAL 8, P3): session-gated owner API brez abuse-meje —
  // skupni bucket "owner-api" (vzorec requireAdmin "admin-any").
  const limited = rateLimit(request, {
    limit: 120,
    windowMs: 60_000,
    key: "owner-api",
  });
  if (limited) return limited;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.accountType === "user") {
      return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
    }

    const owner = await db.owner.findUnique({
      where: { email: session.user.email },
      select: { id: true, name: true, businessName: true },
    });
    if (!owner) {
      return NextResponse.json({ error: "Lastnik ni najden" }, { status: 404 });
    }

    const settlementId = new URL(request.url).searchParams.get("settlementId");
    if (!settlementId) {
      return NextResponse.json(
        { error: "Manjka settlementId" },
        { status: 400 }
      );
    }

    const settlement = await db.payoutSettlement.findUnique({
      where: { id: settlementId },
    });
    if (!settlement || settlement.ownerId !== owner.id) {
      return NextResponse.json(
        { error: "Poravnava ni najdena ali nimate dovoljenja" },
        { status: 404 }
      );
    }

    const entries = await db.payoutEntry.findMany({
      where: { settlementId: settlement.id },
      orderBy: { periodStart: "asc" },
    });

    // Obdobje po LJ stenski uri (periodEnd je ekskluziven → zadnji dan −1 ms)
    const dayFmt = new Intl.DateTimeFormat("sl-SI", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: LJ_TZ,
    });
    const periodLabel = `${dayFmt.format(settlement.periodStart)} – ${dayFmt.format(
      new Date(settlement.periodEnd.getTime() - 1)
    )}`;
    const statusLabel = settlement.status === "settled" ? "potrjena" : "odprta";

    const rows: string[] = [];
    rows.push(["Poravnava", settlement.settlementNumber].map(csvCell).join(";"));
    rows.push(["Obdobje", periodLabel].map(csvCell).join(";"));
    rows.push(["Stanje", statusLabel].map(csvCell).join(";"));
    rows.push(["Lastnik", owner.businessName || owner.name].map(csvCell).join(";"));
    rows.push("");
    rows.push(
      [
        "Datum rezervacije",
        "Številka",
        "Izkušnja",
        "Osebe",
        "Vir",
        "Bruto (EUR)",
        "Stopnja",
        "Provizija (EUR)",
        "Neto (EUR)",
      ]
        .map(csvCell)
        .join(";")
    );
    for (const e of entries) {
      rows.push(
        [
          csvDate(e.bookingDate),
          e.bookingNumber,
          e.experienceName,
          String(e.groupSize),
          e.source === "consultation" ? "AI konzultacija" : "Direktna rezervacija",
          csvAmount(e.grossAmount),
          csvAmount(e.rate),
          csvAmount(e.commissionAmount),
          csvAmount(e.netAmount),
        ]
          .map(csvCell)
          .join(";")
      );
    }
    rows.push("");
    rows.push(
      [
        "Skupaj",
        "",
        "",
        String(settlement.entryCount),
        "",
        csvAmount(settlement.grossTotal),
        "",
        csvAmount(settlement.commissionTotal),
        csvAmount(settlement.netTotal),
      ]
        .map(csvCell)
        .join(";")
    );

    // BOM (\uFEFF) → Excel prepozna UTF-8 (isti vzorec kot admin CSV izvoz).
    const csv = `\uFEFF${rows.join("\r\n")}\r\n`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${settlement.settlementNumber}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[owner/payouts/report.csv GET] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri izdelavi poročila" },
      { status: 500 }
    );
  }
}
