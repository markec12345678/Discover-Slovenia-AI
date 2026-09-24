import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { communityTripGate } from "@/lib/trip-permissions";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";

// ============================================================================
// TRIP EXPENSES — ISSUE #4 §14 (val 3): uporabnikovi stroški na poti
// ============================================================================
// Vedrici "booked" (rezervirano — zavezujoče) in "paid" (plačano). Zneski so
// USER-asserted EUR — sodba TRIP-DOMAIN-MAP (ocena ≠ strošek) drži: ocene
// živijo v načrtu (SavedItinerary JSON), DENAR živi tukaj (diary vzorec:
// shareId + avtor clientId iz localStorage).
//
// Kontrakt (konsumira ga TripBudgetCard):
//   GET    /api/trip/[shareId]/expenses?clientId=yyy
//          → { expenses: [{ id, dayIndex, label, amountEur, kind,
//                          authorName, createdAt, isAuthor }] }
//   POST   body { label, amountEur, kind, dayIndex?, authorName?, clientId }
//          → { success: true, expense }   (max 200/pot, max 50/avtor)
//   DELETE body { expenseId, clientId }
//          → { success: true }            (samo avtor; OWNER vidi vse)
//
// Vrata: javna pot = vsak obiskovalec (kot komentarji/dnevnik — skupnostna
// plast); zasebna pot → branje ≥ VIEWER, pisanje ≥ COMMENTER.
// ISKRENOST: znesek > 0 ≤ 100_000 EUR; kind SAMO "booked" | "paid";
// nič se ne sešteje tukaj — vsote računa lib/trip-budget.ts (agregator).
// ============================================================================

const HOUR_MS = 60 * 60_000;

const SHARE_ID_RE = /^[a-z0-9]{1,32}$/;
const CLIENT_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;
const EXPENSE_ID_RE = /^[a-zA-Z0-9]{20,40}$/;

const LABEL_MIN = 2;
const LABEL_MAX = 120;
const AUTHOR_NAME_MAX = 60;
const DAY_INDEX_MIN = 0;
const DAY_INDEX_MAX = 30;
const AMOUNT_MIN = 0.01;
const AMOUNT_MAX = 100_000;

/** Zgornji meji (preprečuje smeti — isti razred kot diary). */
const EXPENSES_MAX = 200;
const AUTHOR_EXPENSES_MAX = 50;

export interface ExpenseDTO {
  id: string;
  dayIndex: number | null;
  label: string;
  amountEur: number;
  kind: string;
  authorName: string | null;
  createdAt: string;
  isAuthor: boolean;
}

