import { NextResponse } from "next/server";
import { DESTINATIONS, normalizeInterests } from "@/lib/slovenia-data";
import { DESTINATIONS_EN } from "@/lib/slovenia-data-en";
import { db } from "@/lib/db";
import { generateCompletion } from "@/lib/ai-client";
import { rankListings, buildTransparencyContext } from "@/lib/ranking-engine";
import type { Itinerary, PlannerInput, DayPlan, LocationVisit } from "@/lib/types";
import { rateLimit } from "@/lib/rate-limit";
import {
  fetchDailyForecast,
  weatherCodeToText,
  weatherCodeToTextEn,
  type DailyForecast,
} from "@/lib/weather-utils";
import { PARTY_TYPES, PARTY_PROMPT_LABELS } from "@/lib/party-types";
import { PACES, PACE_PROMPT_LABELS, PACE_FALLBACK } from "@/lib/pace-types";
import {
  buildCrowdNotices,
  tripOverlapsPeakWeekend,
} from "@/lib/crowd-alternatives";
import { matchEventsForItinerary } from "@/lib/events-match";
import {
  isValidStartDate,
  parseISODateLocal,
  tripEndDateISO,
  tripWindowMs,
  formatDateRangeSI,
} from "@/lib/trip-dates";
import {
  buildPackingList,
  sanitizeAiPackingList,
} from "@/lib/packing-list";
import {
  buildFallbackRationale,
  computeItineraryQuality,
  recomputeTotalBudget,
  sanitizeAiRationale,
} from "@/lib/itinerary-quality";
import { validateItineraryGeo } from "@/lib/geo-validation";
import { buildStopReasons } from "@/lib/stop-insights";
import { dayRouteGeometry, serializeLegs } from "@/lib/road-routing";
import { buildLegRouteIndex } from "@/lib/road-routing-server";

// ============================================================================
// WEATHER-CONTEXT (t11): realna vremenska napoved PRED generiranjem
// ============================================================================
//
// Prej je AI načrtoval "slep" — realna Open-Meteo prognoza je prišla ŠTEJ
// generiranju (samo prepisala prikaz). Zdaj za znano okno potovanja
// (startDate znotraj prognoznega horizonta ~16 dni) pridobimo napoved za
// tri regionalna sidra VZPOREDNO z ranking engine (brez dodatne latence)
// in jo podamo AI kot DEJSTVO: deževen dan → notranje aktivnosti tisti dan.
//
// Brez startDate napoved NE gre v prompt: "3 dnevi poleti" brez datuma se
// načrtuje sezonsko — današnja napoved za neznani datum bi bila zavajajoča.
// Vir ostaja pošten: realna napoved Open-Meteo po regijah, brez izmišljenih
// statusov.

interface AnchorForecast {
  /** SL oznaka regije za prompt */
  label: string;
  /** EN oznaka regije za prompt */
  labelEn: string;
  forecast: DailyForecast[];
}

// Tri regionalna sidra — Gorenjska/alpi, osrednja Slovenija, obala.
// Koordinate pridejo IZ slovenia-data (enosoten vir resnice o destinacijah);
// če bi id kdaj izginil iz podatkov, se sidro tiho preskoči.
const WEATHER_ANCHOR_DEFS = [
  { id: "bled", label: "Gorenjska (Bled)", labelEn: "Gorenjska/Alps (Bled)" },
  {
    id: "ljubljana",
    label: "Osrednja Slovenija (Ljubljana)",
    labelEn: "Central Slovenia (Ljubljana)",
  },
  { id: "piran", label: "Obala (Piran)", labelEn: "Coast (Piran)" },
] as const;

/**
 * Pridobi napovedi za vsa tri sidra (vsak fetch ima svoj 4s timeout +
 * 15-min cache; fetchDailyForecast interno nikoli ne vrže — vrne null).
 * Brez startDate vrne prazno (ni "realne napovedi za tvoje datume").
 */
async function fetchAnchorForecasts(
  days: number,
  startDate?: string
): Promise<AnchorForecast[]> {
  if (!startDate) return [];

  const anchors: AnchorForecast[] = [];
  await Promise.all(
    WEATHER_ANCHOR_DEFS.map(async (def) => {
      const dest = DESTINATIONS.find((d) => d.id === def.id);
      if (!dest) return;
      const forecast = await fetchDailyForecast(
        dest.coords.lat,
        dest.coords.lng,
        days,
        startDate
      );
      if (forecast) {
        anchors.push({ label: def.label, labelEn: def.labelEn, forecast });
      }
    })
  );
  return anchors;
}

/** Ena vrstica na dan: "- Dan 1 (2026-10-03): Gorenjska (Bled): dež 75 %, 17 °C · ..." */
function buildWeatherPromptLines(
  anchors: AnchorForecast[],
  lang: "sl" | "en"
): string[] {
  const maxLen = anchors.reduce((m, a) => Math.max(m, a.forecast.length), 0);
  const lines: string[] = [];
  for (let i = 0; i < maxLen; i++) {
    const withData = anchors.filter((a) => a.forecast[i]);
    if (withData.length === 0) continue;
    const date = withData[0].forecast[i].date;
    const parts = withData.map((a) => {
      const f = a.forecast[i];
      const cond =
        lang === "en"
          ? weatherCodeToTextEn(f.weatherCode)
          : weatherCodeToText(f.weatherCode);
      const precip =
        f.precipitationProbabilityMax != null
          ? ` ${f.precipitationProbabilityMax} %`
          : "";
      return `${lang === "en" ? a.labelEn : a.label}: ${cond}${precip}, ${Math.round(f.tempMax)} °C`;
    });
    lines.push(
      `- ${lang === "en" ? `Day ${i + 1}` : `Dan ${i + 1}`} (${date}): ${parts.join(" · ")}`
    );
  }
  return lines;
}

