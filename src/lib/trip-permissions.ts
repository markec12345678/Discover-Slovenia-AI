import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// ============================================================================
// TRIP PERMISSIONS — ISSUE #4 §13 (val 2): ena točka resnice o vlogah
// ============================================================================
// Vloge na poti (po Issue #4):
//   OWNER      — editToken (anonimni lastnik) ALI SavedItinerary.userId
//                (račun) — generalizacija dokazanega trip-guide dvojega
//                preverjanja (trip-guide/route.ts:186–213)
//   EDITOR     — sodelujoči z vlogo EDITOR: sme spreminjati vsebino + ime
//   COMMENTER  — sme pisati skupnostne vpise (komentarji/glasovi/ankete/
//                dnevnik) na ZASEBNI poti; na javni ostane anonymous-first
//   VIEWER     — sme brati zasebno pot
//   NONE       — brez dostopa (zasebna pot brez vpabe)
//
// Nazaj kompatibilnost (nedotaknjene invariant):
//   - VSE obstoječe pote so isPublic=true → vsak obiskovalec = VIEWER+,
//     anonymous-first skupnostne rute se OBNAŠAJO ENAKO (preverimo samo,
//     da je pot javna);
//   - editToken/userId lastništvo TripGuide ostaja edini vir OWNER;
//   - javne povezave /pot/{shareId} delujejo nespremenjeno.
//
// ISKRENOST: vsak odgovor razkrije SAMO vloge, ki jih klicatelj dejansko
// ima (nikoli seznam sodelujočih javnosti — to vidi samo lastnik).
// ============================================================================

export type TripRole = "OWNER" | "EDITOR" | "COMMENTER" | "VIEWER" | "NONE";

/** Urejenost vlog (višja številka = več pravic). */
export const TRIP_ROLE_RANK: Record<TripRole, number> = {
  NONE: 0,
  VIEWER: 1,
  COMMENTER: 2,
  EDITOR: 3,
  OWNER: 4,
};

/** Vloge, ki jih lahko nosi vrstica TripCollaborator (OWNER ni vrstica). */
export const COLLABORATOR_ROLES = ["EDITOR", "COMMENTER", "VIEWER"] as const;
export type CollaboratorRole = (typeof COLLABORATOR_ROLES)[number];

export function isCollaboratorRole(v: unknown): v is CollaboratorRole {
  return (
    typeof v === "string" &&
    (COLLABORATOR_ROLES as readonly string[]).includes(v)
  );
}

/** Kanonski validator shareId (poenoti site drift — vse poti so 10 hex). */
export const SHARE_ID_RE = /^[a-z0-9]{1,32}$/;

/** Veljaven editToken (hex, 32–64 znakov — generiramo 32). */
const EDIT_TOKEN_RE = /^[a-f0-9]{32,64}$/;

/** Veljaven inviteToken (hex, 32–64 znakov — generiramo 32). */
export const INVITE_TOKEN_RE = /^[a-f0-9]{32,64}$/;

/** Minimalna seja, ki jo potrebujemo (NextAuth getServerSession oblika). */
export interface TripSession {
  user?: {
    id?: string | null;
    accountType?: string | null;
  } | null;
}

/** Izbira polj poti, ki jih resolveTripRole potrebuje. */
const SAVED_SELECT = {
  userId: true,
  editTokenHash: true,
  isPublic: true,
  contentVersion: true,
  updatedAt: true,
  name: true,
} as const;

export interface TripRoleContext {
  /** Tajni žeton lastnika (localStorage `dsa_edit_token_{shareId}`). */
  editToken?: string | null;
  /** NextAuth seja (B2C "user" račun) ali null. */
  session?: TripSession | null;
}

export interface ResolvedTripRole {
  role: TripRole;
  /** null, če pot ne obstaja (role = NONE). */
  saved:
    | {
        userId: string | null;
        editTokenHash: string | null;
        isPublic: boolean;
        contentVersion: number;
        updatedAt: Date;
        name: string | null;
      }
    | null;
}

/**
 * Izračunaj vlogo klicalca na poti. ENA točka resnice — vse §13 rute
 * gredo skozi to funkcijo (nikoli svoje lastne if-ulomke).
 */
