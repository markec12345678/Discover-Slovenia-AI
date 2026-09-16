import { NextResponse } from "next/server";
import { DESTINATIONS, normalizeInterests } from "@/lib/slovenia-data";
import { db } from "@/lib/db";
import { generateCompletion } from "@/lib/ai-client";
import type {
  Itinerary,
  PlannerInput,
  DayPlan,
  LocationVisit,
  QuickActionId,
  RefineChange,
  RefineValidation,
  GeoValidation,
  GeoValidationSnapshot,
} from "@/lib/types";
import { rateLimit } from "@/lib/rate-limit";
import {
  computeItineraryQuality,
  recomputeTotalBudget,
  sanitizeAiRationale,
} from "@/lib/itinerary-quality";
import { validateItineraryGeo } from "@/lib/geo-validation";
import { buildCrowdNotices } from "@/lib/crowd-alternatives";
import { matchEventsForItinerary } from "@/lib/events-match";
import { tripWindowMs } from "@/lib/trip-dates";
import { PARTY_PROMPT_LABELS } from "@/lib/party-types";
import { PACE_PROMPT_LABELS } from "@/lib/pace-types";
import { applyQuickAction, QUICK_ACTIONS } from "@/lib/refine-actions";
import { buildStopReasons } from "@/lib/stop-insights";
import { dayRouteGeometry, serializeLegs } from "@/lib/road-routing";
import { buildLegRouteIndex } from "@/lib/road-routing-server";

// POST /api/itinerary/refine — Multi-turn popravki obstoječega itinererja.
//
// Uporabnik pošlje trenutni itinerer + naravnojezični ukaz (npr. "Dodaj več
// pohodov", "Naj bo primerno za otroke", "Cenejša varianta"), AI pa vrne
// posodobljen itinerer v istem JSON formatu.
//
// To je močna demonstracija AI — uporabnik lahko iterativno izboljšuje
// načrt potovanja brez ponovnega izpolnjevanja obrazca.

interface RefineRequest {
  itinerary: Itinerary;
  formData: PlannerInput;
  instruction: string;
  history?: string[]; // prejšnji ukazi za kontekst
  // FAZA 4-2 ("Prilagodi ta dan"): kanonična hitra akcija + številka dneva.
  // Opcijsko — klasični naravnojezikovni refine deluje nespremenjeno.
  // Ko je podana, jo fallback pot obdela DETERMINISTIČNO (glej
  // src/lib/refine-actions.ts) — tudi brez AI žetona se akcija dejansko
  // izvede; AI pot dobi isto akcijo kot del naravnojezičnega ukaza.
  action?: QuickActionId;
  day?: number;
}

const VALID_ACTIONS = new Set<string>(QUICK_ACTIONS.map((a) => a.id));

// ---------------------------------------------------------------------------
// P0.1 (recenzija) — struktuirani validacijski dokaz vsakega refine odgovora
// ---------------------------------------------------------------------------
//
// "Deterministični fallback, ki spremeni dan, še ni isto kot validator, ki
// dokaže, da je novi dan izvedljiv." Zato vsak odgovor (AI + deterministična
// pot) vsebuje before → mutation (changes) → after iz ISTE validacijske plasti
// kot prikaz, s statusom pass | warn | still_failing in opombo, če dan/pot po
// spremembi še vedno ni realno izvedljiva (NE samo "uspešen 200 in lep tekst").

type Lang = "sl" | "en";

function snapshotFor(geo: GeoValidation, day?: number): GeoValidationSnapshot {
  if (day !== undefined) {
    const metrics = geo.days.find((d) => d.day === day);
    const issues = geo.issues.filter((i) => i.day === day);
    const errors = issues.filter((i) => i.level === "error").length;
    return {
      km: metrics?.km ?? 0,
      worst: errors > 0 ? "error" : issues.length > 0 ? "warn" : "ok",
      issues: issues.length,
      errors,
    };
  }
  return {
    km: geo.tripKm,
    worst: geo.worst,
    issues: geo.issues.length,
    errors: geo.issues.filter((i) => i.level === "error").length,
  };
}