/**
 * Deževen dan za fallback: večina sidra (≥ 2 od tistih s podatki) kaže
 * ≥ 60 % verjetnost padavin. Konservativno — fallback ne pozna regije
 * dneva, zato preureja samo izrazito mokre dneve.
 */
function isRainyDay(anchors: AnchorForecast[], dayIndex: number): boolean {
  const withData = anchors.filter((a) => a.forecast[dayIndex]);
  if (withData.length < 2) return false;
  const rainy = withData.filter(
    (a) => (a.forecast[dayIndex].precipitationProbabilityMax ?? 0) >= 60
  ).length;
  return rainy >= 2;
}

// POST /api/itinerary - generira AI itinerer z z-ai-web-dev-sdk
// AI prioritizira SPONZORIRANE lokale (premium/enterprise stranke ki plačajo za vključitev)
export async function POST(request: Request) {
    // Rate limit AI itinererjev (drag endpoint)
    const limited = rateLimit(request, { limit: 10, windowMs: 600000, key: "itinerary" });
    if (limited) return limited;

  let input: PlannerInput;
  try {
    input = (await request.json()) as PlannerInput;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  // Validacija
  if (
    !input?.budget ||
    !input?.days ||
    !input?.interests?.length ||
    !input?.season ||
    !input?.groupSize
  ) {
    return NextResponse.json(
      { error: "Manjkajo obvezna polja: budget, days, interests, season, groupSize" },
      { status: 400 }
    );
  }

  if (input.days < 1 || input.days > 14) {
    return NextResponse.json(
      { error: "Število dni mora biti med 1 in 14" },
      { status: 400 }
    );
  }

  // WEATHER-CONTEXT: tip potne skupine — opcijsko (stari odjemalci ga ne
  // pošiljajo), a če JE podan, mora biti iz dovoljenega nabora
  if (
    input.partyType !== undefined &&
    !PARTY_TYPES.includes(input.partyType)
  ) {
    return NextResponse.json(
      { error: "Tip potne skupine je neveljaven (couple, family, friends, solo)" },
      { status: 400 }
    );
  }

  // F15 (backlog #3): tempo potovanja — opcijsko (nazaj kompatibilno);
  // če JE podan, mora biti iz dovoljenega nabora
  if (input.pace !== undefined && !PACES.includes(input.pace)) {
    return NextResponse.json(
      { error: "Tempo potovanja je neveljaven (slow, balanced, fast)" },
      { status: 400 }
    );
  }

  // FW4.2: datum odhoda — opcijsko; če je podan, mora biti veljaven (ISO,
  // ne v preteklosti, max ~400 dni naprej). Neveljaven → jasna napaka 400.
  if (input.startDate !== undefined && !isValidStartDate(input.startDate)) {
    return NextResponse.json(
      { error: "Datum odhoda je neveljaven (ISO format, ne v preteklosti, max 400 dni naprej)" },
      { status: 400 }
    );
  }

  // FW4.2: okvir potovanja (za datumski events match) + končni datum
  const tripWindow = input.startDate
    ? tripWindowMs(input.startDate, input.days)
    : null;
  const tripEnd = input.startDate
    ? tripEndDateISO(input.startDate, input.days) ?? undefined
    : undefined;

  // TAG-ALIGN (P1, recenzija Faze 4): normalizacija interesov na meji —
  // "kulinarika" (NLP parser, stari shranjeni načrti, onboarding profil)
  // → kanonični "hrana", ki se ujema z bestFor destinacij. Pred popravkom
  // je fallback ocenjevalnik izbire "Hrana & vino" tiho ignoriral.
  input = { ...input, interests: normalizeInterests(input.interests) };

  // F5.4 ("Začni s povezavo"): zaželene destinacije iz prilepljene povezave —
  // opcijsko; sanitizacija na meji ( samo znani ID-ji, največ 8, dedupe).
  // Neznan ID se tiho očisti ( fallback ocenjevalnik bi ga preskočil že tako;
  // AI prompt ne nosi smeti). Nazaj kompatibilno: brez polja = enako kot prej.
  if (Array.isArray(input.preferredDestinations)) {
    const seenIds = new Set<string>();
    const cleanPreferred: string[] = [];
    for (const id of input.preferredDestinations) {
      if (
        typeof id === "string" &&
        !seenIds.has(id) &&
        DESTINATIONS.some((d) => d.id === id)
      ) {
        seenIds.add(id);
        cleanPreferred.push(id);
      }
    }
    input =
      cleanPreferred.length > 0
        ? { ...input, preferredDestinations: cleanPreferred.slice(0, 8) }
        : { ...input, preferredDestinations: undefined };
  }

  // Pripravi kontekst destinacij za AI
  // F5.5: vrstica o odpiralnih časih ( SAMO preverjeni vnosi — vir AI pove
  // izrecno, da ne ugiba o urnikih; brez vnosa destinacija nima omejitve)
  const destContext = DESTINATIONS.map(
    (d) =>
      `- ${d.id} (${d.name}): ${d.type}/${d.region}, ${d.duration}, €${d.costPerPerson}/osebo, ocena ${d.rating}, aktivnosti: ${d.activities.join(", ")}. Najboljše za: ${d.bestFor.join(", ")}. Sezona: ${d.bestSeason.join(", ")}${d.opening ? `. Odpiralni čas (vir ${d.opening.source}): ${d.opening.note}` : ""}`
  ).join("\n");

  // FW4.3: jezik AI izpisa — client pošlje locale ("en" → angleški
  // itinerer za tuje obiskovalce; vse ostalo logiko ostaja enako).
  // Zdaj pred ranking klicem — partner kontekst (t12 faza 1) nosi jezikovno
  // odvisne praktične podatke (sezona/vreme/parkiranje).
  const lang = input.language === "en" ? "en" : "sl";

  // === RANKING ENGINE + WEATHER-CONTEXT (vzporedno — vreme ne doda latence) ===
  // Ranking: relevance (60%) + quality (15%) + rating (10%) + distance (10%) + premium (5%)
  // Vreme: realna napoved za tri regionalna sidra — SAMO če je podan
  // startDate (znano okno potovanja znotraj horizonta ~16 dni)
  let partnerContext = "";

  const [ranked, anchorForecasts] = await Promise.all([
    rankListings({
      interests: input.interests,
      season: input.season,
    }).catch((e) => {
      console.error("[itinerary] ranking engine napaka:", e);
      return [] as Awaited<ReturnType<typeof rankListings>>;
    }),
    fetchAnchorForecasts(input.days, input.startDate),
  ]);

  if (ranked.length > 0) {
    partnerContext = buildTransparencyContext(ranked, 15, lang);
    console.log(`[itinerary] Ranking engine: ${ranked.length} kandidatov, top: ${ranked[0].listing.name} (Q:${ranked[0].qualityScore})`);
  }
  if (anchorForecasts.length > 0) {
    console.log(
      `[itinerary] Vreme briefing: ${anchorForecasts.length}/${WEATHER_ANCHOR_DEFS.length} sidra, ${anchorForecasts[0].forecast.length} dni${input.startDate ? ` (od ${input.startDate})` : ""}`
    );
  }

  // (lang je izračunan že pred ranking klicem — glej zgoraj)

  // === WEATHER-CONTEXT: pravo vreme + sestava potnikov v prompt ===
  // Oba dela sta OPCIJSKA (nazaj kompatibilno): brez startDate ni realne
  // napovedi za tvoje datume, brez partyType pa AI dobi samo številko.
  const hasWeather = anchorForecasts.length > 0;
  const partyLabels = input.partyType
    ? PARTY_PROMPT_LABELS[input.partyType]
    : null;

  const partyLineSl = partyLabels ? `\n- Sestava: ${partyLabels.sl}` : "";
  const partyLineEn = partyLabels ? `\n- Travel party: ${partyLabels.en}` : "";
  // F15: tempo potovanja v prompt (opcijsko — brez polja AI dobi privzeti
  // umerjen ritem, kot doslej)
  const paceLabels = input.pace ? PACE_PROMPT_LABELS[input.pace] : null;
  const paceLineSl = paceLabels ? `\n- Tempo potovanja: ${paceLabels.sl}` : "";
  const paceLineEn = paceLabels ? `\n- Travel pace: ${paceLabels.en}` : "";
  const weatherBlockSl = hasWeather
    ? `\nREALNA VREMENSKA NAPOVED (Open-Meteo) za tvoje datume — po regijah:\n${buildWeatherPromptLines(anchorForecasts, "sl").join("\n")}\n`
    : "";
  const weatherBlockEn = hasWeather
    ? `\nREAL FORECAST (Open-Meteo) for your dates — by region:\n${buildWeatherPromptLines(anchorForecasts, "en").join("\n")}\n`
    : "";

  // Pogojna dodatna pravila — številčenje se nadaljuje od obstoječega 11
  const extraRulesSl: string[] = [];
  const extraRulesEn: string[] = [];
  if (hasWeather) {
    extraRulesSl.push(
      "12. Upoštevaj REALNO napoved zgoraj: kadar je verjetnost padavin ≥ 60 % za regijo, kjer ta dan potuješ, načrtuj notranje in vremensko neodvisne aktivnosti (jame, muzeji, terme, degustacije, mestna jedra) — tisti dan brez pohodov, sotesk ali plaž. Vreme v polju \"weather\" dneva naj se ujema z realno napovedjo za regijo, kjer dan poteka."
    );
    extraRulesEn.push(
      "12. Follow the REAL forecast above: when precipitation probability is ≥ 60% for the region you plan that day, choose indoor/weather-independent activities (caves, museums, thermal spas, tastings, old towns) — no hikes, gorges or beaches that day. The \"weather\" field of each day must match the real forecast for that day's region."
    );
  }
  if (partyLabels) {
    const partyRuleNo = extraRulesSl.length > 0 ? 13 : 12;
    extraRulesSl.push(
      `${partyRuleNo}. Prilagodi ritem in izbor sestavi potnikov: par → mirnejši ritem in romantične večerje; družina z otroki → otrokom prijazne lokacije, krajši prevozi in načrtovani odmori; prijateljska skupina → bolj družabna in aktivna izbira; samostojni potnik → fleksibilen ritem in varna izbira.`
    );
    extraRulesEn.push(
      `${partyRuleNo}. Match pace and selection to the travel party: couple → calmer pace and romantic dinners; family with kids → kid-friendly spots, shorter drives and planned breaks; group of friends → more social and active picks; solo traveller → flexible pace and safe choices.`
    );
  }
  // F15 (backlog #3): izrecno pravilo o tempu — gostota dneva je odgovor
  // na pritožbo s forumov ("planner ne vpraša, če bi raje manj mest")
  if (input.pace) {
    const paceRuleNo = extraRulesSl.length > 0 ? extraRulesSl.length + 12 : 12;
    if (input.pace === "slow") {
      extraRulesSl.push(
        `${paceRuleNo}. Potnik želi POČASEN tempo: 1–2 postanka na dan, vsakemu mestu posveči več časa (daljši termini), brez ožiganja — kakovost pred količino.`
      );
      extraRulesEn.push(
        `${paceRuleNo}. The traveller wants a SLOW pace: 1-2 stops per day, give each place more time (longer slots), no rushing — quality over quantity.`
      );
    } else if (input.pace === "fast") {
      extraRulesSl.push(
        `${paceRuleNo}. Potnik želi HITER tempo: 3–4 postanke na dan, termini naj ostanejo realistični (upoštevaj vožnjo), a načrt zajame čim več mest.`
      );
      extraRulesEn.push(
        `${paceRuleNo}. The traveller wants a FAST pace: 3-4 stops per day, keep time slots realistic (account for driving) but cover as many places as sensible.`
      );
    }
    // "balanced" = dosedanje pravilo 1 (2–3 na dan) že pomeni umerjen ritem;
    // brez dodatnega pravila ostane prompt čist.
  }

  // CROWD-ALTERNATIVES: če potovanje prekriva vrhunski vikend (julij/avgust
  // + sobota/nedelja), AI dobi pošteno uredniško opozorilo o konicah na
  // javno dokumentiranih točkah — JUTRANJI termini in razmislek o
  // alternativah, ne izmišljeni statusi (post-processing doda opombe)
  const peakWeekend =
    input.startDate !== undefined &&
    tripOverlapsPeakWeekend(input.startDate, input.days);
  if (peakWeekend) {
    const crowdRuleNo = extraRulesSl.length > 0 ? extraRulesSl.length + 12 : 12;
    extraRulesSl.push(
      `${crowdRuleNo}. Tvoje okno potovanja vključuje vikend v vrhunski sezoni: Bled, Vintgarska soteska, Postojnska jama, Piran in staro mestno jedro Ljubljane so takrat običajno zelo obiskani. Kjer je načrtovan kateri od teh: nastavi JUTRANJI termin (pred 9:00) in v notes omeni, da je zgodnji prihod priporočljiv; kjer je smiselno, premošči z manj obiskano destinacijo s seznama.`
    );
    extraRulesEn.push(
      `${crowdRuleNo}. Your travel window includes a peak-season weekend: Bled, Vintgar Gorge, Postojna Cave, Piran and Ljubljana old town are usually very busy then. Where any of these is planned: schedule a MORNING slot (before 9:00) and note that arriving early is recommended; where sensible, swap to a less-visited destination from the list.`
    );
  }
  // F5.5 ( odpiralni časi): AI izrecno upošteva preverjena zaprtja —
  // neizvedljivi postanki ( Vintgar pozimi) ali zaprtje glavne atrakcije
  // na določen dan v tednu ( Ptujski grad ob ponedeljkih). Podatki so v
  // destContext z virom; to pravilo jih naredi OBVEZUJOČE za urnik.
  {
    const openRuleNo = extraRulesSl.length > 0 ? extraRulesSl.length + 12 : 12;
    extraRulesSl.push(
      `${openRuleNo}. destinacije imajo v seznamu zabeležene odpiralne čase z virom (npr. Vintgarska soteska je zaprta novembra–marca; Ptujski grad je zaprt ob ponedeljkih). Če je datum potovanja znan, NE načrtuj destinacije v obdobju, ko je zaprta, in izogibaj se dnevom zaprtja glavnih atrakcij — podatek je preverjen, ne predlog.`
    );
    extraRulesEn.push(
      `${openRuleNo}. Destinations list verified opening hours with a source (e.g. Vintgar Gorge is closed November–March; Ptuj Castle is closed on Mondays). When the travel date is known, do NOT schedule a destination during its closure period and avoid weekdays when a main sight is closed — this is verified data, not a suggestion.`
    );
  }

  const extraRulesBlockSl =
    extraRulesSl.length > 0 ? `\n${extraRulesSl.join("\n")}` : "";
  const extraRulesBlockEn =
    extraRulesEn.length > 0 ? `\n${extraRulesEn.join("\n")}` : "";

  const systemPrompt =
    lang === "en"
      ? `You are an expert travel guide for Slovenia. You generate a realistic Slovenia itinerary in JSON format. Respond ONLY with valid JSON, no additional text or code.

IMPORTANT: Suggested partners are ranked by relevance and quality (Q = Quality Score). When possible, include partners with a higher Q in the notes or recommendations fields. [SPONSORED] and [FEATURED] tags denote premium partners. Practical info on partners (season, weather, parking) is provider-supplied — use it when choosing: a partner marked "weather: indoor" suits a rainy day, "season: summer" is out of season outside those months.`
      : `Si strokovni slovenski vodič za načrtovanje potovanj. Generiraš realističen itinerer za Slovenijo v JSON formatu. Odgovori SAMO z veljavnim JSON, brez dodatnega besedila ali kode.

POMEMBNO: Predlagani partnerji so razvrščeni po ustreznosti in kakovosti (Q = Quality Score). Kadar je mogoče, vključi partnerje z višjim Q v notes ali recommendations polja. [SPONZORIRANO] in [FEATURED] oznake pomenijo premium partnerje. Praktični podatki partnerjev (sezona, vreme, parkiranje) so podatki ponudnika — uporabi jih pri izbiri: partner z "vreme: notranje" ustreza deževnemu dnevu, "sezona: poletje" pa je izven sezone neustrezen.`;

  // F5.4: zaželene destinacije — AI prompt izrecno navodilo ( fallback pot
  // jih že dobi prek ocenjevalnika; AI pot jih potrebuje v besedilu).
  const preferredLineEn =
    input.preferredDestinations && input.preferredDestinations.length > 0
      ? `\n- Destinations the user explicitly wants to include (recognized from a link they pasted): ${input.preferredDestinations
          .map((id) => DESTINATIONS.find((d) => d.id === id)?.name ?? id)
          .join(", ")} — include them where feasible ( season and geography permitting)`
      : "";
  const preferredLineSl =
    input.preferredDestinations && input.preferredDestinations.length > 0
      ? `\n- Destinacije, ki jih uporabnik izrecno želi vključiti ( prepoznane s prilepljene povezave): ${input.preferredDestinations
          .map((id) => DESTINATIONS.find((d) => d.id === id)?.name ?? id)
          .join(", ")} — jih vključi, kjer je izvedljivo ( sezona in geografija dovoljujeta)`
      : "";

  const userPrompt =
    lang === "en"
      ? `Generate a ${input.days}-day itinerary for Slovenia.

Traveler:
- Budget: €${input.budget}
- Interests: ${input.interests.join(", ")}
- Season: ${input.season}${input.startDate ? `\n- Travel date: ${formatDateRangeSI(input.startDate, tripEnd)}` : ""}
- Group: ${input.groupSize} person(s)${partyLineEn}${paceLineEn}${preferredLineEn}
${weatherBlockEn}
Available destinations:
${destContext}
${partnerContext}

Rules:
1. Pick 2-3 destinations per day
2. GROUP destinations by geographic proximity — Bled+Vintgar+Bohinj in one day, Ljubljana separately, Soča+Kobarid together
3. Optimize the route across days — move by regions (Gorenjska day 1, Primorska day 2, etc.)
4. Match the traveler's interests
5. Stay within budget (total < €${input.budget})
6. Respect seasonal suitability (${input.season})
7. Keep time frames realistic (account for ~30-45 min drives between locations)
8. When fitting, mention suggested partners from the PREDLAGANI PARTNERJI list in notes or recommendations (e.g. "For lunch, visit [a partner from the list]"). NEVER invent restaurant, hotel or venue names — venue names may appear ONLY from the suggested partners list; when that list is absent, notes and recommendations must not name specific venues
9. Add estimated drive time to the next location in notes (e.g. "30 min drive to Bohinj")
10. "packing_list": 8-14 concrete items for this trip (season, interests, duration)
11. "rationale": 1-2 sentences, written as a guide in third person: why THIS itinerary suits the traveler — reference their interests, budget and desire for less driving. Concrete, no marketing fluff.${extraRulesBlockEn}

JSON format (STRICT):
{
  "days": [
    {
      "day": 1,
      "locations": [
        {
          "destination_id": "bled",
          "destination_name": "Bled",
          "time_slot": "09:00-13:00",
          "duration": 4,
          "estimated_cost": 50,
          "notes": "Morning visit, best light for photos. ~35 min drive to Bohinj."
        }
      ],
      "weather": { "condition": "sunny", "temp": 22 }
    }
  ],
  "total_budget": 500,
  "recommendations": ["Bring sunglasses", "Book the traditional pletna boat ride in advance"],
  "tips": ["Start early to avoid crowds"],
  "packing_list": ["Sunscreen SPF 50", "Hiking shoes", "Cash in euros"],
  "rationale": "This itinerary combines peaceful nature and local cuisine with minimal driving — Bled and Bohinj are in the same region, so more time is spent at locations instead of in the car."
}`
      : `Generiraj ${input.days}-dnevni itinerer za Slovenijo.

Potnik:
- Proračun: €${input.budget}
- Interesi: ${input.interests.join(", ")}
- Sezona: ${input.season}${input.startDate ? `\n- Datum potovanja: ${formatDateRangeSI(input.startDate, tripEnd)}` : ""}
- Skupina: ${input.groupSize} oseb(a)${partyLineSl}${paceLineSl}${preferredLineSl}
${weatherBlockSl}
Razpoložljive destinacije:
${destContext}
${partnerContext}

Pravila:
1. Izberi 2-3 destinacije na dan
2. GRUPIRAJ destinacije po geografski bližini — Bled+Vintgar+Bohinj v enem dnevu, Ljubljana ločeno, Soča+Kobarid skupaj
3. Optimiziraj pot med dnevi — premikaj se po regijah (Gorenjska dan 1, Primorska dan 2, itd.)
4. Ustrezi interesom potnika
5. Ostani znotraj proračuna (skupni < €${input.budget})
6. Upoštevaj sezonsko ustreznost (${input.season})
7. Časovni okvirji naj bodo realistični (upostevaj vožnjo med lokacijami ~30-45min)
8. Kadar ustreza, v notes ali recommendations omeni predlagane partnerje s seznama PREDLAGANI PARTNERJI (npr. "Za kosilo obiščite [partnerja s seznama]"). NIKOLI ne izmišljuj imen restavracij, hotelov ali lokalov — imena lokalov se smejo pojaviti SAMO s seznama predlaganih partnerjev; če seznama ni, notes in recommendations ne smeta vsebovati imen konkretnih lokalov
9. V notes dodaj ocenjen čas vožnje do naslednje lokacije (npr. "30 min vožnje do Bohinja")
10. "packing_list": 8-14 konkretnih stvari za ta izlet (sezona, interesi, trajanje)
11. "rationale": 1-2 povedi, napisane kot vodnik v tretji osebi: zakaj TA pot ustreza potniku — sklicuj se na njegove interese, proračun in željo po manj vožnje. Konkretno, brez marketinških fraz.${extraRulesBlockSl}

JSON format (STROGO):
{
  "days": [
    {
      "day": 1,
      "locations": [
        {
          "destination_id": "bled",
          "destination_name": "Bled",
          "time_slot": "09:00-13:00",
          "duration": 4,
          "estimated_cost": 50,
          "notes": "Jutranji obisk, najboljša svetloba za fotografije. ~35 min vožnje do Bohinja."
        }
      ],
      "weather": { "condition": "sončno", "temp": 22 }
    }
  ],
  "total_budget": 500,
  "recommendations": ["Vzemi sončna očala", "Rezerviraj vožnjo s pletno vnaprej"],
  "tips": ["Začni zgodaj za manj ljudi"],
  "packing_list": ["Sončna krema SPF 50", "Pohodniški čevlji", "Evrovi gotovina"],
  "rationale": "Pot združuje mirno naravo in lokalno kulinariko z minimalno vožnjo — Bled in Bohinj sta na isti regiji, zato je več časa na lokacijah namesto v avtu."
}`;

  try {
    const result = await generateCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.7, jsonMode: true }
    );

    const content = result?.content;
    if (!content) {
      throw new Error("Prazen odgovor AI");
    }

    // Ekstrahiraj JSON (AI včasih doda ```json blok)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);

    const itinerary: Itinerary = {
      ...parsed,
      source: "ai",
    };

    console.log(`[itinerary] AI uspešno (source: ${result.source})`);

    // Pakirni seznam — AI predlog (validirana) ali hevristika, če AI izpusti/neveljavna
    // (P4-8: hevristika spoštuje jezik itinererja)
    itinerary.packingList =
      sanitizeAiPackingList(parsed.packing_list) ??
      buildPackingList({
        season: input.season,
        interests: input.interests,
        days: input.days,
        lang,
      });

    // PRAVO vreme — vreme iz AI izhoda prepišemo z realno Open-Meteo prognozo
    // (WEATHER-CONTEXT: poravnano z datumom odhoda + jezikom izpisa)
    const enriched = await enrichWithRealWeather(
      itinerary,
      input.startDate,
      lang
    );

    // Dogodki na obiskanih destinacijah (neodvisno od vremena — ločeno polje)
    // FW4.2: z okvirom potovanja — dogodki, ki se zgodijo MED obiskom,
    // pridejo na prvih mestih
    enriched.events = matchEventsForItinerary(enriched.days, 6, tripWindow, lang);

    // FW4.2: okvir potovanja shrani Z načrtom (svež datumski match na
    // /pot/[shareId], prikaz datumov na dnevih, deljenje z datumi)
    if (input.startDate) {
      enriched.tripStartDate = input.startDate;
      enriched.tripEndDate = tripEnd;
    }

    // FW4.1: strukturne metrike (deterministično) + AI utemeljitev
    // (sanitizirana, fallback determinističen) — isto enrich mesto kot vreme
    //
    // P0.2 (recenzija): total_budget se PRERAČUNA iz dejanskih postankov —
    // AI JSON prinese svojo številko, ki pa ni preverjena; prikaz mora
    // temeljiti na postankih, ki so DEJANSKO v načrtu (isti vzorec kot
    // fallback in refine).
    const budgetSynced = recomputeTotalBudget(enriched);

    // F5.6 (ROAD ROUTING): realne cestne razdalje/časi (OSRM) za VSE plasti —
    // kvaliteta, geo-validacija, stroški, razlage postankov, geometrija za
    // zemljevid. Best-effort: ob nedosegljivem OSRM hevristika (razkrito v
    // geoValidation.method / quality.routingMethod). NIKOLI ne vrže in ne
    // zavlačuje mimo ~3 s (sočasnost 4 × timeout 2,5 s).
    const legs = await buildLegRouteIndex(budgetSynced);

    budgetSynced.quality = computeItineraryQuality(budgetSynced, input, legs);
    budgetSynced.rationale =
      sanitizeAiRationale(parsed.rationale) ??
      buildFallbackRationale(input, budgetSynced.quality, lang);

    // P0.2 GEO-VALIDACIJA: izvedljivost nad končno strukturo (deterministično,
    // iz realnih koordinat — km/dan, zaporedne razdalje, obseg dneva, urnik,
    // duplikati, manjkajoči ID-ji). Sporočila locena prek lang.
    // F5.6: noge iz OSRM indeksa — realne cestne razdalje/časi.
    budgetSynced.geoValidation = validateItineraryGeo(budgetSynced, lang, legs);

    // CROWD-ALTERNATIVES: poštene opombe o gneči + alternative (deterministično)
    budgetSynced.crowdNotices = buildCrowdNotices(budgetSynced, input, lang);

    // FAZA 4-1 ("Zakaj je to priporočeno?"): vsak postanek dobi kratko,
    // podatkovno utemeljeno razlago (interesi, tip skupine, razdalja,
    // vreme, sezona — izključno dejstva, brez marketinga). Deterministično
    // na obeh poteh — AI izbira postankov, razlago pa sestavijo isti
    // preverljivi podatki. F5.6: razdalje iz OSRM nog, kadar so na voljo.
    const withReasons = buildStopReasons(budgetSynced, input, lang, legs);

    // F5.6: geometrija poti po realnih cestah (za zemljevid na /nacrtuj) —
    // po razlagah, da ohranimo isti vrstni red enrichinga (struktura se ne
    // spremeni, samo doda routeGeometry polje, kadar OSRM Geometrija obstaja).
    withReasons.days = withReasons.days.map((d) => ({
      ...d,
      routeGeometry: dayRouteGeometry(d.locations, legs) ?? undefined,
    }));

    // UI sprint (točka D): noge serializiramo v itinerer — povezovalniki med
    // postanki na clientu uporabijo ISTE številke kot značke ~km dni.
    withReasons.legs = serializeLegs(legs);

    return NextResponse.json(withReasons);
  } catch (error) {
    console.error("[itinerary] AI napaka, uporabljam fallback:", error);
    // WEATHER-CONTEXT: fallback prejme sidrne napovedi — deževni dnevi
    // dobijo notranje/prilagodljive destinacije (glej generateFallbackItinerary)
    const fallback = await enrichWithRealWeather(
      generateFallbackItinerary(input, anchorForecasts),
      input.startDate,
      lang
    );

    // Fallback: hevristični pakirni seznam + dogodki (isti enrich kot AI pot)
    // (P4-8: jezik itinererja — EN uporabnik dobi EN seznam)
    fallback.packingList = buildPackingList({
      season: input.season,
      interests: input.interests,
      days: input.days,
      lang,
    });
    fallback.events = matchEventsForItinerary(fallback.days, 6, tripWindow, lang);

    // FW4.2: okvir potovanja tudi na fallback načrtu (isti enrich kot AI pot)
    if (input.startDate) {
      fallback.tripStartDate = input.startDate;
      fallback.tripEndDate = tripEnd;
    }

    // FW4.1: metrike + deterministična utemeljitev (fallback nima AI rationale)
    // (P4-8: jezik itinererja) + F5.6 realne ceste (ista obogatitev kot AI pot)
    const legs = await buildLegRouteIndex(fallback);
    fallback.quality = computeItineraryQuality(fallback, input, legs);
    fallback.rationale = buildFallbackRationale(input, fallback.quality, lang);

    // P0.2 GEO-VALIDACIJA: isto preverjanje izvedljivosti kot na AI poti —
    // fallback itinerar mora biti enako preverljiv kot AI izpisa.
    // F5.6: noge iz OSRM indeksa — realne cestne razdalje/časi.
    fallback.geoValidation = validateItineraryGeo(fallback, lang, legs);

    // CROWD-ALTERNATIVES: iste poštene opombe kot na AI poti
    fallback.crowdNotices = buildCrowdNotices(fallback, input, lang);

    // FAZA 4-1: razlage postankov (ista deterministična obogatitev kot AI pot)
    // F5.6: razdalje iz OSRM nog + geometrija dneva za zemljevid.
    const withReasons = buildStopReasons(fallback, input, lang, legs);
    withReasons.days = withReasons.days.map((d) => ({
      ...d,
      routeGeometry: dayRouteGeometry(d.locations, legs) ?? undefined,
    }));

    // UI sprint (točka D): noge tudi na fallback poti (isti vir številk)
    withReasons.legs = serializeLegs(legs);

    return NextResponse.json(withReasons);
  }
}

