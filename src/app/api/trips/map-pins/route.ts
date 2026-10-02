import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { SHARE_ID_RE } from "@/lib/trip-permissions";
import { pinsFromItineraryJson, type TripMapPins } from "@/lib/trips-map-pins";

// ============================================================================
// POST /api/trips/map-pins — »Zemljevid mojih potovanj« (#24 Sklop 3, 1.165.0)
// ============================================================================
// Polarsteps vzorec »profilni globus« (benchmark Round 2, P3 NEW FEATURE
// CANDIDATE): hub /moja-potovanja izriše VSA uporabnikova potovanja na enem
// zemljevidu. Ta endpoint za podane shareId-je (gost: localStorage
// dai:my-trips; prijavljeni: /api/user/trips) vrne SAMO pin podatke
// postankov {lat,lng,name,day} — ne celotnega itinererja (vhodni podatki
// načrtovalnika so zasebni, isti kanon kot GET /api/itinerary/shared).
//
// Varnost / iskrenost:
// - javne poti (isPublic) → pini (ISTE informacije kot javna stran /pot);
// - zasebne poti → SAMO lastnik (session userId) — drugače se pot TIHO
//   izpusti iz odgovora (NE 403/404 na id: množična poizvedba ne sme
//   potrdjevati obstoja tuje zasebne povezave; enako načelo kot 404 na /pot);
// - pogojni ogled z editToken NI podprt tukaj (žeton živi v localStorage
//   shranjevalnika in ni del zbiralnega seznama) — ti pini odpadejo,
//   iskreno brez lažnega prikaza;
// - števec ogledov SE NE poveča (pregled zemljevida NI obisk poti —
//   GET /api/itinerary/shared/[shareId] ostaja edini štever);
// - rate limit 30/min na IP (množična enumeracija shareId-jev je brez
//   koristi: odgovor razkrije samo javno dostopne pripovedi pinov).
// ============================================================================

/** Meja ids na zahtevo — klient pošlje največ 50 (MAX_TRACKED localStorage). */
const MAX_IDS = 50;

/** Zgornja meja telesa zahteve (50 × 33 znakov ≈ 1,7 KB + olje). */
const MAX_BODY_BYTES = 8_192;

export async function POST(request: Request) {
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: 60_000,
    key: "trips-map-pins",
  });
  if (limited) return limited;

  try {
    // === Session (neobvezna — gost vidi piny svojih JAVNIH lokalnih poti) ===
    let sessionUserId: string | null = null;
    try {
      const session = (await getServerSession(authOptions)) as {
        user?: { id?: string };
      } | null;
      sessionUserId = session?.user?.id ?? null;
    } catch {
      sessionUserId = null; // napaka seje = anonimno (fail-closed za zasebne)
    }

    // === Telo: { ids: string[] } — velikostno ograjeno PRED parsiranjem ===
    const raw = await request.text().catch(() => "");
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "Telo zahteve je preveliko" },
        { status: 413 }
      );
    }
    let body: unknown = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }

    const idsRaw = (body as { ids?: unknown } | null)?.ids;
    if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
      return NextResponse.json(
        { error: "Manjka seznam potovanj (ids)" },
        { status: 400 }
      );
    }
    if (idsRaw.length > MAX_IDS) {
      return NextResponse.json(
        { error: "Največ 50 potovanj na zahtevo" },
        { status: 400 }
      );
    }
    for (const id of idsRaw) {
      if (typeof id !== "string" || !SHARE_ID_RE.test(id)) {
        return NextResponse.json(
          { error: "Neveljaven shareId" },
          { status: 400 }
        );
      }
    }

    // Dedupliciramo (ohranimo vrstni red prvega pojavljanja — klientove
    // kartice in pini naj ostanejo usklajeni).
    const ids: string[] = [];
    for (const id of idsRaw as string[]) {
      if (!ids.includes(id)) ids.push(id);
    }

    // === Branje poti (brez views povečanja — glej glavo) ===
    const rows = await db.savedItinerary.findMany({
      where: { shareId: { in: ids } },
      select: {
        shareId: true,
        userId: true,
        isPublic: true,
        itinerary: true,
      },
    });
    const byId = new Map(rows.map((r) => [r.shareId, r]));

    const pins: TripMapPins[] = [];
    for (const id of ids) {
      const row = byId.get(id);
      if (!row) continue; // neznani id — tiho izpust (brez potrditve obstoja)
      // Zasebna pot: SAMO lastnik (session). Gost/tuj → izpust brez sledi.
      if (!row.isPublic && row.userId !== sessionUserId) continue;

      const stops = pinsFromItineraryJson(row.itinerary);
      if (stops.length === 0) continue; // pot brez znanih koordinat — brez pinov
      pins.push({ shareId: row.shareId, stops });
    }

    return NextResponse.json({ pins });
  } catch {
    return NextResponse.json(
      { error: "Napaka strežnika" },
      { status: 500 }
    );
  }
}
