import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { randomId } from "@/lib/security";
import { DESTINATIONS } from "@/lib/slovenia-data";
import {
  CONSULTATION_BUDGETS,
  CONSULTATION_INTERESTS,
  CONSULTATION_INTERESTS_MAX,
  CONSULTATION_NAME_MAX,
  CONSULTATION_NAME_MIN,
  CONSULTATION_PARTY_MAX,
  CONSULTATION_DATES_MAX,
  CONSULTATION_QUESTION_MAX,
  CONSULTATION_QUESTION_MIN,
  EMAIL_RE,
} from "@/lib/consultations";
import {
  buildConsultationContext,
  extractConsultPartners,
  generateConsultationAnswer,
  trackConsultationPartnerExposure,
} from "@/lib/consultation-engine";

// ============================================================================
// POST /api/consultations — ODDAJA plačljive globoke konzultacije
// ============================================================================
// Freemium motor (Faza 3b-2): globoka „Vprašaj lokalca" konzultacija,
// ki porabi 1 kredit (ConsultationCredit, vezan na e-pošto kupca).
//
// Pot:
//   1. validacija (vsa polja, interesi/proračun iz fiksnih seznamov),
//   2. poiskanje RASPOLOŽLJIVEGA kredita za e-pošto — 402 če ga ni
//      (klient takrat ponudi nakup paketa),
//   3. kontekst iz baze (premium-aware) → AI globok odgovor (grounded)
//      oz. iskren programski fallback,
//   4. kredit OZNAČEN kot uporabljen (transaction — prepreči dvojno
//      porabo istega kredita),
//   5. odgovor shranjen + privatni accessToken (dostop /konzultacija/{token}),
//      B2B tracking citiranih partnerjev (aiRecommendations + ListingEvent).
//
// Kredit se porabi SAMO ob dostavi odgovora — tudi fallback odgovor je
// uporaben (pošteno sestavljen iz istega konteksta, vidno označen), zato
// velja kot dostavljena konzultacija.
// ============================================================================

interface ConsultationRequest {
  email?: string;
  name?: string;
  question?: string;
  destinationName?: string;
  travelDates?: string;
  partyDescription?: string;
  budget?: string;
  interests?: string[];
}