// ============================================================================
// PRAVO Vreme v itinererju (post-processing)
// ============================================================================
//
// AI lahko v JSON izpljune izmišljeno vreme ("sončno 22°") — to je LAŽ.
// Po generiranju (AI ali fallback) zato itinerer obogatimo z realno DAILY
// prognozo Open-Meteo za koordinate prve lokacije:
//   - day.weather = { condition, temp } iz realne prognoze
//   - ob verjetnosti padavin >= 60 % dodamo dež-alternativo v tips
//
// Gracefully: ob napaki/timeoutu (4 s) izpusta Open-Meteo se obdrži vreme,
// ki je bilo že v objektu (pri fallbacku = sezonska ocena, glej spodaj).
//
// WEATHER-CONTEXT: napoved je zdaj poravnana z datumom odhoda (startDate —
// prej je dan i dobil "i-ti dan od danes", tudi za potovanje čez teden) in
// izpisana v jeziku itinererja (lang). Vpliv na SAMO IZBIRO destinacij se
// zgodi prej, v promptu (glej fetchAnchorForecasts zgoraj).
async function enrichWithRealWeather(
  itinerary: Itinerary,
  startDate?: string,
  lang: "sl" | "en" = "sl"
): Promise<Itinerary> {
  try {
    const firstLoc = itinerary.days[0]?.locations?.[0];
    if (!firstLoc?.destination_id) return itinerary;

    const dest = DESTINATIONS.find((d) => d.id === firstLoc.destination_id);
    if (!dest) return itinerary;

    const daily = await fetchDailyForecast(
      dest.coords.lat,
      dest.coords.lng,
      itinerary.days.length,
      startDate
    );
    if (!daily) {
      // Open-Meteo ni dosegljiv — obdrži obstoječe (AI/sezonsko) vreme
      return itinerary;
    }

    const tips = Array.isArray(itinerary.tips) ? [...itinerary.tips] : [];

    for (let i = 0; i < itinerary.days.length; i++) {
      const forecast = daily[i];
      // Če prognoza nima dneva i (krajša od itinererja), obdrži obstoječe vreme
      if (!forecast) continue;

      itinerary.days[i] = {
        ...itinerary.days[i],
        weather: {
          condition:
            lang === "en"
              ? weatherCodeToTextEn(forecast.weatherCode)
              : weatherCodeToText(forecast.weatherCode),
          temp: Math.round(forecast.tempMax),
        },
      };

      // Dež alternative — dodaj v tips, če je verjetnost padavin visoka
      // (P4-8: EN uporabnik dobi EN tip)
      if ((forecast.precipitationProbabilityMax ?? 0) >= 60) {
        const tip =
          lang === "en"
            ? `Day ${i + 1}: rain likely — alternatives: Postojna/Škocjan Caves, museums, Terme Olimia thermal spa.`
            : `Dan ${i + 1}: verjeten dež — alternative: Postojnska/Škocjanske jame, muzeji, terme Terme Olimia.`;
        if (!tips.includes(tip)) tips.push(tip);
      }
    }

    itinerary.tips = tips;
    return itinerary;
  } catch (error) {
    console.error("[itinerary] enrichWithRealWeather napaka:", error);
    return itinerary;
  }
}

