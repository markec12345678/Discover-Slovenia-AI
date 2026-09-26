import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// /api/my-trip — STREŽNIŠKA REFLEKSIJA ZBIRKE "MOJA POT" (TASK 8 / F2-A)
// ============================================================================
// Issue #8 §18 + Faza 2: zbirka referenc (localStorage `dai:my-trip-items`)
// je doslej živela SAMO na napravi — prijava na drugi napravi je pomenila
// "prazno zbirko". Ta endpoint zbirko prenaša v B2C račun:
//
//   GET    /api/my-trip            → seznam predmetov v računu
//   POST   /api/my-trip { items }  → UNION-MERGE push (nikoli destruktivno)
//                                    + FIFO kapa 200 → vrne celotni seznam
//   DELETE /api/my-trip { kind, refId } | { all: true } → eksplicitno
//                                    odstranjevanje (diff-sync propagation)
//
// Varnost:
// - samo B2C seje (accountType === "user") — Owner/B2B → 403, brez seje → 401
//   (vzor iz /api/user/trips/claim)
// - validacija: ISTI kanon kot src/lib/my-trip.ts (whitelist vrst, dolžine
//   nizov, SAMO notranji href) — server ne zaupaa klientu
// - union-merge: obstoječih predmetov računa NIKOLI ne pobriše push —
//   odstranjevanje je izključno eksplicitno (DELETE)
// - rate limit: 60/h na IP (sinhronizacija je redka + debounce na klientu)
// - brez PII: predmeti so javni povzetki kartic (naslov/slika/globoka povezava)
// ============================================================================

const MAX_ITEMS = 200; // enako kot localStorage kapa (FIFO)
const TITLE_MAX = 160;
const SUBTITLE_MAX = 200;
const HREF_MAX = 300;
const IMAGE_MAX = 600;
const REFID_MAX = 128;
const SOURCE_MAX = 60;

const KINDS = [
  "destination",
  "poi",
  "listing",
  "event",
  "experience",
  "product",
  "guide",
  "community",
  "import",
  "ai",
] as const;

type Kind = (typeof KINDS)[number];

interface IncomingItem {
  kind: unknown;
  refId: unknown;
  title: unknown;
  subtitle: unknown;
  href: unknown;
  image: unknown;
  source: unknown;
  addedAt: unknown;
}

interface ValidatedItem {
  kind: Kind;
  refId: string;
  title: string;
  subtitle: string | null;
  href: string;
  image: string | null;
  source: string | null;
  addedAt: Date;
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.slice(0, max);
}

/** Sanitizacija vnosa — ISTI kanon kot src/lib/my-trip.ts (brez zaupanja). */
function validateItem(item: unknown): ValidatedItem | null {
  if (typeof item !== "object" || item === null) return null;
  const raw = item as IncomingItem;
  if (typeof raw.kind !== "string" || !KINDS.includes(raw.kind as Kind)) return null;
  const refId = str(raw.refId, REFID_MAX);
  if (!refId) return null;
  const title = str(raw.title, TITLE_MAX);
  if (!title) return null;
  const href = str(raw.href, HREF_MAX);
  if (!href || !href.startsWith("/") || href.startsWith("//")) return null;

  // addedAt: ISO datum, clamp na "ne v prihodnost" (klientova ura lahko drifta)
  let addedAt = new Date();
  if (typeof raw.addedAt === "string") {
    const parsed = new Date(raw.addedAt);
    if (!Number.isNaN(parsed.getTime())) {
      addedAt = parsed.getTime() > Date.now() ? new Date() : parsed;
    }
  }

  return {
    kind: raw.kind as Kind,
    refId,
    title,
    subtitle: str(raw.subtitle, SUBTITLE_MAX),
    href,
    image: str(raw.image, IMAGE_MAX),
    source: str(raw.source, SOURCE_MAX),
    addedAt,
  };
}

/** Serija iz DB v klientno obliko (ISO addedAt — kompatibilno z my-trip.ts). */
function serialize(
  rows: Array<{
    kind: string;
    refId: string;
    title: string;
    subtitle: string | null;
    href: string;
    image: string | null;
    source: string | null;
    addedAt: Date;
  }>
) {
  return rows.map((r) => ({
    kind: r.kind,
    refId: r.refId,
    title: r.title,
    subtitle: r.subtitle ?? undefined,
    href: r.href,
    image: r.image ?? undefined,
    source: r.source ?? undefined,
    addedAt: r.addedAt.toISOString(),
  }));
}

