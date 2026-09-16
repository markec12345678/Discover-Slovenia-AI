import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { ingestPins, MAX_PINS } from "@/lib/pins-ingest";

// ============================================================================
// POST /api/itinerary/ingest-pins — "Uvozi shranjene točke" (F14)
// ============================================================================
//
// Mindtripov "Google Pins" po slovensko: uporabnik prilepi ali naloži svoje
// shranjene točke Google Zemljevidov ( Takeout JSON / KML / besedilni seznam)
// → strežnik DETERMINISTIČNO ( nič AI žetonov) pripoji točke našim 22
// destinacijam — po imenu ( enaki vzorci kot url-ingest) ali po koordinatah
// ( najbližja destinacija v polmeru 25 km). Odgovor vsebuje zadetke + predlog
// vnosa za načrtovalnik; generiranje pustimo obstoječemu /api/itinerary.
//
// Poštenost ( enak princip kot pri povezavah/slikah):
//  - 0 točk v vnosu → 422 z jasnim sporočilom ( ne ugibamo oblike)
//  - 0 prepoznanih destinacij → 422 "nič izmišljujemo podobnih lokacij"
//  - pinsUnmatched se VRNE ( "N točk izven naših 22" je vidno v UI)
//
// Varnost: brez omrežnih klicev ( čisto parsovanje), rate limit 10/min na IP,
// največ 200 KB telesa / 2000 točk.
// ============================================================================

const MAX_TEXT_CHARS = 200000;

export async function POST(request: Request) {
  // Odprta javna pot ( brez prijave) → dosleden rate limit
  const limited = rateLimit(request, {
    limit: 10,
    windowMs: 60000,
    key: "itinerary-ingest-pins",
  });
  if (limited) return limited;

  let body: { pinsText?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON." }, { status: 400 });
  }

  const pinsText = typeof body.pinsText === "string" ? body.pinsText : "";
  if (pinsText.trim().length < 3) {
    return NextResponse.json(
      { error: "Manjka ali prekratko besedilo s shranjenimi točkami." },
      { status: 400 }
    );
  }
  if (pinsText.length > MAX_TEXT_CHARS) {
    return NextResponse.json(
      { error: "Vnos je prevelik (največ 200 000 znakov)." },
      { status: 413 }
    );
  }

  const result = ingestPins(pinsText);

  if (result.pinsTotal === 0) {
    // Takeout JSON brez features / KML brez Placemark / prazne vrstice
    return NextResponse.json(
      {
        error:
          "V vnosu nisem našel nobene točke. Prilepi izvoz Google Zemljevidov (JSON ali KML) ali seznam krajev — vsaka vrstica en kraj.",
        format: result.format,
      },
      { status: 422 }
    );
  }
  if (result.pinsTotal > MAX_PINS) {
    return NextResponse.json(
      { error: `Preveč točk (največ ${MAX_PINS}).` },
      { status: 413 }
    );
  }
  if (result.matches.length === 0) {
    // Poštena zavrnitev: NIČ izmišljujemo "podobnih" lokacij
    return NextResponse.json(
      {
        error:
          "Med točkami nisem prepoznal nobene slovenske destinacije iz našega podatkovnega niza (preverjamo imena in bližino do 25 km).",
        format: result.format,
        pinsTotal: result.pinsTotal,
        pinsUnmatched: result.pinsUnmatched,
      },
      { status: 422 }
    );
  }

  return NextResponse.json(
    {
      format: result.format,
      pinsTotal: result.pinsTotal,
      pinsUnmatched: result.pinsUnmatched,
      matches: result.matches,
      suggestion: result.suggestion,
    },
    { status: 200 }
  );
}