// Pametni fallback - deterministični itinerer iz statičnih podatkov
//
// WEATHER-CONTEXT: če so na voljo realne sidrne napovedi (samo z datumom
// odhoda znotraj prognoznega horizonta), deževni dnevi — večina sidra
// ≥ 60 % verjetnosti padavin — dobijo prednostno NOTRANJE/prilagodljive
// destinacije (jame, terme, mestna jedra). Razvrstitev izhaja IZ tipa
// destinacije v slovenia-data — poštena, deterministična, brez izmišljenih
// statusov. Brez napovedi je zaporedje izbire IDENTIČNO prejšnjemu.
const INDOOR_TYPES = new Set(["cave", "spa", "city"]);

function generateFallbackItinerary(
  input: PlannerInput,
  anchors: AnchorForecast[] = []
): Itinerary {
  // P4-8 (EN-fallback fix): jezik vsega determinističnega besedila — prej
  // je fallback izpisoval slovensko tudi za EN uporabnike (mešanje jezikov)
  const isEn = input.language === "en";
  const taglineOf = (d: (typeof DESTINATIONS)[number]): string =>
    isEn ? (DESTINATIONS_EN[d.id]?.tagline ?? d.tagline) : d.tagline;

  // Filtriraj sezonsko ustrezne destinacije
  const suitable = DESTINATIONS.filter((d) => d.bestSeason.includes(input.season));
  const pool = suitable.length >= input.days * 2 ? suitable : DESTINATIONS;

  // F5.5 ( odpiralni časi): če je datum odhoda znan, mesečno zaprtje na
  // ravni DESTINACIJE ( Vintgar nov–mar) izloči destinacijo iz bazena —
  // deterministično PREPREČIMO neizvedljiv postanek, ne zgolj opozorimo.
  // Zaprtje na ravni ATRAKCIJE ( Ptujski grad ob ponedeljkih) NE izloča —
  // mesto je odprto, validator pošteno opozori (WARN) glede dneva.
  const closedInTripMonths = new Set<string>();
  if (input.startDate) {
    const startMs = parseISODateLocal(input.startDate);
    if (startMs !== null) {
      const months = new Set<number>();
      for (let i = 0; i < input.days; i++) {
        months.add(new Date(startMs + i * 86400000).getMonth() + 1);
      }
      for (const d of DESTINATIONS) {
        if (
          d.opening?.closureLevel === "destination" &&
          d.opening.closedMonths?.some((m) => months.has(m))
        ) {
          closedInTripMonths.add(d.id);
        }
      }
    }
  }
  const openPool = closedInTripMonths.size > 0
    ? pool.filter((d) => !closedInTripMonths.has(d.id))
    : pool;
  // Če bi s filtrom ostalo premalo ( robn primer), ostane izvorni pool —
  // validator tak načrt pošteno označi ( ERROR) in refine ga lahko popravi.
  const effectivePool = openPool.length >= input.days ? openPool : pool;

  // Ocenjevalnik: ujemanje interesov + F5.4 pohitritev za izrecno zaželene
  // destinacije ( iz prilepljene povezave — "Start Anywhere"). Pohitritev
  // ( +2,5) dominira nad oceno/všečnostjo, a NE nad sezonskim filtrom in
  // deževno-logiko — vreme in sezona ostajata iskreni prednost.
  const score = (d: (typeof DESTINATIONS)[number]) =>
    d.bestFor.filter((b) => input.interests.includes(b)).length +
    d.rating / 10 +
    (input.preferredDestinations?.includes(d.id) ? 2.5 : 0);

  const ranked = [...effectivePool].sort((a, b) => score(b) - score(a));
  const indoor = ranked.filter((d) => INDOOR_TYPES.has(d.type));

  // Zaporedni izbor z razstrupljanjem (brez vremena: isto zaporedje kot prej)
  const used = new Set<string>();
  const pickDest = (preferred: typeof ranked) => {
    for (const d of preferred) {
      if (!used.has(d.id)) {
        used.add(d.id);
        return d;
      }
    }
    // primarna zalogovnica izčrpana → splošni niz po vrsti
    for (const d of ranked) {
      if (!used.has(d.id)) {
        used.add(d.id);
        return d;
      }
    }
    // vse porabljene → reset (zaporedje ostane deterministično)
    used.clear();
    const d = ranked[0];
    if (d) used.add(d.id);
    return d;
  };

  const days: DayPlan[] = [];
  let totalCost = 0;

  // F15 (backlog #3): gostota dneva iz tempa potovanja — slow → 2 × 5 h,
  // balanced → 2 × 4 h (dosedanji izpis, nespremenjeno), fast → 3 × 3 h.
  // Deterministično: isti vhod → isti načrt (0 AI žetonov).
  const pacePlan = PACE_FALLBACK[input.pace ?? "balanced"];

  for (let day = 1; day <= input.days; day++) {
    const rainy = isRainyDay(anchors, day - 1);
    const locationsPerDay = pacePlan.stopsPerDay;
    const locations: LocationVisit[] = [];

    for (let i = 0; i < locationsPerDay; i++) {
      const dest = pickDest(rainy ? indoor : ranked);
      const cost = dest.costPerPerson * input.groupSize;
      totalCost += cost;
      const startHour = 9 + i * pacePlan.spacingHours;
      locations.push({
        destination_id: dest.id,
        destination_name: dest.name,
        time_slot: `${String(startHour).padStart(2, "0")}:00-${String(startHour + pacePlan.durationHours).padStart(2, "0")}:00`,
        duration: pacePlan.durationHours,
        estimated_cost: cost,
        // Deževen dan: transparenten razlog notranje izbire (resnična
        // večinska napoved sidr — ne izmišljen status); P4-8: EN različica
        notes: rainy
          ? `${taglineOf(dest)} — ${isEn ? "rainy day, so an indoor/flexible pick" : "deževen dan, zato notranja/prilagodljiva izbira"}`
          : taglineOf(dest),
      });
    }

    days.push({
      day,
      locations,
      // OPOMBA: sezonska ocena vremena (zima → sneg, sicer sončno) je
      // poštena GRACEFUL FALLBACK — uporabi se SAMO, če Open-Meteo ni
      // dosegljiv (glej enrichWithRealWeather zgoraj, ki jo sicer prepiše
      // z realno prognozo). Ni več lažna "dnevna" napoved, ampak izrecno
      // sezonsko povprečje.
      weather: { condition: input.season === "winter" ? "sneg" : "sončno", temp: input.season === "winter" ? 2 : 22 },
    });
  }

  return {
    days,
    total_budget: totalCost,
    recommendations: isEn
      ? [
          "Book accommodation at least 2 weeks ahead",
          "Download an offline map for hiking",
          "Bring water bottles — tap water is drinkable everywhere",
        ]
      : [
          "Rezerviraj nastanitev vsaj 2 tedna vnaprej",
          "Prenesi offline zemljevid za pohode",
          "Vzemi plastenke za vodo — pitna voda je povsod",
        ],
    tips: isEn
      ? [
          "Start early in the morning for fewer crowds and better light",
          "Check the mountain weather on the day itself",
          "Local shops have the best prices for snacks",
        ]
      : [
          "Začni zgodaj zjutraj za manj ljudi in boljšo svetlobo",
          "V gorah preveri vreme isti dan",
          "Lokalni marketi imajo najboljše cene za prigrizke",
        ],
    source: "fallback",
  };
}
