import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { generateCompletion } from "@/lib/ai-client";
import {
  answerPlanQuestion,
  buildPlanFacts,
  renderFactsSheet,
  buildUnknownAnswer,
  type PlanForecastDay,
  type PlanLang,
} from "@/lib/plan-qa";
import {
  fetchDailyForecast,
  weatherCodeToText,
  weatherCodeToTextEn,
} from "@/lib/weather-utils";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { Itinerary, PlannerInput } from "@/lib/types";

// ============================================================================
// POST /api/itinerary/ask — F9 "Pogovor z načrtom" (MindTrip chat-first,
// naša izvedba: številke so VEDNO izračunane, AI le sfrazi)
// ============================================================================
//
// Vrstni red obravnave vprašanja:
//   1. DETERMINISTIČNO (plan-qa.ts): namen se prepona z regex vzorci
//      (SL+EN), odgovor se sestavi iz ISTE plasti kot prikaz (geo-validacija,
//      stroški vožnje F5.3, pakirni seznam F6.1). Deluje tudi brez AI
//      žetonov — kot hitre akcije refine. Vir: "computed".
//   2. AI (samo če namen ni prepoznan): vprašanje + TEKSTOVNI LIST DEJSTEV
//      gresta k LLM s STROGIM sistemskim navodilom — odgovarja IZKLJUČNO
//      iz dejstev; če dejstva ne vsebujejo odgovora, to izrecno pove.
//      Vir: "puter" | "z-ai-sdk" (razkrit v UI).
//   3. Iskren fallback (AI ni dosegljiv): sporočilo, da ne more odgovoriti
//      iz dejstev in da ne bo ugibal + primeri vprašanj. Vir: "fallback".
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

/** Zgornja meja AI izpisa (kratki pogovorni odgovori, ne eseji).
 * F10: 600 → 1024 — Gemini thinking modeli porabijo del proračuna za
 * notranje razmišljanje; 600 je pri 4-povednih odgovorih rezalo vsebino. */
const AI_MAX_TOKENS = 1024;

export async function POST(request: Request) {
  const limited = rateLimit(request, {
    limit: 20,
    windowMs: 600000,
    key: "itinerary-ask",
  });
  if (limited) return limited;

  let body: AskRequest;
  try {
    body = (await request.json()) as AskRequest;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  const itinerary = body?.itinerary;
  if (!itinerary || !Array.isArray(itinerary.days) || itinerary.days.length === 0) {
    return NextResponse.json(
      { error: "Manjka itinerer (itinerary.days)" },
      { status: 400 }
    );
  }

  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < 3) {
    return NextResponse.json(
      { error: "Manjka ali prekratko vprašanje (vsaj 3 znaki)" },
      { status: 400 }
    );
  }
  if (question.length > QUESTION_MAX) {
    return NextResponse.json(
      { error: `Vprašanje je predolgo (max ${QUESTION_MAX} znakov)` },
      { status: 400 }
    );
  }

  const formData = body.formData ?? null;
  const lang: PlanLang = formData?.language === "en" ? "en" : "sl";
  const isEn = lang === "en";

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
  // 2. AI POT — vprašanje + list dejstev, STROGO prizemljen odgovor
  // -----------------------------------------------------------------------
  const facts = buildPlanFacts(itinerary, formData, lang);
  const sheet = renderFactsSheet(facts, lang);

  const systemPrompt = isEn
    ? `You are a concise, honest travel-planning assistant. The user has a generated Slovenia itinerary and asks a question about IT.

STRICT GROUNDING RULES:
- Answer ONLY from the PLAN FACTS provided. Every number must come from the facts — never invent distances, prices, times or weather.
- If the facts do not contain the answer, say so explicitly and point to what you can answer (driving/km, costs, busiest day, a specific day, weather in the plan, packing, feasibility warnings).
- Do NOT recommend new destinations — this is a Q&A about the existing plan. For changes, the user has an "Adjust the itinerary" tool.
- Max 4 short sentences. Plain text, no markdown, no lists longer than 5 items.
- Disclose limits: attraction costs exclude accommodation/food; weather values are plan estimates, not a live forecast (unless stated otherwise in the facts).`
    : `Si jedrnati, iskren pomočnik za načrtovanje potovanj. Uporabnik ima generiran slovenski itinerer in zastavi vprašanje O NJEM.

STROGA PRAVILA PRIZEMLJENOSTI:
- Odgovarjaj IZKLJUČNO iz PODATKOV O NAČRTU, ki so ti dani. Vsaka številka mora priti iz teh dejstev — nikoli ne izumi razdalj, cen, časov ali vremena.
- Če dejstva ne vsebujejo odgovora, to IZRECNO povej in napoti na to, na kar lahko odgovoriš (vožnja/km, stroški, najbolj natrpan dan, posamezen dan, vreme v načrtu, pakiranje, opozorila o izvedljivosti).
- NE predlagaj novih destinacij — to je vprašanje o obstoječem načrtu. Za spremembe ima uporabnik orodje „Prilagodi itinerer“.
- Največ 4 kratke povedi. Navadno besedilo, brez markdowna, seznami največ 5 postavk.
- Razkrivaj meje: stroški atrakcij NE vsebujejo nočitev/hrane; vrednosti vremena so ocene načrta, ne živa napoved (razen če dejstva izrecno pravijo drugače).`;

  const userPrompt = isEn
    ? `${sheet}

USER QUESTION:
"${question}"

Answer (only from the facts above):`
    : `${sheet}

VPRAŠANJE UPORABNIKA:
"${question}"

Odgovor (samo iz dejstev zgoraj):`;

  try {
    const result = await generateCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.3, maxTokens: AI_MAX_TOKENS }
    );

    const content = result?.content?.trim();
    if (result && content) {
      console.log(
        `[itinerary/ask] AI odgovor (${result.source}) — vprašanje: "${question.slice(0, 80)}"`
      );
      return NextResponse.json({
        answer: content.slice(0, 2000),
        intent: "ai",
        source: result.source,
      });
    }
    throw new Error("Prazen odgovor AI");
  } catch (error) {
    // ---------------------------------------------------------------------
    // 3. ISKREN FALLBACK — ne morem odgovoriti, ne bom ugibal
    // ---------------------------------------------------------------------
    console.error("[itinerary/ask] AI napaka:", error);
    return NextResponse.json({
      answer: buildUnknownAnswer(lang),
      intent: "unknown",
      source: "fallback",
    });
  }
}

// ---------------------------------------------------------------------------
// Živa napoved, poravnana z dnevi načrta (samo z znanim datumom odhoda
// znotraj horizonta; sicer null — ne izmišljujemo "napovedi")
// ---------------------------------------------------------------------------

async function buildForecastForItinerary(
  itinerary: Itinerary,
  lang: "sl" | "en"
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
    text:
      lang === "en"
        ? weatherCodeToTextEn(f.weatherCode)
        : weatherCodeToText(f.weatherCode),
    tempMax: f.tempMax,
    rainProb: f.precipitationProbabilityMax,
  }));
}
