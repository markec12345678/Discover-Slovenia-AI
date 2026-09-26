import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { randomId } from "@/lib/security";
import { sanitizeItinerary } from "@/lib/itinerary-sanitize";
import { revalidateSavedItinerarySupply } from "@/lib/supply/itinerary-validation";

// POST /api/itinerary/save — shranjevanje itinererja (P1-2b: anonimno ALI na račun)
//
// Body:
//   { itinerary: Itinerary, formData?: unknown, name?: string }
//
// Vrne javni shareId in URL (/pot/{shareId}), ki ga uporabnik deli s prijatelji.
// Če je shranjevanje izvedla prijavljena B2C seja (accountType "user"), se
// itinerer poveže z računom (userId) in se prikaže v "Moja potovanja".
// Brez seje ostaja anonimno (userId null) — nespremenjeno delovanje.
//
// F7 (vodniki): odgovor vsebuje TAJNI editToken (32 hex). Client ga shrani v
// localStorage in z njim pozneje doda/ureja vodnik na /pot/{shareId}.
// V DB hranimo SAMO SHA-256 hash — izliv deljene povezave ne razkrije žetona.
export async function POST(request: Request) {
  // Rate limit shranjevanj (preprečuje zlorabo DB prostora)
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: 60 * 60_000,
    key: "itinerary-save",
  });
  if (limited) return limited;

  try {
    // ISSUE #7 (G11, P3 fix): pokvarjen/nepopoln JSON telesa je NAPAČNA
    // ZAHTEVA stranke (400) — ne strežniška napaka (500). Prej je parse
    // izjema padla v splošni catch → 500 z generičnim sporočilom; isti
    // vzorec pravilnega ravnanja že ima /api/journey/bookings/parse.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Neveljaven JSON v zahtevi" },
        { status: 400 }
      );
    }
    const b = (body ?? {}) as Record<string, unknown>;

    const itinerary = b.itinerary as unknown;

    // === Validacija itinererja ===
    if (
      typeof itinerary !== "object" ||
      itinerary === null ||
      !Array.isArray((itinerary as { days?: unknown }).days)
    ) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven itinerer (days)" },
        { status: 400 }
      );
    }

    const days = (itinerary as { days: unknown[] }).days;
    if (days.length < 1 || days.length > 14) {
      return NextResponse.json(
        { error: "Itinerer mora imeti med 1 in 14 dni" },
        { status: 400 }
      );
    }

    // Vsak dan mora imeti locations array
    for (const day of days) {
      if (
        typeof day !== "object" ||
        day === null ||
        !Array.isArray((day as { locations?: unknown }).locations)
      ) {
        return NextResponse.json(
          { error: "Vsak dan itinererja mora vsebovati seznam lokacij" },
          { status: 400 }
        );
      }
    }

    // SANITIZE-FIX (revizija 1.33.0, 16-c P2 — type confusion na deljeni
    // povezavi): prej je save zaupal klientovi strukturi (samo days/locations
    // array + 200KB) — `notes: {}` je nato na /pot/[shareId] SSR vrgel
    // "Objects are not valid as a React child" → 500 za vsakega odjemalca
    // povezave. Zdaj isto-ravninski shape guard kot pri AI izhodu: vsa
    // besedila typeof string + kap, numerika clamp ≥ 0, seznami array stringov.
    const sanitized = sanitizeItinerary(itinerary);
    if (sanitized.days.length === 0) {
      return NextResponse.json(
        { error: "Itinerer nima veljavnih dni/lokacij" },
        { status: 400 }
      );
    }

    // TASK 56 (P2-2): KANONSKA REVALIDACIJA SUPPLY POSTANKOV na meji
    // shranjevanja. Do 1.58.2 je save zaupal SAMO shape guard — klientova
    // €1 cena / fabrikantrt providerProductId / drug provider / duplikat so
    // se shranili in prikazali na JAVNI deljeni povezavi /pot/{shareId}.
    // Rešitev PONOVNO UPORABLJA obstoječo verigo (ista sestava kot refine
    // echo): verifyCurrentStopsAuthority → validateItinerarySupply →
    // recomputeTotalBudget (glej revalidateSavedItinerarySupply). NI nov
    // verification sistem; FIXED/cena/geo/ID pravila so nespremenjena —
    // legitimen (strežniško generiran) načrt gre skozi brez sprememb.
    const fd = b.formData as
      | { language?: unknown; budget?: unknown; groupSize?: unknown }
      | null
      | undefined;
    const saveLang = fd?.language === "en" ? "en" : "sl";
    // ISSUE #4 §14 (val 3): proračun + skupina iz PlannerInput (formData)
    // → revalidate preračuna budgetValidation (vrzel: save ga je izpuščal
    // → /pot brez within/exceeded bloka). Kap 0–100k / 1–20 (isti razred
    // kot PlannerInput validacija).
    const saveBudget =
      typeof fd?.budget === "number" &&
      Number.isFinite(fd.budget) &&
      fd.budget > 0 &&
      fd.budget <= 100_000
        ? fd.budget
        : undefined;
    const saveGroupSize =
      typeof fd?.groupSize === "number" &&
      Number.isFinite(fd.groupSize) &&
      fd.groupSize >= 1 &&
      fd.groupSize <= 20
        ? Math.round(fd.groupSize)
        : undefined;
    const supplyChecked = revalidateSavedItinerarySupply(sanitized, saveLang, {
      ...(saveBudget != null ? { budget: saveBudget } : {}),
      ...(saveGroupSize != null ? { groupSize: saveGroupSize } : {}),
    });
    if (supplyChecked.report.rejected > 0) {
      console.warn(
        `[itinerary/save] supply revalidacija: ODSTRANJENIH ${supplyChecked.report.rejected} fabrikantrnih supply postankov: ${supplyChecked.report.issues
          .filter((i) => i.rule === "fake_supply_ref")
          .map((i) => i.ref)
          .join(", ")}`
      );
    }

    // Omeji velikost shranjenega JSON (preprečuje zlorabo)
    const itineraryJson = JSON.stringify(supplyChecked.itinerary);
    if (itineraryJson.length >= 200_000) {
      return NextResponse.json(
        { error: "Itinerer je prevelik" },
        { status: 400 }
      );
    }

    // Ime (opcijsko, skrajšano)
    const nameRaw = typeof b.name === "string" ? b.name.trim() : "";
    const name = nameRaw ? nameRaw.slice(0, 120) : null;

    // formData (opcijsno) — vhodni podatki načrtovalnika (PlannerInput)
    const formDataJson = JSON.stringify(b.formData ?? null);
    if (formDataJson.length >= 200_000) {
      return NextResponse.json(
        { error: "Podatki obrazca so preveliki" },
        { status: 400 }
      );
    }

    // Javni ID za deljenje (lowercase hex — URL-varen)
    const shareId = randomId(10).toLowerCase();
    // F7: tajni žeton za urejanje vodnika — v DB samo hash, plain vrnemo
    // izključno v odgovoru shranjevalniku (client ga da v localStorage)
    const editToken = randomId(32).toLowerCase();
    const editTokenHash = createHash("sha256").update(editToken).digest("hex");

    // === P1-2b: povezava z računom popotnika, če je prijavljen (B2C) ===
    // Anonimno shranjevanje ostaja nespremenjeno (userId null). Session
    // pridobimo šele TU (za validacijo) — javni flow se ne dotika auth.
    let userId: string | null = null;
    try {
      const session = await getServerSession(authOptions);
      if (session?.user?.accountType === "user" && session.user.id) {
        const user = await db.user.findUnique({
          where: { id: session.user.id },
          select: { id: true },
        });
        if (user) userId = user.id;
      }
    } catch (e) {
      // Napaka pri avtentikaciji NE sme preprečiti anonimnega shranjevanja
      console.error("[itinerary/save] session napaka (nadaljujem anonimno):", e);
    }

    const saved = await db.savedItinerary.create({
      data: {
        shareId,
        itinerary: itineraryJson,
        formData: formDataJson,
        name,
        editTokenHash,
        // P1-2b: null = anonimno | user.id = povezano s prijavljenim popotnikom
        userId,
      },
      select: { shareId: true, createdAt: true },
    });

    return NextResponse.json({
      success: true,
      shareId: saved.shareId,
      url: `/pot/${saved.shareId}`,
      // F7: tajni žeton vodnika (SAMO za shranjevalnikova oči — nikoli v javne poglede)
      editToken,
      createdAt: saved.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("[itinerary/save] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri shranjevanju itinererja" },
      { status: 500 }
    );
  }
}
