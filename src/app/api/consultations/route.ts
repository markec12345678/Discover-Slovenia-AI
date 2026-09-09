import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { randomId } from "@/lib/security";
import { sendEmail, isEmailDemo } from "@/lib/email";
import { consultationDeliveryEmail } from "@/lib/email-templates";
import { DESTINATIONS } from "@/lib/slovenia-data";
import {
  CONSULTATION_BUDGETS,
  CONSULTATION_INTERESTS,
  CONSULTATION_INTERESTS_MAX,
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
// POST /api/consultations — BREZPLAČNA globoka osebna konzultacija
// ============================================================================
// Model „ponudniki plačajo" (Faza 3c — kot Booking.com): uporabnik NE
// plačuje za svet. Monetizacija poteka na strani ponudnikov — globoka
// konzultacija citira premium partnerje (B2B flywheel: aiRecommendations
// + ListingEvent) in rezervacije, ki iz nje izhajajo, so atribuirane
// (Booking.source = "consultation") → ponudnik vidi vrednost, ki jo
// plača prek premium naročnine.
//
// Pot:
//   1. validacija (vsa polja, interesi/proračun iz fiksnih seznamov),
//   2. dnevna meja na e-pošto (3/dan — varuje AI stroške, ne prihodek),
//   3. kontekst iz baze (premium-aware) → AI globok odgovor (grounded)
//      oz. iskren programski fallback,
//   4. odgovor shranjen + zaseben accessToken (/konzultacija/{token}),
//      B2B tracking citiranih partnerjev + dostavna e-pošta (fire-and-forget).
// ============================================================================

/** Dnevna meja globoke konzultacije na e-pošto (AI stroški, ne prihodek). */
const DAILY_CONSULTATIONS = 3;

/** Začetek »danes« po Ljubljani (DST-varno — isti trik kot /api/ask-local). */
function startOfTodayLjubljana(): Date {
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Ljubljana",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day)
  );
  const secondsSinceMidnight =
    Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  return new Date(asUTC - secondsSinceMidnight * 1000);
}

interface ConsultationRequest {
  email?: string;
  question?: string;
  destinationName?: string;
  travelDates?: string;
  partyDescription?: string;
  budget?: string;
  interests?: string[];
}

export async function POST(request: Request) {
  // AI klic je drag — zmerno omejimo po IP (zloraba-varovalka)
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
      { error: "Vpišite veljaven e-poštni naslov — nanj prejmete zasebno povezavo do odgovora" },
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
        error: `Vprašanje mora imeti ${CONSULTATION_QUESTION_MIN}–${CONSULTATION_QUESTION_MAX} znakov (globja vprašanja dajejo globje odgovore)`,
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
    typeof body.partyDescription === "string" ? body.partyDescription.trim() : "";
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
    // === DNEVNA MEJA NA E-POŠTO (3/dan — poštena varovalka AI stroškov) ===
    const usedToday = await db.consultation.count({
      where: { email, createdAt: { gte: startOfTodayLjubljana() } },
    });
    if (usedToday >= DAILY_CONSULTATIONS) {
      return NextResponse.json(
        {
          error: `Za danes si že izkoristil ${DAILY_CONSULTATIONS} osebne konzultacije na ta e-poštni naslov — nadaljuj jutri. Prejšnji odgovori so shranjeni na tvoji zasebni povezavi.`,
          code: "daily_consultation_limit",
        },
        { status: 429 }
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

    // === SHRANI (zaseben dostop prek /konzultacija/{token}) ===
    // Konzultacija ostaja ZASEBNA (osebni podatki kupca niso javni — za
    // razliko od ask-local, ki je javni social proof).
    const consultation = await db.consultation.create({
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
      },
    });

    // === B2B TRACKING (aiRecommendations + ListingEvent) ===
    // Stranski učinek — nikoli ne sesuje odgovora.
    await trackConsultationPartnerExposure(
      context.items.filter((i) => partners.some((p) => p.name === i.name))
    );

    console.log(
      `[consultations] dostavljena (${answerSource}) — ${consultation.id}`
    );

    // === E-POŠTA: dostava z zasebno povezavo (fire-and-forget — enak
    // vzorec kot /api/checkout; e-pošta ne sme seseti odgovora) ===
    // Obiskovalec lahko brskalnik zapre pred kopiranjem povezave — e-pošta
    // je edina zanesljiva pot nazaj do odgovora (tudi brezplačnega).
    try {
      const mail = consultationDeliveryEmail({
        token: consultation.accessToken,
        question,
        destinationName: input.destinationName,
      });
      void sendEmail({
        to: email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      })
        .then((sent) => {
          console.log(
            `[consultations] dostavna povezava ${consultation.id} → ${email}: ${
              sent ? "poslana" : "NEUSPEŠNA"
            } (email demo: ${isEmailDemo()}).`
          );
        })
        .catch(() => {
          // email ne sme spremeniti odgovora API-ja
        });
    } catch (mailError) {
      console.error("[consultations] priprava dostavnega emaila:", mailError);
    }

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
