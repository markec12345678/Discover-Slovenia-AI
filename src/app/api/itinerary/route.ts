import { NextResponse } from "next/server";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { db } from "@/lib/db";
import { generateCompletion } from "@/lib/ai-client";
import { rankListings, buildTransparencyContext } from "@/lib/ranking-engine";
import type { Itinerary, PlannerInput, DayPlan, LocationVisit } from "@/lib/types";

// POST /api/itinerary - generira AI itinerer z z-ai-web-dev-sdk
// AI prioritizira SPONZORIRANE lokale (premium/enterprise stranke ki plačajo za vključitev)
export async function POST(request: Request) {
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
  "tips": ["Začni zgodaj za manj ljudi"]
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
    return NextResponse.json(itinerary);
  } catch (error) {
    console.error("[itinerary] AI napaka, uporabljam fallback:", error);
    const fallback = generateFallbackItinerary(input);
    return NextResponse.json(fallback);
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
    const locations = [];

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
