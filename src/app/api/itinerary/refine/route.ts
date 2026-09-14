import { NextResponse } from "next/server";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { db } from "@/lib/db";
import { generateCompletion } from "@/lib/ai-client";
import type {
  Itinerary,
  PlannerInput,
  DayPlan,
  LocationVisit,
  QuickActionId,
  RefineChange,
} from "@/lib/types";
import { rateLimit } from "@/lib/rate-limit";
import {
  computeItineraryQuality,
  sanitizeAiRationale,
} from "@/lib/itinerary-quality";
import { validateItineraryGeo } from "@/lib/geo-validation";
import { PARTY_PROMPT_LABELS } from "@/lib/party-types";
import { applyQuickAction, QUICK_ACTIONS } from "@/lib/refine-actions";
import { buildStopReasons } from "@/lib/stop-insights";

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

  // Serijaliziraj trenutni itinerer za AI (jezikovno pravilna oznaka dneva)
  const currentItineraryStr = current.days.map((day: DayPlan) =>
    `${isEn ? `Day ${day.day}` : `Dan ${day.day}`} (${day.weather.condition}, ${day.weather.temp}°C):\n` +
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

  const systemPrompt = isEn
    ? `You are an expert Slovenian travel guide. The user already has a generated itinerary and wants you to UPDATE it according to their instruction. Respond ONLY with valid JSON, no additional text.

IMPORTANT:
- Keep the same JSON structure as the input itinerary
- Keep the number of days the same unless the instruction explicitly asks for a change
- Keep time frames and prices realistic
- Respect the budget: €${formData?.budget ?? "unknown"}
- Respect the season: ${formData?.season ?? "unknown"}
- Respect the interests: ${formData?.interests?.join(", ") ?? "unknown"}
- Respect the group size: ${formData?.groupSize ?? "unknown"}${partyTypeLine}
- When suitable, include sponsored partners in notes or recommendations`
    : `Si strokovni slovenski vodič za načrtovanje potovanj. Uporabnik ima že generiran itinerer in želi, da ga POSODOBIŠ glede na njegov ukaz. Odgovori SAMO z veljavnim JSON, brez dodatnega besedila.

POMEMBNO:
- Ohrani enako strukturo JSON kot vhodni itinerer
- Število dni naj bo enako kot v vhodu razen če ukaz izrecno zahteva spremembo
- Ohrani realistične časovne okvire in cene
- Upoštevaj proračun: €${formData?.budget ?? "neznan"}
- Upoštevaj sezono: ${formData?.season ?? "nezdana"}
- Upoštevaj interese: ${formData?.interests?.join(", ") ?? "neznan"}
- Upoštevaj velikost skupine: ${formData?.groupSize ?? "nezdana"}${partyTypeLine}
- Kadar ustreza, vključi sponzorirane partnerje v notes ali recommendations`;

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
          "notes": "Jutranji obisk. Za kosilo obiščite Penzion Berc."
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
    // Sosednji bug-fix: AI JSON ne vsebuje events/packingList — prenesi
    // iz originala, če novo-parsed nima (refine je ti polji prej izgubil).
    refinedItinerary.quality = computeItineraryQuality(refinedItinerary, formData);
    refinedItinerary.rationale =
      sanitizeAiRationale(parsed.rationale) ??
      (typeof current.rationale === "string" ? current.rationale : undefined);
    if (!Array.isArray(refinedItinerary.events)) refinedItinerary.events = current.events;
    if (!Array.isArray(refinedItinerary.packingList)) refinedItinerary.packingList = current.packingList;

    // FW4.2: okvir potovanja in dodani dogodki so uporabnikovo stanje, ki ga
    // AI JSON ne vsebuje — vedno prenesi iz originala (refine spreminja dneve,
    // ne datumov odhoda ne izbire dogodkov)
    refinedItinerary.tripStartDate = current.tripStartDate;
    refinedItinerary.tripEndDate = current.tripEndDate;
    if (!Array.isArray(refinedItinerary.addedEvents)) refinedItinerary.addedEvents = current.addedEvents;

    // P0.2 GEO-VALIDACIJA: preračunaj na novi strukturi (stare vrednosti bi
    // bile zastarele — refine lahko prestavi postanke med dnevi/dnevi sami)
    refinedItinerary.geoValidation = validateItineraryGeo(refinedItinerary, isEn ? "en" : "sl");

    console.log(`[itinerary/refine] AI uspešno (source: ${result.source}) — ukaz: "${instruction}"`);

    // FAZA 4-1: razlage postankov se PRERAČUNAJO na novi strukturi (nove
    // lokacije / nov zaporedni red → nove razdalje, nov kontekst)
    const withReasons = buildStopReasons(refinedItinerary, formData ?? currentAsFallbackInput, isEn ? "en" : "sl");

    return NextResponse.json({
      itinerary: withReasons,
      instruction,
      source: result.source,
    });
  } catch (error) {
    console.error("[itinerary/refine] AI napaka:", error);

    // FAZA 4-2: hitra akcija (action + day) ima DETERMINISTIČNO izvedbo —
    // izvede se tudi brez AI žetona (na produkciji je AI pogosto v fallback
    // načinu). Ni nov AI sistem: čiste transformacije nad istim datasetom
    // destinacij, vsaka sprememba poročana v `changes`.
    if (action && day) {
      const refineInput: PlannerInput = formData ?? currentAsFallbackInput;
      const result = applyQuickAction(
        current,
        refineInput,
        action,
        day,
        isEn ? "en" : "sl"
      );
      // P0.2 GEO-VALIDACIJA: tudi deterministična hitra akcija spremeni
      // strukturo dneva — preračunaj (isto čisto funkcijo kot AI pot)
      result.itinerary.geoValidation = validateItineraryGeo(
        result.itinerary,
        isEn ? "en" : "sl"
      );
      const withReasons = buildStopReasons(
        result.itinerary,
        refineInput,
        isEn ? "en" : "sl"
      );
      console.log(
        `[itinerary/refine] Hitra akcija "${action}" (dan ${day}) deterministično: ${result.changes.length} sprememb`
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
