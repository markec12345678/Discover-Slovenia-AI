import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { randomId } from "@/lib/security";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";
import {
  resolveTripRole,
  isCollaboratorRole,
  COLLABORATOR_ROLES,
  SHARE_ID_RE,
  type TripSession,
} from "@/lib/trip-permissions";

// ============================================================================
// SODELUJOČI NA POTI — ISSUE #4 §13 (val 2)
// ============================================================================
//   GET   /api/trip/[shareId]/collaborators  — seznam (SAMO lastnik)
//   POST  /api/trip/[shareId]/collaborators  — izda vabilo (SAMO lastnik)
//         body { role: EDITOR|COMMENTER|VIEWER, inviteEmail?: string }
//         → { inviteUrl } (lastnik kopira in pošlje; SMTP ni nastavljen —
//           iskerno sporočimo, da je pošiljanje ročno)
//   PATCH /api/trip/[shareId]/collaborators  — spremeni vlogo / odvzemi
//         body { id, role? | status?: REVOKED } (SAMO lastnik)
//
// VABILA (honest design):
//   - PENDING vrstica z inviteToken (randomId(32) hex) — NE razkriva vloge
//     prek URLja javnosti; URL je /pot/{shareId}?invite={token};
//   - sprejem: POST /api/trip/collaborators/accept (zahteva B2C sejo) —
//     vloga je privzeta ŠELE ob sprejemu (KLIK v e-pošti ≠ sprejem);
//   - zgornja meja: 20 ne-odvzetih vrstic na pot (varovalka pred zlorabo);
//   - revokacija: status REVOKED (vrstica ostane za forenziko/audit),
//     žeton se NE ponovno uporabi (status se preverja ob sprejemu).
// ============================================================================

const HOUR_MS = 60 * 60_000;
const MAX_COLLABORATORS = 20;
const INVITE_EMAIL_MAX = 254;

async function resolveOwner(
  shareId: string,
  request: Request
): Promise<
  | { ok: true; session: TripSession | null; invitedBy: string }
  | { ok: false; response: NextResponse }