export async function POST(request: Request) {
  // AI klic je drag + kreditni promet — zmerno omejimo po IP
  const limited = rateLimit(request, {
    limit: 6,
    windowMs: 3600000,
    key: "consultations:submit",
  });
  if (limited) return limited;

  let body: ConsultationRequest;
  try {
    body = (await request.json()) as ConsultationRequest;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  // === VALIDACIJA (zrcali client) ===
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json(
      { error: "Vpišite veljaven e-poštni naslov (nanj je vezan paket konzultacij)" },
      { status: 400 }
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name && (name.length < CONSULTATION_NAME_MIN || name.length > CONSULTATION_NAME_MAX)) {
    return NextResponse.json(
      { error: `Ime mora imeti ${CONSULTATION_NAME_MIN}–${CONSULTATION_NAME_MAX} znakov` },
      { status: 400 }
    );
  }

  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  if (
    question.length < CONSULTATION_QUESTION_MIN ||
    question.length > CONSULTATION_QUESTION_MAX
  ) {
    return NextResponse.json(
      {
        error: `Vprašanje mora imeti ${CONSULTATION_QUESTION_MIN}–${CONSULTATION_QUESTION_MAX} znakov (globja vprašanja dajo globje odgovore)`,
      },
      { status: 400 }
    );
  }

  const destinationName =
    typeof body.destinationName === "string"
      ? body.destinationName.trim()
      : "";
  if (
    destinationName &&
    !DESTINATIONS.some((d) => d.name === destinationName)
  ) {
    return NextResponse.json(
      { error: "Neznana destinacija — izberite eno izmed ponujenih" },
      { status: 400 }
    );
  }

  const travelDates =
    typeof body.travelDates === "string" ? body.travelDates.trim() : "";
  if (travelDates.length > CONSULTATION_DATES_MAX) {
    return NextResponse.json(
      { error: `Datumi: največ ${CONSULTATION_DATES_MAX} znakov` },
      { status: 400 }
    );
  }

  const partyDescription =
    typeof body.partyDescription === "string"
      ? body.partyDescription.trim()
      : "";
  if (partyDescription.length > CONSULTATION_PARTY_MAX) {
    return NextResponse.json(
      { error: `Druščina: največ ${CONSULTATION_PARTY_MAX} znakov` },
      { status: 400 }
    );
  }

  const budget = typeof body.budget === "string" ? body.budget.trim() : "";
  if (budget && !(CONSULTATION_BUDGETS as readonly string[]).includes(budget)) {
    return NextResponse.json(
      { error: "Neveljaven proračun — izberite enega izmed ponujenih" },
      { status: 400 }
    );
  }

  const interestsRaw = Array.isArray(body.interests) ? body.interests : [];
  const interests = [
    ...new Set(
      interestsRaw
        .filter((i): i is string => typeof i === "string")
        .map((i) => i.trim())
        .filter((i) => (CONSULTATION_INTERESTS as readonly string[]).includes(i))
    ),
  ];
  if (interests.length > CONSULTATION_INTERESTS_MAX) {
    return NextResponse.json(
      { error: `Izberite največ ${CONSULTATION_INTERESTS_MAX} zanimanj` },
      { status: 400 }
    );
  }

  try {
    // === KREDIT — poišči najstarejšega razpoložljivega za ta e-mail ===
    // (FIFO: najprej porabimo kredite iz najzgodnejšega nakupa)
    const credit = await db.consultationCredit.findFirst({
      where: { email, status: "available" },
      orderBy: { createdAt: "asc" },
      include: { order: true },
    });

    if (!credit) {
      // 402 Payment Required — klient odpre izbiro paketa (demo checkout)
      return NextResponse.json(
        {
          error:
            "Za ta e-poštni naslov ni razpoložljivih konzultacij — izberite paket.",
          code: "no_credit",
        },
        { status: 402 }
      );
    }

    // === KONTEKST + ODGOVOR ===
    const input = {
      question,
      destinationName: destinationName || null,
      travelDates: travelDates || null,
      partyDescription: partyDescription || null,
      budget: budget || null,
      interests,
    };

    const context = await buildConsultationContext(input.destinationName);
    const { answer, answerSource } = await generateConsultationAnswer(
      input,
      context
    );

    // Ujeti partnerji (samo iz konteksta, podanega AI — ista disciplinirana
    // ekstrakcija kot ask-local)
    const partners = extractConsultPartners(answer, context.items);

    // === SHRANI + OZNAČI KREDIT (transaction) ===
    // Token: 24 znakov naključja → nedoglediv zaseben dostop
    // (/konzultacija/{token}). Konzultacija ostane ZASEBNA (za razliko od
    // ask-local, ki je javni social proof — tu je kupec plačal za oseben
    // odgovor in njegovi podatki (datumi, proračun) niso javni).
    const consultation = await db.$transaction(async (tx) => {
      const created = await tx.consultation.create({
        data: {
          accessToken: randomId(24),
          email,
          question,
          destinationName: input.destinationName,
          travelDates: input.travelDates,
          partyDescription: input.partyDescription,
          budget: input.budget,
          interests: JSON.stringify(interests),
          answer,
          answerSource,
          recommendedPartners: JSON.stringify(partners),
          status: "delivered",
          deliveredAt: new Date(),
          orderNumber: credit.order?.orderNumber ?? null,
        },
      });

      await tx.consultationCredit.update({
        where: { id: credit.id },
        data: {
          status: "used",
          usedBy: created.id,
          usedAt: new Date(),
        },
      });

      return created;
    });

    // === B2B TRACKING (aiRecommendations + ListingEvent) ===
    // Stranski učinek — nikoli ne sesuje odgovora.
    await trackConsultationPartnerExposure(
      context.items.filter((i) => partners.some((p) => p.name === i.name))
    );

    // Preostali krediti za ta e-mail (klient jih lahko prikaže)
    const remaining = await db.consultationCredit.count({
      where: { email, status: "available" },
    });

    console.log(
      `[consultations] dostavljena (${answerSource}) — ${consultation.id}, preostalih kreditov: ${remaining}`
    );

    return NextResponse.json(
      {
        success: true,
        consultation: {
          id: consultation.id,
          accessToken: consultation.accessToken,
          email: consultation.email,
          question: consultation.question,
          destinationName: consultation.destinationName,
          travelDates: consultation.travelDates,
          partyDescription: consultation.partyDescription,
          budget: consultation.budget,
          interests,
          answer: consultation.answer,
          answerSource: consultation.answerSource,
          recommendedPartners: partners,
          deliveredAt: consultation.deliveredAt,
        },
        creditsRemaining: remaining,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[consultations] POST napaka:", error);
    return NextResponse.json(
      { error: "Konzultacije trenutno ni bilo mogoče pripraviti" },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET /api/consultations?email=… — stanje kreditov (honest upsell UI)
// ============================================================================
// Klient ob odpiranju dialoga preveri, ali ta e-pošta že ima kredite
// (npr. včeraj kupljen paket) → preskoči checkout in gre naravnost v
// vprašanje. Namerno prek e-pošte (query) namesto piškotka: paket, kupljen
// v drugem brskalniku/na drugi napravi, deluje enako (krediti so vezani
// na e-pošto).
// ============================================================================
export async function GET(request: Request) {
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: 3600000,
    key: "consultations:credits",
  });
  if (limited) return limited;

  try {
    const { searchParams } = new URL(request.url);
    const email = (searchParams.get("email") ?? "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ credits: 0, validEmail: false });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "Neveljaven e-poštni naslov" },
        { status: 400 }
      );
    }

    const credits = await db.consultationCredit.count({
      where: { email, status: "available" },
    });

    return NextResponse.json({ credits, validEmail: true });
  } catch (error) {
    console.error("[consultations] GET napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