function err(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: 60_000,
    key: "trip-expenses",
  });
  if (limited) return limited;

  const { shareId } = await params;
  if (!SHARE_ID_RE.test(shareId)) {
    return err(400, "Neveljaven ID poti");
  }

  const { searchParams } = new URL(request.url);
  const clientId = (searchParams.get("clientId") ?? "").trim();

  // Zasebna pot → branje zahteva ≥ VIEWER.
  const savedAccess = await db.savedItinerary.findUnique({
    where: { shareId },
    select: { isPublic: true },
  });
  if (!savedAccess) return err(404, "Potovanje ne obstaja");
  if (!savedAccess.isPublic) {
    const gate = await communityTripGate(shareId, "read");
    if (gate) return gate;
  }

  const rows = await db.tripExpense.findMany({
    where: { shareId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const expenses: ExpenseDTO[] = rows.map((r) => ({
    id: r.id,
    dayIndex: r.dayIndex,
    label: r.label,
    amountEur: r.amountEur,
    kind: r.kind,
    authorName: r.authorName,
    createdAt: r.createdAt.toISOString(),
    isAuthor:
      CLIENT_ID_RE.test(clientId) &&
      r.authorClientId != null &&
      r.authorClientId === clientId,
  }));

  return NextResponse.json({ expenses });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: 60_000,
    key: "trip-expenses-write",
  });
  if (limited) return limited;

  const { shareId } = await params;
  if (!SHARE_ID_RE.test(shareId)) {
    return err(400, "Neveljaven ID poti");
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return err(400, "Neveljaven JSON");
  }

  const label =
    typeof body.label === "string" ? body.label.trim().replace(/\s+/g, " ") : "";
  const amountEur = typeof body.amountEur === "number" ? body.amountEur : NaN;
  const kind = typeof body.kind === "string" ? body.kind : "";
  const dayIndex =
    typeof body.dayIndex === "number" && Number.isInteger(body.dayIndex)
      ? body.dayIndex
      : null;
  const authorName =
    typeof body.authorName === "string"
      ? body.authorName.trim().replace(/\s+/g, " ").slice(0, AUTHOR_NAME_MAX)
      : null;
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";

  if (label.length < LABEL_MIN || label.length > LABEL_MAX) {
    return err(400, `Oznaka stroška: ${LABEL_MIN}–${LABEL_MAX} znakov`);
  }
  if (!Number.isFinite(amountEur) || amountEur < AMOUNT_MIN || amountEur > AMOUNT_MAX) {
    return err(400, `Znesek: ${AMOUNT_MIN}–${AMOUNT_MAX} EUR`);
  }
  if (kind !== "booked" && kind !== "paid") {
    return err(400, "Vrsta stroška: booked (rezervirano) ali paid (plačano)");
  }
  if (dayIndex != null && (dayIndex < DAY_INDEX_MIN || dayIndex > DAY_INDEX_MAX)) {
    return err(400, "Dan poti je izven obsega");
  }
  if (!CLIENT_ID_RE.test(clientId)) {
    return err(400, "Manjka/nezveljaven clientId");
  }

  const savedAccess = await db.savedItinerary.findUnique({
    where: { shareId },
    select: { isPublic: true },
  });
  if (!savedAccess) return err(404, "Potovanje ne obstaja");
  // Zasebna pot → zapis zahteva ≥ COMMENTER (skupnostna plast, kot diary).
  if (!savedAccess.isPublic) {
    const gate = await communityTripGate(shareId, "comment");
    if (gate) return gate;
  }

  // Meji smeti (isti razred kot diary).
  const [total, byAuthor] = await Promise.all([
    db.tripExpense.count({ where: { shareId } }),
    db.tripExpense.count({ where: { shareId, authorClientId: clientId } }),
  ]);
  if (total >= EXPENSES_MAX) {
    return err(409, "Dosežena zgornja meja stroškov na potovanje");
  }
  if (byAuthor >= AUTHOR_EXPENSES_MAX) {
    return err(409, "Dosežena zgornja meja stroškov enega avtorja");
  }

  const expense = await db.tripExpense.create({
    data: {
      shareId,
      dayIndex,
      label,
      amountEur: Math.round(amountEur * 100) / 100,
      kind,
      authorName,
      authorClientId: clientId,
    },
  });

  void logAudit({
    actorRole: "user",
    action: AUDIT_ACTIONS.TRIP_EXPENSE_ADDED,
    resourceType: "trip_expense",
    resourceId: shareId,
    metadata: { kind, amountEur, dayIndex },
  });

  return NextResponse.json(
    {
      success: true,
      expense: {
        id: expense.id,
        dayIndex: expense.dayIndex,
        label: expense.label,
        amountEur: expense.amountEur,
        kind: expense.kind,
        authorName: expense.authorName,
        createdAt: expense.createdAt.toISOString(),
        isAuthor: true,
      },
    },
    { status: 201 }
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: 60_000,
    key: "trip-expenses-write",
  });
  if (limited) return limited;

  const { shareId } = await params;
  if (!SHARE_ID_RE.test(shareId)) {
    return err(400, "Neveljaven ID poti");
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return err(400, "Neveljaven JSON");
  }

  const expenseId =
    typeof body.expenseId === "string" ? body.expenseId.trim() : "";
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";

  if (!EXPENSE_ID_RE.test(expenseId)) {
    return err(400, "Neveljaven ID stroška");
  }
  if (!CLIENT_ID_RE.test(clientId)) {
    return err(400, "Manjka/nezveljaven clientId");
  }

  const savedAccess = await db.savedItinerary.findUnique({
    where: { shareId },
    select: { isPublic: true },
  });
  if (!savedAccess) return err(404, "Potovanje ne obstaja");
  if (!savedAccess.isPublic) {
    const gate = await communityTripGate(shareId, "comment");
    if (gate) return gate;
  }

  const existing = await db.tripExpense.findUnique({
    where: { id: expenseId },
    select: { id: true, shareId: true, authorClientId: true, kind: true },
  });
  if (!existing || existing.shareId !== shareId) {
    return err(404, "Strošek ni najden");
  }
  // SAMO avtor (lastnik poti glede §13 nima vzorca "briše tuje stroške" —
  // to so osebni zapisi uporabnikov, enako kot diary).
  if (existing.authorClientId !== clientId) {
    return err(403, "Strošek lahko izbriše samo avtor");
  }

  await db.tripExpense.delete({ where: { id: expenseId } });

  void logAudit({
    actorRole: "user",
    action: AUDIT_ACTIONS.TRIP_EXPENSE_REMOVED,
    resourceType: "trip_expense",
    resourceId: shareId,
    metadata: { expenseId, kind: existing.kind },
  });

  return NextResponse.json({ success: true });
}
