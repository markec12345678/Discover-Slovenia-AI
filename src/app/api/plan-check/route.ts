import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import {
  parsePlanText,
  checkParsedPlan,
  toItinerary,
  type PlanCheckLang,
} from "@/lib/plan-check";
import {
  buildPlanCheckReportProps,
  PLAN_CHECK_REPORTED_TYPE,
} from "@/lib/validator-stats";
import { buildLegRouteIndex } from "@/lib/road-routing-server";

// ============================================================================
// POST /api/plan-check — "Preveri svoj načrt" (F13)
// ============================================================================
//
// Uporabnik prilepi KATERIKOLI načrt ( ChatGPT/Mindtrip/Layla izvoz, ali
// svojega) → deterministično poročilo:
//   - parser: dnevi + postanki (ista baza vzorcev kot url-ingest, SL+EN,
//     tolerantna na končnice) + opcijski termini in začetni datum
//   - geo-validacija ( km/dan, noge, obseg, urnik, duplikati, zaprtja —
//     samo z znanim datumom)
//   - duplikati prek dnevov + cik-cak preureditev ( 2-opt/izčrpno)
//   - stroški vožnje ( gorivo + e-vinjeta)
//
// 0 AI žetonov ( čista logika + OSRM realne ceste, kot pri generiranju).
// Odprta javna pot → rate limit 10/min na IP ( enako kot ingest).
//
// Poštenost: preverimo SAMO postanke iz naših 38 destinacij (TASK 62:
// SI+HR+ME+AL) — če jih ne
// prepoznamo, vrnemo 422 in REČEMO ( ne izmišljujemo "podobnih" krajev).
//
// F17 ( javna telemetrija): ob USPEŠNO izračunanem poročilu strežnik
// zapiše agregatni dogodek ( samo števke, brez besedila načrta/PII) —
// fail-open: napaka pisanja NE vrže poročila. 422 zavrnitve se NE štejejo.
// ============================================================================

const MIN_TEXT_CHARS = 50;
const MAX_TEXT_CHARS = 20000;

export async function POST(request: Request) {
  // Odprta javna pot ( brez prijave) → dosleden rate limit
  const limited = rateLimit(request, {
    limit: 10,
    windowMs: 60000,
    key: "plan-check",
  });
  if (limited) return limited;

  let body: { text?: unknown; lang?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text : "";
  const lang: PlanCheckLang = body.lang === "en" ? "en" : "sl";

  if (text.trim().length < MIN_TEXT_CHARS) {
    return NextResponse.json(
      {
        error:
          lang === "en"
            ? `Paste the full plan text (at least ${MIN_TEXT_CHARS} characters).`
            : `Prilepi celotno besedilo načrta (vsaj ${MIN_TEXT_CHARS} znakov).`,
      },
      { status: 400 }
    );
  }
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json(
      {
        error:
          lang === "en"
            ? `The plan is too long (limit ${MAX_TEXT_CHARS} characters).`
            : `Načrt je predolg (omejitev ${MAX_TEXT_CHARS} znakov).`,
      },
      { status: 413 }
    );
  }

  // 1) Parser ( čista funkcija, brez omrežja)
  const parsed = parsePlanText(text);

  if (parsed.totalStops === 0) {
    // Poštena zavrnitev — NIČ izmišljevanja "podobnih" lokacij
    return NextResponse.json(
      {
        error:
          lang === "en"
            ? "I could not recognize any of our 22 curated Slovenian destinations in this text — so I won't guess. I can only verify stops I have real data for (Bled, Ljubljana, Piran, Soča valley …)."
            : "V tem besedilu nisem prepoznal nobene od naših 22 skrbno vzdrževanih slovenskih destinacij — zato ne ugibam. Preverim lahko samo postanke, za katere imamo prave podatke (Bled, Ljubljana, Piran, Soška dolina …).",
        dayHeadersFound: parsed.dayHeadersFound,
      },
      { status: 422 }
    );
  }

  // 2) OSRM noge ( realne ceste, predpomnilnik + varovalka; fail-open na
  //    hevristiko — poročilo metodo razkrije v validation.method)
  let legs;
  try {
    legs = await buildLegRouteIndex(toItinerary(parsed));
  } catch (e) {
    // noge niso kritične — nadaljuj brez njih ( hevristika)
    console.error("[plan-check] buildLegRouteIndex napaka:", e);
  }

  // 3) Celotno poročilo ( validator + dodatna preverjanja + viri)
  const report = checkParsedPlan(parsed, lang, legs);

  // 4) F17 — javna telemetrija: en dogodek na DOKONČANO preverjanje
  //    ( številke za javno stran "Koliko napak ujame naš preverjevalnik").
  //    await je namenoma ( serverless: obljuba preživi samo do odgovora).
  try {
    await db.analyticsEvent.create({
      data: {
        type: PLAN_CHECK_REPORTED_TYPE,
        metadata: JSON.stringify({
          props: buildPlanCheckReportProps(report),
          path: "/api/plan-check",
        }),
      },
    });
  } catch (e) {
    console.error("[plan-check] telemetry write napaka:", e); // fail-open
  }

  return NextResponse.json(report, { status: 200 });
}