export async function GET(request: Request) {
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: 60 * 60_000,
    key: "my-trip-get",
  });
  if (limited) return limited;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
  }
  if (session.user.accountType !== "user") {
    return NextResponse.json(
      { error: "Zbirka je vezana na račune popotnikov" },
      { status: 403 }
    );
  }

  const rows = await db.userTripItem.findMany({
    where: { userId: session.user.id },
    orderBy: { addedAt: "desc" },
  });
  return NextResponse.json({ items: serialize(rows) });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: 60 * 60_000,
    key: "my-trip-sync",
  });
  if (limited) return limited;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
  }
  if (session.user.accountType !== "user") {
    return NextResponse.json(
      { error: "Zbirka je vezana na račune popotnikov" },
      { status: 403 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Neveljavno telo zahteve" }, { status: 400 });
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !Array.isArray((payload as { items?: unknown }).items)
  ) {
    return NextResponse.json({ error: "Pričakovan { items: [...] }" }, { status: 400 });
  }

  const incoming = (payload as { items: unknown[] }).items.slice(0, MAX_ITEMS);
  const valid: ValidatedItem[] = [];
  for (const item of incoming) {
    const v = validateItem(item);
    if (v) valid.push(v);
  }

  // UNION-MERGE: upsert po (userId, kind, refId); obstoječi računski
  // predmeti NIKOLI ne odpadejo zaradi push-a. addedAt iz payload-a pomeni
  // dedup semantiko "osveži podatke in čas" kot v my-trip.ts.
  for (const item of valid) {
    await db.userTripItem.upsert({
      where: {
        userId_kind_refId: {
          userId: session.user.id,
          kind: item.kind,
          refId: item.refId,
        },
      },
      create: {
        userId: session.user.id,
        kind: item.kind,
        refId: item.refId,
        title: item.title,
        subtitle: item.subtitle,
        href: item.href,
        image: item.image,
        source: item.source,
        addedAt: item.addedAt,
      },
      update: {
        title: item.title,
        subtitle: item.subtitle,
        href: item.href,
        image: item.image,
        source: item.source,
        addedAt: item.addedAt,
      },
    });
  }

  // FIFO kapa: najstarejša addedAt čez 200 odpadejo (ista semantika kot
  // localStorage — obe strani ostajata usklajeni po številu).
  const count = await db.userTripItem.count({ where: { userId: session.user.id } });
  if (count > MAX_ITEMS) {
    const overflow = await db.userTripItem.findMany({
      where: { userId: session.user.id },
      orderBy: { addedAt: "desc" },
      skip: MAX_ITEMS,
      select: { id: true },
    });
    if (overflow.length > 0) {
      await db.userTripItem.deleteMany({
        where: { id: { in: overflow.map((r) => r.id) } },
      });
    }
  }

  const rows = await db.userTripItem.findMany({
    where: { userId: session.user.id },
    orderBy: { addedAt: "desc" },
  });
  return NextResponse.json({ items: serialize(rows), merged: valid.length });
}

export async function DELETE(request: Request) {
  const limited = rateLimit(request, {
    limit: 120,
    windowMs: 60 * 60_000,
    key: "my-trip-delete",
  });
  if (limited) return limited;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
  }
  if (session.user.accountType !== "user") {
    return NextResponse.json(
      { error: "Zbirka je vezana na račune popotnikov" },
      { status: 403 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Neveljavno telo zahteve" }, { status: 400 });
  }
  const body = (payload ?? {}) as { kind?: unknown; refId?: unknown; all?: unknown };

  // Briši VSE (eksplicitni "Počisti" iz MyTripView med prijavo)
  if (body.all === true) {
    const res = await db.userTripItem.deleteMany({ where: { userId: session.user.id } });
    return NextResponse.json({ removed: res.count });
  }

  // Briši ENEGA (kind + refId obvezna, sanitizirano po istem kanonu)
  if (typeof body.kind !== "string" || !KINDS.includes(body.kind as Kind)) {
    return NextResponse.json({ error: "Neveljavna vrsta predmeta" }, { status: 400 });
  }
  const refId = str(body.refId, REFID_MAX);
  if (!refId) {
    return NextResponse.json({ error: "Manjka refId" }, { status: 400 });
  }

  await db.userTripItem.deleteMany({
    where: { userId: session.user.id, kind: body.kind, refId },
  });
  return NextResponse.json({ removed: 1 });
}
