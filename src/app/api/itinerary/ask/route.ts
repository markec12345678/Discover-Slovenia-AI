import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  answerPlanQuestion,
  buildUnknownAnswer,
  type PlanForecastDay,
  type PlanLang,
} from "@/lib/plan-qa";
import {
  fetchDailyForecast,
  weatherCodeToTextFor,
} from "@/lib/weather-utils";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { PL, type PlannerLang } from "@/lib/planner-lang";
import type { Itinerary, PlannerInput } from "@/lib/types";

// ============================================================================
// POST /api/itinerary/ask — F9 "Pogovor z načrtom" (MindTrip chat-first,
// naša izvedba: številke so VEDNO izračunane)
// ============================================================================
//
// ISSUE #9 (ZERO-AI / deterministic-first): AI noga (LLM fraziranje za
// neprepoznane namene) je ODSTRANJENA. Vrstni red obravnave vprašanja:
//   1. DETERMINISTIČNO (plan-qa.ts): namen se prepozna z regex vzorci
//      (SL+EN), odgovor se sestavi iz ISTE plasti kot prikaz (geo-validacija,
//      stroški vožnje F5.3, pakirni seznam F6.1). 0 AI žetonov, 0 omrežja
//      (razen žive napovedi za vremenska vprašanja). Vir: "computed".
//   2. Iskren odklon (namen ni prepoznan): sporočilo, da ne more odgovoriti
//      iz dejstev in da ne bo ugibal + primeri vprašanj. Vir: "fallback".
// NAMERNO brez LLM: dobro definirana množica namenov + iskrena odklonitev
// je zanesljivejša od generiranega ugibanja (Issue #9 §7/§47).
//
// Vremenska vprašanja: če ima načrt datum odhoda znotraj ~16-dnevnega
// horizonta, strežnik pridobi ŽIVO napoved (Open-Meteo, isti vir kot
// pakirni seznam) in odgovor vključi verjetnosti padavin po dnevih.
// ============================================================================

interface AskRequest {
  itinerary?: Itinerary;
  formData?: PlannerInput;
  question?: string;
}

const QUESTION_MAX = 500;

