import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";
import { INVITE_TOKEN_RE } from "@/lib/trip-permissions";

// ============================================================================
// POST /api/trip/collaborators/accept — SPREJEM VABILA (ISSUE #4 §13)
// ============================================================================
// Zahteva prijavljen B2C račun ("user") — vloga na poti je vezana na
// RAČUN, ne na napravo (drugače kot anonimni glasovi/komentarji, ki so
// zavestno per-napraka).
//
// Semantika (iskrena):
//   - žeton PENDING + (brez e-pošte ALI ujemanje e-pošte računa) → sprejem;
//   - e-pošta vabila NE ustreza računu → 403 (povezava je bila za nekoga
//     drugega — NE pomagamo ugibati);
//   - žeton REVOKED → 403 (odvzeto);
//   - isti račun že ACTIVE na isti poti → idempotentno vrne obstoječo
//     vlogo (sprejem drugega vabila ne more TIHO znižati/povišati vloge —
//     vlogo spreminja samo lastnik);
//   - žeton ne obstaja → 404 (NE razkrivamo, katera pot je za njim);
//   - ISSUE #4 §23 (VAL 8, P2): PENDING vabilo poteče po 7 dneh
//     (createdA + TTL; brez shemske spremembe). Poteklo vabilo → 410 Gone
//     (iskreno: "lastnik te mora povabiti znova" — re-invite = nova vrstica,
//     žetoni se ne reciklirajo).
// ============================================================================

const HOUR_MS = 60 * 60_000;

/** ISSUE #4 §23 (VAL 8): veljavnost PENDING vabila — 7 dni. */
const INVITE_TTL_MS = 7 * 24 * HOUR_MS;

export async function POST(request: Request) {
  const limited = rateLimit(request, {
    limit: 20,
    windowMs: HOUR_MS,
    key: "trip-collab-accept",
  });
  if (limited) return limited;

  try {
    const session = await getServerSession(authOptions);
    if (
      !session?.user ||
      session.user.accountType !== "user" ||
      !session.user.id
    ) {
      return NextResponse.json(
        {
          error:
            "Za sprejem vabila se prijavi z računom popotnika (vloga na poti je vezana na račun).",
        },
        { status: 401 }
      );
    }
    const userId = session.user.id;
    const accountEmail =
      typeof session.user.email === "string" ? session.user.email : null;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Neveljavno telo zahteve" }, { status: 400 });
    }

    const inviteToken = typeof body.inviteToken === "string" ? body.inviteToken : "";
    if (!INVITE_TOKEN_RE.test(inviteToken)) {
      return NextResponse.json({ error: "Neveljaven žeton vabila" }, { status: 400 });
    }

    const row = await db.tripCollaborator.findUnique({
      where: { inviteToken },
      select: {
        id: true,
        shareId: true,
        role: true,
        status: true,
        inviteEmail: true,
        userId: true,
        createdAt: true,
      },
    });

    if (!row) {
      return NextResponse.json(
        { error: "Vabilo ne obstaja (preveri povezavo)" },
        { status: 404 }
      );
    }

    if (row.status === "REVOKED") {
      return NextResponse.json(
        { error: "To vabilo je bilo odvzeto — lastnik te mora povabiti znova." },
        { status: 403 }
      );
    }

    // ISSUE #4 §23 (VAL 8): potekla PENDING vabila so mrtva — 410 Gone.
    // (Tabela ostaja kot revizijska sled; re-invite naredi NOVO vrstico z
    // novim žetonom, zato reciklaža ni mogoča.)
    if (
      row.status === "PENDING" &&
      Date.now() - row.createdAt.getTime() > INVITE_TTL_MS
    ) {
      return NextResponse.json(
        {
          error:
            "To vabilo je poteklo (veljavna so 7 dni) — lastnik te mora povabiti znova.",
        },
        { status: 410 }
      );
    }

    // Če je vabilo naslovljeno na e-pošto, mora račun USTREZATI — sicer
    // bi lahko kdorkoli s povezavo prevzel tuje vabilo.
    if (
      row.inviteEmail &&
      accountEmail &&
      row.inviteEmail !== accountEmail.toLowerCase()
    ) {
      return NextResponse.json(
        {
          error:
            "To vabilo je naslovljeno na drugo e-pošto — prijavi se z računom, na katerega je bilo poslano.",
        },
        { status: 403 }
      );
    }

    // Idempotentnost: isti račun že ACTIVE na tej poti → vrni obstoječo
    // vlogo (brez tihih sprememb — vloga je lastnikova pristojnost).
    if (row.status === "ACTIVE" && row.userId === userId) {
      return NextResponse.json({
        success: true,
        shareId: row.shareId,
        role: row.role,
        alreadyActive: true,
      });
    }

    const existing = await db.tripCollaborator.findFirst({
      where: { shareId: row.shareId, userId, status: "ACTIVE" },
      select: { id: true, role: true },
    });
    if (existing) {
      return NextResponse.json({
        success: true,
        shareId: row.shareId,
        role: existing.role,
        alreadyActive: true,
        note: "Na tej poti že sodeluješ — vloga ostaja nespremenjena (spremeni jo lahko lastnik).",
      });
    }

    // PENDING vrstica (ali ACTIVE brez userIdja — teoretično nemogoča):
    // prevzemi jo z računom.
    if (row.status !== "PENDING") {
      return NextResponse.json(
        { error: "Vabilo ni več odprto za sprejem." },
        { status: 409 }
      );
    }

    await db.tripCollaborator.update({
      where: { id: row.id },
      data: { userId, status: "ACTIVE", acceptedAt: new Date() },
    });

    await logAudit({
      actorId: userId,
      actorRole: "user",
      action: AUDIT_ACTIONS.TRIP_COLLABORATOR_ACCEPTED,
      resourceType: "trip_collaborator",
      resourceId: row.id,
      metadata: { shareId: row.shareId, role: row.role },
    });

    return NextResponse.json({
      success: true,
      shareId: row.shareId,
      role: row.role,
    });
  } catch (error) {
    console.error("[trip/collaborators/accept] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri sprejemu vabila" },
      { status: 500 }
    );
  }
}