> {
  const editToken = request.headers.get("x-dsa-edit-token");
  let session: TripSession | null = null;
  try {
    session = (await getServerSession(authOptions)) as TripSession | null;
  } catch {
    // anonimno
  }
  const { role, saved } = await resolveTripRole(shareId, { editToken, session });
  if (!saved) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Deljeno potovanje ne obstaja" },
        { status: 404 }
      ),
    };
  }
  if (role !== "OWNER") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Sodelujoče lahko upravlja le lastnik poti (odpri povezavo v brskalniku, kjer si pot shranil, ali se prijavi z računom lastnika).",
        },
        { status: 403 }
      ),
    };
  }
  const uid = session?.user?.id;
  const invitedBy =
    uid && session?.user?.accountType === "user" && uid === saved.userId
      ? `session:${uid}`
      : "edit-token";
  return { ok: true, session, invitedBy };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const limited = rateLimit(request, {
    limit: 120,
    windowMs: HOUR_MS,
    key: "trip-collab-list",
  });
  if (limited) return limited;

  try {
    const { shareId } = await params;
    if (!SHARE_ID_RE.test(shareId)) {
      return NextResponse.json({ error: "Neveljaven ID poti" }, { status: 400 });
    }

    const owner = await resolveOwner(shareId, request);
    if (!owner.ok) return owner.response;

    const rows = await db.tripCollaborator.findMany({
      where: { shareId },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: {
        id: true,
        role: true,
        status: true,
        inviteEmail: true,
        userId: true,
        invitedBy: true,
        createdAt: true,
        acceptedAt: true,
      },
    });

    const userIds = rows
      .map((r) => r.userId)
      .filter((u): u is string => typeof u === "string");
    const users = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, name: true },
        })
      : [];

    return NextResponse.json({
      success: true,
      shareId,
      collaborators: rows.map((r) => {
        const u = users.find((x) => x.id === r.userId);
        return {
          id: r.id,
          role: r.role,
          status: r.status,
          inviteEmail: r.inviteEmail,
          invitedBy: r.invitedBy,
          createdAt: r.createdAt.toISOString(),
          acceptedAt: r.acceptedAt ? r.acceptedAt.toISOString() : null,
          accountEmail: u?.email ?? null,
          accountName: u?.name ?? null,
        };
      }),
    });
  } catch (error) {
    console.error("[trip/collaborators] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju sodelujočih" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const limited = rateLimit(request, {
    limit: 20,
    windowMs: HOUR_MS,
    key: "trip-collab-invite",
  });
  if (limited) return limited;

  try {
    const { shareId } = await params;
    if (!SHARE_ID_RE.test(shareId)) {
      return NextResponse.json({ error: "Neveljaven ID poti" }, { status: 400 });
    }

    const owner = await resolveOwner(shareId, request);
    if (!owner.ok) return owner.response;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Neveljavno telo zahteve" }, { status: 400 });
    }

    const role = body.role;
    if (!isCollaboratorRole(role)) {
      return NextResponse.json(
        {
          error: `Vloga mora biti ena od: ${COLLABORATOR_ROLES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const inviteEmailRaw =
      typeof body.inviteEmail === "string" ? body.inviteEmail.trim() : "";
    if (inviteEmailRaw && inviteEmailRaw.length > INVITE_EMAIL_MAX) {
      return NextResponse.json(
        { error: "E-pošta vabila je predolga" },
        { status: 400 }
      );
    }

    // Varovalka: zgornja meja ne-odvzetih vrstic na pot.
    const activeCount = await db.tripCollaborator.count({
      where: { shareId, status: { not: "REVOKED" } },
    });
    if (activeCount >= MAX_COLLABORATORS) {
      return NextResponse.json(
        {
          error: `Meja sodelujočih na eno pot je ${MAX_COLLABORATORS} — odvzemi koga, preden povabiš novega.`,
        },
        { status: 409 }
      );
    }

    // NE podvajamo aktivne vloge istemu računu: če uporabnik s to e-pošto
    // že sodeluje z ENAKO ali VIŠJO vlogo, iskreno povemo (brez tihega
    // duplikata). Preverimo prek Users (e-pošta je prijavni ključ).
    if (inviteEmailRaw) {
      const existingUser = await db.user.findUnique({
        where: { email: inviteEmailRaw.toLowerCase() },
        select: { id: true },
      });
      if (existingUser) {
        const existing = await db.tripCollaborator.findFirst({
          where: { shareId, userId: existingUser.id, status: "ACTIVE" },
          select: { role: true },
        });
        if (existing) {
          return NextResponse.json(
            {
              error: `Ta uporabnik že sodeluje z vlogo ${existing.role} — vlogo lahko spremeniš (Uredi), ne pa izdaš drugo vabilo.`,
            },
            { status: 409 }
          );
        }
      }
    }

    const inviteToken = randomId(32);

    const row = await db.tripCollaborator.create({
      data: {
        shareId,
        role,
        status: "PENDING",
        inviteToken,
        invitedBy: owner.invitedBy,
        ...(inviteEmailRaw ? { inviteEmail: inviteEmailRaw.toLowerCase() } : {}),
      },
      select: { id: true },
    });

    await logAudit({
      actorId: owner.session?.user?.id ?? undefined,
      actorRole: owner.invitedBy.startsWith("session:") ? "user" : "edit-token-owner",
      action: AUDIT_ACTIONS.TRIP_INVITE_SENT,
      resourceType: "trip_collaborator",
      resourceId: row.id,
      metadata: { shareId, role, inviteEmail: inviteEmailRaw || null },
    });

    // Vabilo je URL z žetonom — vračamo RELATIVNO pot (klient doda izvor);
    // SMTP danes NI nastavljen (operater), zato je pošiljanje ročno —
    // UI to iskreno pokaže (kopiraj povezavo).
    return NextResponse.json(
      {
        success: true,
        id: row.id,
        role,
        inviteUrl: `/pot/${shareId}?invite=${inviteToken}`,
        emailHint:
          "Samodejno pošiljanje vabal ni nastavljeno — povezavo kopiraj in pošlji sami.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[trip/collaborators] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri izdaji vabila" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: HOUR_MS,
    key: "trip-collab-patch",
  });
  if (limited) return limited;

  try {
    const { shareId } = await params;
    if (!SHARE_ID_RE.test(shareId)) {
      return NextResponse.json({ error: "Neveljaven ID poti" }, { status: 400 });
    }

    const owner = await resolveOwner(shareId, request);
    if (!owner.ok) return owner.response;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Neveljavno telo zahteve" }, { status: 400 });
    }

    const id = typeof body.id === "string" ? body.id : "";
    if (!/^[a-z0-9]{10,40}$/i.test(id)) {
      return NextResponse.json({ error: "Neveljaven ID sodelujočega" }, { status: 400 });
    }

    const row = await db.tripCollaborator.findFirst({
      where: { id, shareId },
      select: { id: true, role: true, status: true, userId: true },
    });
    if (!row) {
      return NextResponse.json(
        { error: "Sodelujoči na tej poti ne obstaja" },
        { status: 404 }
      );
    }

    const newRole = body.role;
    const newStatus = body.status;

    if (newStatus === "REVOKED") {
      await db.tripCollaborator.update({
        where: { id: row.id },
        data: { status: "REVOKED" },
      });
      await logAudit({
        actorId: owner.session?.user?.id ?? undefined,
        actorRole: owner.invitedBy.startsWith("session:") ? "user" : "edit-token-owner",
        action: AUDIT_ACTIONS.TRIP_COLLABORATOR_REVOKED,
        resourceType: "trip_collaborator",
        resourceId: row.id,
        metadata: { shareId, previousRole: row.role, previousStatus: row.status },
      });
      return NextResponse.json({ success: true, id: row.id, status: "REVOKED" });
    }

    if (isCollaboratorRole(newRole)) {
      if (row.status === "REVOKED") {
        // Ponovna aktivacija: nov status ACTIVE (ista vrstica, zgodovina
        // ostane v audit logu) — vloga nova.
        await db.tripCollaborator.update({
          where: { id: row.id },
          data: { role: newRole, status: "ACTIVE" },
        });
      } else {
        await db.tripCollaborator.update({
          where: { id: row.id },
          data: { role: newRole },
        });
      }
      await logAudit({
        actorId: owner.session?.user?.id ?? undefined,
        actorRole: owner.invitedBy.startsWith("session:") ? "user" : "edit-token-owner",
        action: AUDIT_ACTIONS.TRIP_COLLABORATOR_ROLE_CHANGED,
        resourceType: "trip_collaborator",
        resourceId: row.id,
        metadata: { shareId, previousRole: row.role, newRole, status: row.status },
      });
      return NextResponse.json({
        success: true,
        id: row.id,
        role: newRole,
        status: row.status === "REVOKED" ? "ACTIVE" : row.status,
      });
    }

    return NextResponse.json(
      { error: "Podprto telo: { id, role } ali { id, status: \"REVOKED\" }" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[trip/collaborators] PATCH napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri spremembi sodelujočega" },
      { status: 500 }
    );
  }
}