export async function resolveTripRole(
  shareId: string,
  ctx: TripRoleContext
): Promise<ResolvedTripRole> {
  if (!SHARE_ID_RE.test(shareId)) {
    return { role: "NONE", saved: null };
  }

  const saved = await db.savedItinerary.findUnique({
    where: { shareId },
    select: SAVED_SELECT,
  });
  if (!saved) return { role: "NONE", saved: null };

  // ── Pot 1: tajni žeton (anonimni lastnik) — hash primerjava ────────────
  let isOwner = false;
  if (ctx.editToken && EDIT_TOKEN_RE.test(ctx.editToken) && saved.editTokenHash) {
    const tokenHash = createHash("sha256").update(ctx.editToken).digest("hex");
    isOwner = tokenHash === saved.editTokenHash;
  }

  // ── Pot 2: prijavljen lastnik (SavedItinerary.userId) ──────────────────
  if (!isOwner) {
    const uid = ctx.session?.user?.id;
    if (
      uid &&
      ctx.session?.user?.accountType === "user" &&
      saved.userId != null &&
      uid === saved.userId
    ) {
      isOwner = true;
    }
  }

  if (isOwner) return { role: "OWNER", saved };

  // ── Pot 3: AKTIVNI sodelujoči (samo prijavljeni) ───────────────────────
  const uid = ctx.session?.user?.id;
  if (uid && ctx.session?.user?.accountType === "user") {
    const collab = await db.tripCollaborator.findFirst({
      where: { shareId, userId: uid, status: "ACTIVE" },
      select: { role: true },
    });
    if (collab && isCollaboratorRole(collab.role)) {
      const rank: TripRole = collab.role;
      return { role: rank, saved };
    }
  }

  // ── Pot 4: javna pot → vsak obiskovalec je VIEWER ──────────────────────
  return { role: saved.isPublic ? "VIEWER" : "NONE", saved };
}

/** Ali vloga dovoljuje zahtevano raven (>=). */
export function roleAtLeast(role: TripRole, need: TripRole): boolean {
  return TRIP_ROLE_RANK[role] >= TRIP_ROLE_RANK[need];
}

// ---------------------------------------------------------------------------
// Community gate — za anonymous-first rute (glasovi/komentarji/všečki/
// ankete/dnevnik + booking prekrivka). Vrača NextResponse za ZAVRNITEV ali
// null za NADALJEVANJE. Pri JAVNI poti vedno null (0 spremembe obnašanja).
// ---------------------------------------------------------------------------

export type CommunityNeed = "read" | "comment" | "edit";

const NEED_MIN_ROLE: Record<CommunityNeed, TripRole> = {
  read: "VIEWER",
  comment: "COMMENTER",
  edit: "EDITOR",
};

/**
 * Preveri dostop za skupnostno akcijo na poti. Zasebna pot zahteva sejo z
 * ustrezno vlogo; javna pot spusti vse (nazaj kompatibilno).
 *
 * Vrača: null = nadaljuj (dovoljeno) | NextResponse = zavrnjeno (vrni).
 * Napake so iskrene in dvojezično razumljive (enako kot trip-guide 403).
 */
export async function communityTripGate(
  shareId: string,
  need: CommunityNeed
): Promise<NextResponse | null> {
  const { getServerSession } = await import("next-auth");
  const { authOptions } = await import("@/lib/auth");

  let session: TripSession | null = null;
  try {
    session = (await getServerSession(authOptions)) as TripSession | null;
  } catch {
    // napaka seje = kot neprijavljen (fail-closed za zasebne, javne OK)
  }

  const { role, saved } = await resolveTripRole(shareId, { session });
  if (!saved) {
    return NextResponse.json(
      { error: "Deljeno potovanje ne obstaja" },
      { status: 404 }
    );
  }

  const minRole = NEED_MIN_ROLE[need];
  if (roleAtLeast(role, minRole)) return null;

  // Zavrnitev — pošteno pove KAJ je treba (prijava / vabilo).
  if (role === "NONE" && !saved.isPublic) {
    return NextResponse.json(
      {
        error:
          "Ta potovanje je zasebno — dostop imajo povabljeni sodelujoči (prijavi se z računom, na katerega si prejel vabilo).",
      },
      { status: 403 }
    );
  }
  return NextResponse.json(
    {
      error:
        "Za to dejanje potrebuješ vlogo sodelujočega (urednik/komentator) — lastnik te mora povabiti.",
    },
    { status: 403 }
  );
}
