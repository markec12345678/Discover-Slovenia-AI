import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// PUSH UNSUBSCRIBE — brisi naročnino
// ============================================================================
//
// Kontrakt (konsumira ga PushSubscribe / 11-b frontend):
//   POST /api/push/unsubscribe
//     body { endpoint }
//     → 200 { success: true }   (naročnina izbrisana ALI je ni bilo — IDEMPOTENTNO)
//
// SEMANTIKA (dokumentirana odločitev): IZBRALI SMO idempotentni 200.
// Razlog: "izklopi obvestila" mora VEDNO uspeti iz uporabnikovega zornega
// kota — če je push service vrstico že pobrisal (gone) ali jo je brskalnik
// zavrnil prej, JE ciljno stanje doseženo (naročnik ne obstaja). 404 bi
// klient prisilil v ločevanje "napaka" vs "že izbrisano" brez koristi.
// HARD delete (ne soft): /api/push/subscribe upsert-a isti endpoint, če
// se uporabnik premisli — torej vrstica ni zgodovinsko pomembna.
// ============================================================================

const HOUR_MS = 60 * 60_000;

interface UnsubscribeBody {
  endpoint?: unknown;
}

export async function POST(request: Request) {
  const limited = rateLimit(request, {
    limit: 20,
    windowMs: HOUR_MS,
    key: "push:unsub",
  });
  if (limited) return limited;

  try {
    const raw: unknown = await request.json().catch(() => null);
    const b = (raw ?? {}) as UnsubscribeBody;

    // --- endpoint: https URL, max 2048 znakov (isti vzorec kot subscribe) ---
    const endpoint = typeof b.endpoint === "string" ? b.endpoint.trim() : "";
    if (!endpoint || endpoint.length > 2048 || !endpoint.startsWith("https://")) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven endpoint naročnine (https, max 2048 znakov)" },
        { status: 400 }
      );
    }

    // HARD delete — ponovna prijava pokrita z upsert-om na subscribe ruti.
    const deleted = await db.pushSubscription.deleteMany({
      where: { endpoint },
    });

    // Idempotentno: 200 tudi če vrstice ni bilo (deleted.count === 0).
    return NextResponse.json({
      success: true,
      deleted: deleted.count,
    });
  } catch (error) {
    console.error("[push/unsubscribe] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri odjavi naročnine" },
      { status: 500 }
    );
  }
}