function buildValidationEvidence(
  before: GeoValidation,
  after: GeoValidation,
  scope: "day" | "trip",
  day: number | undefined,
  lang: Lang
): RefineValidation {
  const beforeSnap = snapshotFor(before, day);
  const afterSnap = snapshotFor(after, day);
  const status: RefineValidation["status"] =
    afterSnap.errors > 0 ? "still_failing" : afterSnap.issues > 0 ? "warn" : "pass";

  let statusNote: string | undefined;
  if (status === "still_failing") {
    statusNote =
      scope === "day"
        ? lang === "en"
          ? `Day ${day}: still not realistically doable after this change — see the feasibility warnings below the plan.`
          : `Dan ${day}: po spremembi je še vedno ni realno izvedljivo — poglej opozorila o izvedljivosti pod načrtom.`
        : lang === "en"
          ? `The itinerary still has error-level feasibility warnings after this change — see the panel below the plan.`
          : `Načrt ima po spremembi še vedno opozorila ravni ERROR o izvedljivosti — poglej ploščo pod načrtom.`;
  } else if (status === "warn") {
    statusNote =
      scope === "day"
        ? lang === "en"
          ? `Day ${day} is doable after the change, but ${afterSnap.issues} warning(s) remain — see the feasibility panel.`
          : `Dan ${day} je po spremembi izvedljiv, a ostaja ${afterSnap.issues} opozoril — poglej ploščo izvedljivosti.`
        : lang === "en"
          ? `Doable after the change, but ${afterSnap.issues} warning(s) remain — see the feasibility panel.`
          : `Po spremembi je izvedljivo, a ostaja ${afterSnap.issues} opozoril — poglej ploščo izvedljivosti.`;
  }

  return { scope, day, before: beforeSnap, after: afterSnap, status, statusNote };
}

