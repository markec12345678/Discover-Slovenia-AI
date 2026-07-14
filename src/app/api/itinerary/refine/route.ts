import { NextResponse } from "next/server";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { db } from "@/lib/db";
import { generateCompletion } from "@/lib/ai-client";
import type { Itinerary, PlannerInput, DayPlan, LocationVisit } from "@/lib/types";

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
}

export async function POST(request: Request) {
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

  // Serijaliziraj trenutni itinerer za AI
  const currentItineraryStr = current.days.map((day: DayPlan) =>
    `Dan ${day.day} (${day.weather.condition}, ${day.weather.temp}°C):\n` +
    day.locations.map((loc: LocationVisit) =>
      `  - ${loc.time_slot} | ${loc.destination_name} | ${loc.duration}h | €${loc.estimated_cost} | ${loc.notes || "brez opomb"}`
    ).join("\n")
  ).join("\n\n");

  // Zgodovina prejšnjih ukazov (za kontekst)
  const historyStr = body.history && body.history.length > 0
    ? `\n\nPREJŠNJI UKAZI (že upoštevani v trenutnem itinererju):\n${body.history.map((h, i) => `${i + 1}. ${h}`).join("\n")}`
    : "";

  const systemPrompt = `Si strokovni slovenski vodič za načrtovanje potovanj. Uporabnik ima že generiran itinerer in želi, da ga POSODOBIŠ glede na njegov ukaz. Odgovori SAMO z veljavnim JSON, brez dodatnega besedila.

POMEMBNO:
- Ohrani enako strukturo JSON kot vhodni itinerer
- Število dni naj bo enako kot v vhodu razen če ukaz izrecno zahteva spremembo
- Ohrani realistične časovne okvire in cene
- Upoštevaj proračun: €${formData?.budget ?? "neznan"}
- Upoštevaj sezono: ${formData?.season ?? "nezdana"}
- Upoštevaj interese: ${formData?.interests?.join(", ") ?? "neznan"}
- Kadar ustreza, vključi sponzorirane partnerje v notes ali recommendations`;

  const userPrompt = `TRENUTNI ITINERER:
${currentItineraryStr}
${historyStr}
${sponsoredContext}

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
  "tips": ["Začni zgodaj za manj ljudi"]
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

    console.log(`[itinerary/refine] AI uspešno (source: ${result.source}) — ukaz: "${instruction}"`);
    return NextResponse.json({
      itinerary: refinedItinerary,
      instruction,
      source: result.source,
    });
  } catch (error) {
    console.error("[itinerary/refine] AI napaka:", error);

    // Fallback: vrni originalni itinerer z opombo
    return NextResponse.json({
      itinerary: current,
      instruction,
      source: "fallback",
      warning: "AI posodobitev ni uspela — prikazan je originalni itinerer.",
    }, { status: 200 });
  }
}