export async function POST(request: Request) {
  const limited = rateLimit(request, {
    limit: 20,
    windowMs: 600000,
    key: "itinerary-ask",
  });
  if (limited) return limited;

  let rawBody = "";
  let body: AskRequest;
  try {
    rawBody = await request.text();
    body = JSON.parse(rawBody) as AskRequest;
  } catch {
    // Jezikovna oznaka je običajno berljiva tudi iz neveljavnega telesa
    // (isti peek vzorec kot /api/itinerary — W1-2b-1).
    // W12-faza-2b: fr/es v peek vzorcu (6-jezična planner ploskev).
    const peek = rawBody.match(/"language"\s*:\s*"(en|it|de|fr|es)"/);
    const peekLang = peek ? (peek[1] as PlannerLang) : "sl";
    return NextResponse.json(
      { error: PL(peekLang, { sl: "Neveljaven JSON", en: "Invalid JSON", it: "JSON non valido", de: "Ungültiges JSON", fr: "JSON invalide", es: "JSON no válido" }) },
      { status: 400 }
    );
  }

  // Jezik napak + odgovorov — podani jezik (W1-2b-2: 4-jezično;
  // W12-faza-2b: 6-jezično fr/es); manjkajoč/neprepoznan → SL
  // (nazaj-kompatibilno).
  const errLang: PlannerLang =
    (body as Partial<AskRequest> | null)?.formData?.language === "en" ||
    (body as Partial<AskRequest> | null)?.formData?.language === "it" ||
    (body as Partial<AskRequest> | null)?.formData?.language === "de" ||
    (body as Partial<AskRequest> | null)?.formData?.language === "fr" ||
    (body as Partial<AskRequest> | null)?.formData?.language === "es"
      ? ((body as Partial<AskRequest>).formData!.language as PlannerLang)
      : "sl";

  const itinerary = body?.itinerary;
  if (!itinerary || !Array.isArray(itinerary.days) || itinerary.days.length === 0) {
    return NextResponse.json(
      { error: PL(errLang, { sl: "Manjka itinerer (itinerary.days)", en: "Missing itinerary (itinerary.days)", it: "Itinerario mancante (itinerary.days)", de: "Reiseplan fehlt (itinerary.days)", fr: "Itinéraire manquant (itinerary.days)", es: "Falta el itinerario (itinerary.days)" }) },
      { status: 400 }
    );
  }

  // CAP-FIX (revizija 1.33.0, 16-c P2 — token-bomb): itinerer je client-
  // supplied in neomejen → list facts sheet v promptu. Zdaj: JSON ≤ 100 KB
  // (enako mejo ima itinerary/save za persistenco).
  if (JSON.stringify(itinerary).length >= 100_000) {
    return NextResponse.json(
      { error: PL(errLang, { sl: "Itinerer je prevelik za analizo", en: "Itinerary is too large to analyze", it: "L'itinerario è troppo grande per l'analisi", de: "Der Reiseplan ist für die Analyse zu groß", fr: "L'itinéraire est trop volumineux pour être analysé", es: "El itinerario es demasiado grande para analizarlo" }) },
      { status: 400 }
    );
  }

  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < 3) {
    return NextResponse.json(
      { error: PL(errLang, { sl: "Manjka ali prekratko vprašanje (vsaj 3 znaki)", en: "Missing or too short question (at least 3 characters)", it: "Domanda mancante o troppo breve (almeno 3 caratteri)", de: "Frage fehlt oder ist zu kurz (mind. 3 Zeichen)", fr: "Question manquante ou trop courte (au moins 3 caractères)", es: "Pregunta faltante o demasiado corta (al menos 3 caracteres)" }) },
      { status: 400 }
    );
  }
  if (question.length > QUESTION_MAX) {
    return NextResponse.json(
      { error: PL(errLang, { sl: `Vprašanje je predolgo (max ${QUESTION_MAX} znakov)`, en: `Question is too long (max ${QUESTION_MAX} characters)`, it: `La domanda è troppo lunga (max ${QUESTION_MAX} caratteri)`, de: `Die Frage ist zu lang (max. ${QUESTION_MAX} Zeichen)`, fr: `La question est trop longue (max ${QUESTION_MAX} caractères)`, es: `La pregunta es demasiado larga (máx. ${QUESTION_MAX} caracteres)` }) },
      { status: 400 }
    );
  }

  const formData = body.formData ?? null;
  const lang: PlanLang =
    formData?.language === "en" ||
    formData?.language === "it" ||
    formData?.language === "de" ||
    formData?.language === "fr" ||
    formData?.language === "es"
      ? formData.language
      : "sl";

  // -----------------------------------------------------------------------
  // 1. DETERMINISTIČNA POT (brez AI — primarna)
  // -----------------------------------------------------------------------
  const baseInput: Parameters<typeof answerPlanQuestion>[0] = {
    question,
    itinerary,
    input: formData,
    lang,
  };
  const deterministic = answerPlanQuestion(baseInput);

  if (deterministic && deterministic.intent !== "weather") {
    return NextResponse.json({
      answer: deterministic.text,
      intent: deterministic.intent,
      source: "computed",
    });
  }

  // Vremensko vprašanje: poskusi obogatiti z ŽIVO napovedjo (če je odhod
  // znotraj horizonta Open-Meteo ~16 dni in so koordinate znane).
  if (deterministic && deterministic.intent === "weather") {
    const forecast = await buildForecastForItinerary(itinerary, lang);
    if (forecast) {
      const enriched = answerPlanQuestion({ ...baseInput, forecast });
      if (enriched) {
        return NextResponse.json({
          answer: enriched.text,
          intent: enriched.intent,
          source: "computed",
          forecastDays: forecast.length,
        });
      }
    }
    return NextResponse.json({
      answer: deterministic.text,
      intent: deterministic.intent,
      source: "computed",
    });
  }

  // -----------------------------------------------------------------------
  // 2. ISKREN ODKLON — namen ni prepoznan: ne morem odgovoriti, ne bom
  //    ugibal (ISSUE #9: LLM fraziranje bi lahko izmislilo številko;
  //    podprta množica namenov je eksplicitna in razširljiva v plan-qa.ts)
  // -----------------------------------------------------------------------
  return NextResponse.json({
    answer: buildUnknownAnswer(lang),
    intent: "unknown",
    source: "fallback",
  });
}

// ---------------------------------------------------------------------------
// Živa napoved, poravnana z dnevi načrta (samo z znanim datumom odhoda
// znotraj horizonta; sicer null — ne izmišljujemo "napovedi")
// ---------------------------------------------------------------------------

async function buildForecastForItinerary(
  itinerary: Itinerary,
  lang: PlannerLang
): Promise<PlanForecastDay[] | null> {
  const startISO = itinerary?.tripStartDate;
  if (!startISO || !/^\d{4}-\d{2}-\d{2}$/.test(startISO)) return null;

  // Predstavitvena točka: prvi postanek z znanimi koordinatami
  let coords: { lat: number; lng: number } | null = null;
  outer: for (const day of itinerary.days) {
    for (const loc of day?.locations ?? []) {
      const dest = DESTINATIONS.find((d) => d.id === loc?.destination_id);
      if (dest?.coords) {
        coords = dest.coords;
        break outer;
      }
    }
  }
  if (!coords) return null;

  const days = itinerary.days.length;
  const forecast = await fetchDailyForecast(
    coords.lat,
    coords.lng,
    days,
    startISO
  );
  if (!forecast || forecast.length === 0) return null;

  return forecast.map((f, i) => ({
    day: i + 1,
    text: weatherCodeToTextFor(lang, f.weatherCode),
    tempMax: f.tempMax,
    rainProb: f.precipitationProbabilityMax,
  }));
}