export async function POST(request: Request) {
    // Rate limit AI refine klicev
    const limited = rateLimit(request, { limit: 20, windowMs: 600000, key: "itinerary-refine" });
    if (limited) return limited;

  let body: RefineRequest;
  try {
    body = (await request.json()) as RefineRequest;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  // Validacija
  if (!body?.itinerary?.days?.length) {
    return NextResponse.json(
      { error: "Manjka itinerer (itinerary.days)" },
      { status: 400 }
    );
  }
  if (!body?.instruction?.trim()) {
    return NextResponse.json(
      { error: "Manjka ukaz (instruction)" },
      { status: 400 }
    );
  }

  const instruction = body.instruction.trim().slice(0, 500); // omejitev dolžine
  const current = body.itinerary;
  const formData = body.formData;

  // FAZA 4-2: validacija hitre akcije (če je podana)
  const action =
    typeof body.action === "string" && VALID_ACTIONS.has(body.action)
      ? (body.action as QuickActionId)
      : undefined;
  const day =
    typeof body.day === "number" && Number.isInteger(body.day) && body.day >= 1 && body.day <= 14
      ? body.day
      : undefined;

  // FW4.3/P4-8 (EN-fallback fix): jezik — prej SL prompt + SL opomba tudi
  // za EN uporabnike (refine je vračal slovenske odgovore EN potnikom)
  const isEn = formData?.language === "en";

  // FAZA 4-1/4-2: defenzivni vhod za obogatitev razlag in hitre akcije, če
  // klient ne pošlje formData (naš UI ga vedno pošlje — to je samo varnostna
  // mreža za ročne klice; v tem primeru razlaga izpusti interpolacijo
  // interesov, kar je še vedno pošteno)
  const currentAsFallbackInput: PlannerInput = formData ?? {
    budget: current.total_budget,
    days: current.days.length,
    interests: [],
    season: "summer",
    groupSize: 2,
    language: isEn ? "en" : "sl",
  };
  // TAG-ALIGN (P1, recenzija Faze 4): normalizacija interesov na meji —
  // hitre akcije (npr. "Več hrane") ocenjujejo kandidate z istim bestFor
  // ujemanjem kot generacija; "kulinarika" iz starih shranjenih načrtov
  // se tu preslika na kanonični "hrana" (AI prompt pa dobi čistejši vnos).
  const refineInput: PlannerInput = formData
    ? { ...formData, interests: normalizeInterests(formData.interests ?? []) }
    : currentAsFallbackInput;

  // P0.2 (recenzija): datumska konteksta za PONOVEN izračun dogodkov in opomb
  // o gneči po spremembi — startDate iz obrazca, sicer okvir, shranjen s
  // trenutnim načrtom (refine spreminja postanke, ne datumov odhoda).
  const refineInputWithDates: PlannerInput = {
    ...refineInput,
    startDate: refineInput.startDate ?? current.tripStartDate ?? undefined,
  };
  const refineTripWindow = tripWindowMs(
    refineInputWithDates.startDate ?? null,
    current.days.length
  );

  // Pripravi kontekst destinacij
  const destContext = DESTINATIONS.map(
    (d) =>
      `- ${d.id} (${d.name}): ${d.type}/${d.region}, ${d.duration}, €${d.costPerPerson}/osebo, ocena ${d.rating}, aktivnosti: ${d.activities.join(", ")}. Najboljše za: ${d.bestFor.join(", ")}. Sezona: ${d.bestSeason.join(", ")}`
  ).join("\n");

  // Pridobi sponzorirane lokale (iste kot pri /api/itinerary)
  let sponsoredContext = "";
  try {
    const sponsoredListings = await db.listing.findMany({
      where: {
        sponsored: true,
        sponsoredUntil: { gte: new Date() },
        // P3c-5: sponzorstvo velja SAMO na objavljenih lokalih — pending/
        // rejected/osnutki ne smejo priti v AI kontekst niti prek sponzorirane
        // poti (enak javni filter kot /api/listings).
        status: "published",
      },
      select: { name: true, category: true, destinationName: true },
      take: 20,
    });

    if (sponsoredListings.length > 0) {
      sponsoredContext = "\n\nSPONZORIRANI PARTNERJI (predlagaj kadar ustreza):\n" +
        sponsoredListings.map(l =>
          `- ${l.name} (${l.category})${l.destinationName ? ` v ${l.destinationName}` : ""}`
        ).join("\n");
    }
  } catch (e) {
    console.error("[itinerary/refine] sponsored fetch napaka:", e);
  }

  // Serijaliziraj trenutni itinerer za AI (jezikovno pravilna oznaka dneva).
  // Varovalka: stari/pokvarjeni shranjeni načrti brez weather polja ne
  // onesnažijo prompta z "undefined" (neznano vrednost izrecno označimo).
  const currentItineraryStr = current.days.map((day: DayPlan) =>
    `${isEn ? `Day ${day.day}` : `Dan ${day.day}`} (${day.weather?.condition ?? (isEn ? "n/a" : "ni podatka")}, ${day.weather?.temp ?? "?"}°C):\n` +
    day.locations.map((loc: LocationVisit) =>
      `  - ${loc.time_slot} | ${loc.destination_name} | ${loc.duration}h | €${loc.estimated_cost} | ${loc.notes || (isEn ? "no notes" : "brez opomb")}`
    ).join("\n")
  ).join("\n\n");

  // CROWD-ALTERNATIVES: poštene opombe o gneči (uredniški vzorec obiskanosti)
  // — da prilagoditve ostanejo seznanjene z gnečo na vrhunskih točkah
  const crowdStr =
    current.crowdNotices && current.crowdNotices.length > 0
      ? `\n\nOPOMBE O GNEČI (uredniško, vzorec obiskanosti — ne status):\n${current.crowdNotices
          .map(
            (n) =>
              `  - Dan ${n.day} · ${n.destination_name}: ${n.reason}${
                n.alternatives.length > 0
                  ? ` (alternative: ${n.alternatives
                      .map((a) => `${a.destination_name}, ~${a.distanceKm} km`)
                      .join("; ")})`
                  : ""
              }`
          )
          .join("\n")}`
      : "";

  // Zgodovina prejšnjih ukazov (za kontekst)
  const historyStr = body.history && body.history.length > 0
    ? `\n\n${isEn ? "PREVIOUS INSTRUCTIONS (already reflected in the current itinerary):" : "PREJŠNJI UKAZI (že upoštevani v trenutnem itinererju):"}\n${body.history.map((h, i) => `${i + 1}. ${h}`).join("\n")}`
    : "";

  // WEATHER-CONTEXT: sestava potnikov (opcijsko) — da prilagoditve
  // ohranjajo isti ritem kot osnovni načrt (družina → otrokom prijazno ...)
  const partyTypeLine = formData?.partyType
    ? `\n- ${isEn ? "Respect the travel party" : "Upoštevaj sestavo potnikov"}: ${PARTY_PROMPT_LABELS[formData.partyType][isEn ? "en" : "sl"]}`
    : "";

  // F15 (backlog #3): tempo (opcijsko) — prilagoditve ohranjajo gostoto
  // osnovnega načrta (počasen → brez dodajanja postankov, hiter → brez redčenja)
  const paceLine =
    formData?.pace && formData.pace in PACE_PROMPT_LABELS
      ? `\n- ${isEn ? "Respect the travel pace" : "Upoštevaj tempo potovanja"}: ${PACE_PROMPT_LABELS[formData.pace][isEn ? "en" : "sl"]}`
      : "";

  const systemPrompt = isEn
    ? `You are an expert Slovenian travel guide. The user already has a generated itinerary and wants you to UPDATE it according to their instruction. Respond ONLY with valid JSON, no additional text.

IMPORTANT:
- Keep the same JSON structure as the input itinerary
- Keep the number of days the same unless the instruction explicitly asks for a change
- Keep time frames and prices realistic
- Respect the budget: €${formData?.budget ?? "unknown"}
- Respect the season: ${formData?.season ?? "unknown"}
- Respect the interests: ${formData?.interests?.join(", ") ?? "unknown"}
- Respect the group size: ${formData?.groupSize ?? "unknown"}${partyTypeLine}${paceLine}
- When suitable, include sponsored partners in notes or recommendations — but NEVER invent restaurant, hotel or venue names: venue names may appear ONLY if they come from the sponsored partners list above; when that list is absent, notes and recommendations must not name specific venues`
    : `Si strokovni slovenski vodič za načrtovanje potovanj. Uporabnik ima že generiran itinerer in želi, da ga POSODOBIŠ glede na njegov ukaz. Odgovori SAMO z veljavnim JSON, brez dodatnega besedila.

POMEMBNO:
- Ohrani enako strukturo JSON kot vhodni itinerer
- Število dni naj bo enako kot v vhodu razen če ukaz izrecno zahteva spremembo
- Ohrani realistične časovne okvire in cene
- Upoštevaj proračun: €${formData?.budget ?? "neznan"}
- Upoštevaj sezono: ${formData?.season ?? "nezdana"}
- Upoštevaj interese: ${formData?.interests?.join(", ") ?? "neznan"}
- Upoštevaj velikost skupine: ${formData?.groupSize ?? "nezdana"}${partyTypeLine}${paceLine}
- Kadar ustreza, vključi sponzorirane partnerje v notes ali recommendations — vendar NIKOLI ne izmišljuj imen restavracij, hotelov ali lokalov: imena lokalov se smejo pojaviti SAMO s seznama sponzoriranih partnerjev zgoraj; če tega seznama ni, notes in recommendations ne smeta vsebovati imen konkretnih lokalov`;

  const userPrompt = isEn
    ? `CURRENT ITINERARY:
${currentItineraryStr}
${historyStr}
${sponsoredContext}${crowdStr}

AVAILABLE DESTINATIONS:
${destContext}

USER INSTRUCTION:
"${instruction}"

Update rules:
1. Change the itinerary according to the instruction (add/remove/replace locations)
2. Keep the total budget within €${formData?.budget ?? 1000} (unless the instruction says otherwise)
3. If the instruction asks for "cheaper" — swap expensive picks for cheaper alternatives
4. If the instruction asks to "add X" — include X on a suitable day
5. If the instruction says "replace X with Y" — swap them
6. If the instruction asks for "kid-friendly" — choose family-friendly destinations
7. Keep or improve quality (ratings, relevance)

JSON format (STRICT, same as input):
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
          "notes": "Morning visit."
        }
      ],
      "weather": { "condition": "sunny", "temp": 22 }
    }
  ],
  "total_budget": 500,
  "recommendations": ["Bring sunglasses", "Book the boat in advance"],
  "tips": ["Start early to avoid crowds"],
  "rationale": "Updated rationale (1-2 sentences, third person): why the CHANGED trip suits the traveler better given their instruction."
}`
    : `TRENUTNI ITINERER:
${currentItineraryStr}
${historyStr}
${sponsoredContext}${crowdStr}

RAZPOLOŽLJIVE DESTINACIJE:
${destContext}

UKAZ UPORABNIKA:
"${instruction}"

Pravila za posodobitev:
1. Spremeni itinerer glede na ukaz (dodaj/odstrani/zamenjaj lokacije)
2. Ohrani skupni budget znotraj €${formData?.budget ?? 1000} (razen če ukaz drugače zahteva)
3. Če ukaz sprašuje "naj bo ceneje" — zamenjaj drage z cenejšimi alternativami
4. Če ukaz sprašuje "dodaj X" — vključi X v ustrezen dan
5. Če ukaz sprašuje "namesto X dodaj Y" — zamenjaj
6. Če ukaz sprašuje "primerno za otroke" — izberi family-friendly destinacije
7. Ohrani ali izboljšaj kakovost (ocene, relevantnost)

JSON format (STROGO, enak kot vhod):
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
          "notes": "Jutranji obisk."
        }
      ],
      "weather": { "condition": "sončno", "temp": 22 }
    }
  ],
  "total_budget": 500,
  "recommendations": ["Vzemi sončna očala", "Rezerviraj čoln vnaprej"],
  "tips": ["Začni zgodaj za manj ljudi"],
  "rationale": "Posodobljena utemeljitev (1-2 povedi, tretja oseba): zakaj SPREMENJENA pot bolj ustreza potniku glede na njegov ukaz."
}`;

  try {
    const result = await generateCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.6, jsonMode: true }
    );

    const content = result?.content;
    if (!content) {
      throw new Error("Prazen odgovor AI");
    }

    // Ekstrahiraj JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);

    const refinedItinerary: Itinerary = {
      ...parsed,
      source: "ai",
    };

    // FW4.1: strukturne metrike se PRERAČUNAJO na novi strukturi (stare
    // vrednosti bi bile zastarele) + posodobljena AI utemeljitev.
    // Sosednji bug-fix: AI JSON ne vsebuje packingList — prenesi
    // iz originala, če novo-parsed nima (refine jo je prej izgubil).
    // F5.6: realne ceste (OSRM) — isti indeks nog za kvaliteto, geo,
    // razlage in geometrijo (predpomnilnik → drugi klic za isti par je zdarma).
    const legs = await buildLegRouteIndex(refinedItinerary);
    refinedItinerary.quality = computeItineraryQuality(refinedItinerary, formData, legs);
    refinedItinerary.rationale =
      sanitizeAiRationale(parsed.rationale) ??
      (typeof current.rationale === "string" ? current.rationale : undefined);
    if (!Array.isArray(refinedItinerary.packingList)) refinedItinerary.packingList = current.packingList;

    // FW4.2: okvir potovanja in dodani dogodki so uporabnikovo stanje, ki ga
    // AI JSON ne vsebuje — vedno prenesi iz originala (refine spreminja dneve,
    // ne datumov odhoda ne izbire dogodkov)
    refinedItinerary.tripStartDate = current.tripStartDate;
    refinedItinerary.tripEndDate = current.tripEndDate;
    if (!Array.isArray(refinedItinerary.addedEvents)) refinedItinerary.addedEvents = current.addedEvents;

    // ------------------------------------------------------------------
    // P0.2 (recenzija): POPOLNA sinhronizacija po spremembi — budget, dogodki,
    // gneča, geo-validacija in razlage se PRERAČUNAJO na NOVI strukturi.
    // Prej: total_budget je prišel iz AI JSON (izračunan za staro strukturo),
    // events podedovan iz staroga načrta (dogodki na odstranjenih destinacijah),
    // crowdNotices pa izpuščeni (AI JSON jih ne vsebuje → izgubljeni).
    // ------------------------------------------------------------------
    const synced = recomputeTotalBudget(refinedItinerary);
    synced.events = matchEventsForItinerary(synced.days, 6, refineTripWindow);
    synced.crowdNotices = buildCrowdNotices(synced, refineInputWithDates, isEn ? "en" : "sl");

    // P0.2 GEO-VALIDACIJA: preračunaj na novi strukturi (stare vrednosti bi
    // bile zastarele — refine lahko prestavi postanke med dnevi/dnevi sami)
    // F5.6: noge iz OSRM indeksa — realne cestne razdalje/časi.
    synced.geoValidation = validateItineraryGeo(synced, isEn ? "en" : "sl", legs);

    console.log(`[itinerary/refine] AI uspešno (source: ${result.source}) — ukaz: "${instruction}"`);

    // FAZA 4-1: razlage postankov se PRERAČUNAJO na novi strukturi (nove
    // lokacije / nov zaporedni red → nove razdalje, nov kontekst)
    // F5.6: razdalje iz OSRM nog + SVEŽA geometrija dneva (stara bi risala
    // ceste, ki jih na novi strukturi ni več).
    const withReasons = buildStopReasons(synced, refineInput, isEn ? "en" : "sl", legs);
    withReasons.days = withReasons.days.map((d) => ({
      ...d,
      routeGeometry: dayRouteGeometry(d.locations, legs) ?? undefined,
    }));
    // UI sprint (točka D): sveže noge za povezovalnike na clientu
    withReasons.legs = serializeLegs(legs);

    // P0.1 (recenzija): validacijski dokaz — before/after iz ISTE plasti kot
    // prikaz (prosti ukaz → obseg celega potovanja). F5.6: before z realnimi
    // cestami iz ISTEGA indeksa (predpomniljeni pari) — poštena primerjava.
    const beforeGeo = validateItineraryGeo(current, isEn ? "en" : "sl", legs);
    const validation = buildValidationEvidence(
      beforeGeo,
      synced.geoValidation,
      "trip",
      undefined,
      isEn ? "en" : "sl"
    );

    return NextResponse.json({
      itinerary: withReasons,
      instruction,
      source: result.source,
      validation,
    });
  } catch (error) {
    console.error("[itinerary/refine] AI napaka:", error);

    // FAZA 4-2: hitra akcija (action + day) ima DETERMINISTIČNO izvedbo —
    // izvede se tudi brez AI žetona (na produkciji je AI pogosto v fallback
    // načinu). Ni nov AI sistem: čiste transformacije nad istim datasetom
    // destinacij, vsaka sprememba poročana v `changes`.
    if (action && day) {
      const result = applyQuickAction(
        current,
        refineInput,
        action,
        day,
        isEn ? "en" : "sl"
      );
      // P0.2 (recenzija): dogodki + opombe o gneči se preračunata tudi na
      // deterministični poti (zamenjava/odstranitev postanka spremeni oba)
      result.itinerary.events = matchEventsForItinerary(
        result.itinerary.days,
        6,
        refineTripWindow
      );
      result.itinerary.crowdNotices = buildCrowdNotices(
        result.itinerary,
        refineInputWithDates,
        isEn ? "en" : "sl"
      );
      // P0.2 GEO-VALIDACIJA: tudi deterministična hitra akcija spremeni
      // strukturo dneva — preračunaj (isto čisto funkcijo kot AI pot)
      // F5.6: realne ceste (OSRM) — predpomniljeni pari iz generiranja.
      const legs = await buildLegRouteIndex(result.itinerary);
      result.itinerary.geoValidation = validateItineraryGeo(
        result.itinerary,
        isEn ? "en" : "sl",
        legs
      );
      const withReasons = buildStopReasons(
        result.itinerary,
        refineInput,
        isEn ? "en" : "sl",
        legs
      );
      // F5.6: sveža geometrija po spremembi strukture (stara bi bila napačna)
      withReasons.days = withReasons.days.map((d) => ({
        ...d,
        routeGeometry: dayRouteGeometry(d.locations, legs) ?? undefined,
      }));
      // UI sprint (točka D): sveže noge tudi na deterministični poti
      withReasons.legs = serializeLegs(legs);

      // P0.1 (recenzija): before → mutation → after iz ISTE validacijske plasti
      // kot prikaz — dokaz, da je dan po spremembi izvedljiv (ali opozorilo,
      // da NI — nikoli samo "uspešen 200 in lep nov tekst"). F5.6: realne ceste.
      const beforeGeo = validateItineraryGeo(current, isEn ? "en" : "sl", legs);
      const validation = buildValidationEvidence(
        beforeGeo,
        result.itinerary.geoValidation,
        "day",
        day,
        isEn ? "en" : "sl"
      );

      console.log(
        `[itinerary/refine] Hitra akcija "${action}" (dan ${day}) deterministično: ${result.changes.length} sprememb, geo ${validation.before.worst}→${validation.after.worst} (${validation.status})`
      );
      return NextResponse.json({
        itinerary: withReasons,
        instruction,
        source: "fallback",
        applied: true,
        action,
        day,
        changes: result.changes satisfies RefineChange[],
        note: result.note,
        validation,
      });
    }

    // Fallback: vrni originalni itinerer z opombo (jezikovno pravilno — P4-8)
    return NextResponse.json({
      itinerary: current,
      instruction,
      source: "fallback",
      warning: isEn
        ? "AI update failed — the original itinerary is shown."
        : "AI posodobitev ni uspela — prikazan je originalni itinerer.",
    }, { status: 200 });
  }
}
