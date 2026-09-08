import { NextResponse } from "next/server";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { db } from "@/lib/db";
import { generateCompletion } from "@/lib/ai-client";
import { rankListings, buildTransparencyContext } from "@/lib/ranking-engine";
import type { Itinerary, PlannerInput, DayPlan, LocationVisit } from "@/lib/types";
import { rateLimit } from "@/lib/rate-limit";
import {
  fetchDailyForecast,
  weatherCodeToText,
} from "@/lib/weather-utils";
import { matchEventsForItinerary } from "@/lib/events-match";
import {
  buildPackingList,
  sanitizeAiPackingList,
} from "@/lib/packing-list";

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

  // Pripravi kontekst destinacij za AI
  const destContext = DESTINATIONS.map(
    (d) =>
      `- ${d.id} (${d.name}): ${d.type}/${d.region}, ${d.duration}, €${d.costPerPerson}/osebo, ocena ${d.rating}, aktivnosti: ${d.activities.join(", ")}. Najboljše za: ${d.bestFor.join(", ")}. Sezona: ${d.bestSeason.join(", ")}`
  ).join("\n");

  // === RANKING ENGINE ===
  // Uporabi ranking engine za pridobitev najboljših partnerjev
  // Ranking: relevance (60%) + quality (15%) + rating (10%) + distance (10%) + premium (5%)
  let partnerContext = "";
  try {
    const ranked = await rankListings({
      interests: input.interests,
      season: input.season,
    });

    if (ranked.length > 0) {
      partnerContext = buildTransparencyContext(ranked, 15);
      console.log(`[itinerary] Ranking engine: ${ranked.length} kandidatov, top: ${ranked[0].listing.name} (Q:${ranked[0].qualityScore})`);
    }
  } catch (e) {
    console.error("[itinerary] ranking engine napaka:", e);
  }

  const systemPrompt = `Si strokovni slovenski vodič za načrtovanje potovanj. Generiraš realističen itinerer za Slovenijo v JSON formatu. Odgovori SAMO z veljavnim JSON, brez dodatnega besedila ali kode.

POMEMBNO: Predlagani partnerji so razvrščeni po ustreznosti in kakovosti (Q = Quality Score). Kadar je mogoče, vključi partnerje z višjim Q v notes ali recommendations polja. [SPONZORIRANO] in [FEATURED] oznake pomenijo premium partnerje.`;

  const userPrompt = `Generiraj ${input.days}-dnevni itinerer za Slovenijo.

Potnik:
- Proračun: €${input.budget}
- Interesi: ${input.interests.join(", ")}
- Sezona: ${input.season}
- Skupina: ${input.groupSize} oseb(a)

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
8. Kadar ustreza, v notes ali recommendations omeni predlagane partnerje (npr. "Za kosilo obiščite Restavracijo JB v Ljubljani")
9. V notes dodaj ocenjen čas vožnje do naslednje lokacije (npr. "30 min vožnje do Bohinja")
10. "packing_list": 8-14 konkretnih stvari za ta izlet (sezona, interesi, trajanje)

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
          "notes": "Jutranji obisk, najboljša svetloba za fotografije. Za kosilo obiščite Penzion Berc."
        }
      ],
      "weather": { "condition": "sončno", "temp": 22 }
    }
  ],
  "total_budget": 500,
  "recommendations": ["Vzemi sončna očala", "Rezerviraj čoln vnaprej pri Pletna Bled"],
  "tips": ["Začni zgodaj za manj ljudi"],
  "packing_list": ["Sončna krema SPF 50", "Pohodniški čevlji", "Evrovi gotovina"]
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
    itinerary.packingList =
      sanitizeAiPackingList(parsed.packing_list) ??
      buildPackingList({
        season: input.season,
        interests: input.interests,
        days: input.days,
      });

    // PRAVO vreme — vreme iz AI izhoda prepišemo z realno Open-Meteo prognozo
    const enriched = await enrichWithRealWeather(itinerary);

    // Dogodki na obiskanih destinacijah (neodvisno od vremena — ločeno polje)
    enriched.events = matchEventsForItinerary(enriched.days, 6);

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("[itinerary] AI napaka, uporabljam fallback:", error);
    const fallback = await enrichWithRealWeather(
      generateFallbackItinerary(input)
    );

    // Fallback: hevristični pakirni seznam + dogodki (isti enrich kot AI pot)
    fallback.packingList = buildPackingList({
      season: input.season,
      interests: input.interests,
      days: input.days,
    });
    fallback.events = matchEventsForItinerary(fallback.days, 6);

    return NextResponse.json(fallback);
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
async function enrichWithRealWeather(itinerary: Itinerary): Promise<Itinerary> {
  try {
    const firstLoc = itinerary.days[0]?.locations?.[0];
    if (!firstLoc?.destination_id) return itinerary;

    const dest = DESTINATIONS.find((d) => d.id === firstLoc.destination_id);
    if (!dest) return itinerary;

    const daily = await fetchDailyForecast(
      dest.coords.lat,
      dest.coords.lng,
      itinerary.days.length
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
          condition: weatherCodeToText(forecast.weatherCode),
          temp: Math.round(forecast.tempMax),
        },
      };

      // Dež alternative — dodaj v tips, če je verjetnost padavin visoka
      if ((forecast.precipitationProbabilityMax ?? 0) >= 60) {
        const tip = `Dan ${i + 1}: verjeten dež — alternative: Postojnska/Škocjanske jame, muzeji, terme Terme Olimia.`;
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
function generateFallbackItinerary(input: PlannerInput): Itinerary {
  // Filtriraj sezonsko ustrezne destinacije
  const suitable = DESTINATIONS.filter((d) => d.bestSeason.includes(input.season));
  const pool = suitable.length >= input.days * 2 ? suitable : DESTINATIONS;

  // Ocenjevalnik: ujemanje interesov
  const score = (d: (typeof DESTINATIONS)[number]) =>
    d.bestFor.filter((b) => input.interests.includes(b)).length +
    d.rating / 10;

  const ranked = [...pool].sort((a, b) => score(b) - score(a));

  const days: DayPlan[] = [];
  let totalCost = 0;
  let destIndex = 0;

  for (let day = 1; day <= input.days; day++) {
    const locationsPerDay = 2;
    const locations: LocationVisit[] = [];

    for (let i = 0; i < locationsPerDay; i++) {
      const dest = ranked[destIndex % ranked.length];
      destIndex++;
      const cost = dest.costPerPerson * input.groupSize;
      totalCost += cost;
      const startHour = 9 + i * 5;
      locations.push({
        destination_id: dest.id,
        destination_name: dest.name,
        time_slot: `${String(startHour).padStart(2, "0")}:00-${String(startHour + 4).padStart(2, "0")}:00`,
        duration: 4,
        estimated_cost: cost,
        notes: dest.tagline,
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
    recommendations: [
      "Rezerviraj nastanitev vsaj 2 tedna vnaprej",
      "Prenesi offline zemljevid za pohode",
      "Vzemi plastenke za vodo — pitna voda je povsod",
    ],
    tips: [
      "Začni zgodaj zjutraj za manj ljudi in boljšo svetlobo",
      "V gorah preveri vreme isti dan",
      "Lokalni marketi imajo najboljše cene za prigrizke",
    ],
    source: "fallback",
  };
}
