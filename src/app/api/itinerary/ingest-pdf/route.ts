import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { matchDestinationsInText } from "@/lib/url-ingest";
import { extractText, getDocumentProxy } from "unpdf";

// ============================================================================
// POST /api/itinerary/ingest-pdf — D3 "Začni s PDF-jem" (nabor #2)
// ============================================================================
//
// MindTrip-ov "Start Anywhere" sprejema tudi PDF (pobršurani vodniki,
// izvoženi itinerarji konkurentov, potrdila rezervacij). F5.4 pokriva
// povezavo, F8 sliko, F14 pins — ta ruta doda PDF čisto DETERMINISTIČNO:
// besedilo izvlečemo z unpdf (pdf.js — 0 AI žetonov), nato ISTA funkcija
// matchDestinationsInText poveže z našimi destinacijami kot pri vseh
// ostalih virih. Če ni zadetkov, rečemo TO (422) — nič "podobnih" lokacij
// ne izmišljujemo.
//
// Skeniran PDF (slika besedila) nima besedilne plasti → poštena napaka
// 422 z nasvetom, naj uporabijo zavihek Slika (VLM pot, F8).
//
// Varnost:
//  - sprejmemo SAMO data URL application/pdf (base64), največ ~6 MB
//    dekodirano (8 MB base64)
//  - rate limit 10 klicev/min na IP (enako kot povezave — 0 AI stroška)
//  - PDF se NE shranjuje; besedilo se obdela v pomnilniku in pozabi
//    (nazaj vrnemo samo zadetke + število strani/znakov)
// ============================================================================

const MAX_BASE64_CHARS = 8 * 1024 * 1024; // ~6 MB dekodiranega PDF
const MAX_TEXT_CHARS = 400000; // enaka meja kot pri povezavah
const MAX_PAGES = 60; // nad tem je vir verjetno zloraba, ne vodnik

/** Razčleni in validiraj data URL PDF-ja. Vrne { base64 } ali null. */
function parsePdfDataUrl(raw: string): { base64: string } | null {
  const m = raw.match(
    /^data:(?:application\/pdf|application\/x-pdf);base64,([A-Za-z0-9+/=\s]+)$/
  );
  if (!m) return null;
  const base64 = m[1].replace(/\s+/g, "");
  if (base64.length === 0) return null;
  return { base64 };
}

export async function POST(request: Request) {
  // Odprta javna pot → rate limit (deterministična, enako kot povezave)
  const limited = rateLimit(request, {
    limit: 10,
    windowMs: 60000,
    key: "itinerary-ingest-pdf",
  });
  if (limited) return limited;

  let body: { pdf?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON." }, { status: 400 });
  }

  const raw = typeof body.pdf === "string" ? body.pdf.trim() : "";
  if (!raw) {
    return NextResponse.json(
      { error: "Manjka PDF (pričakovan data URL)." },
      { status: 400 }
    );
  }

  if (raw.length > MAX_BASE64_CHARS) {
    return NextResponse.json(
      { error: "PDF je prevelik (največ ~6 MB)." },
      { status: 413 }
    );
  }

  const parsed = parsePdfDataUrl(raw);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "Nepodprt vir. Sprejmem PDF kot data URL (data:application/pdf;base64,…).",
      },
      { status: 400 }
    );
  }

  // === Dekodiraj + razčleni besedilo (unpdf / pdf.js, 0 AI) ===
  const bytes = Buffer.from(parsed.base64, "base64");
  // Magija PDF formata ("%PDF-") — zavrnimo pretvorbe dvojni-base64 in podobno
  if (bytes.length < 8 || bytes.toString("ascii", 0, 5) !== "%PDF-") {
    return NextResponse.json(
      { error: "Datoteka ni veljaven PDF." },
      { status: 400 }
    );
  }

  let text = "";
  let totalPages = 0;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    totalPages = pdf.numPages;
    if (totalPages > MAX_PAGES) {
      return NextResponse.json(
        {
          error: `PDF ima preveč strani (${totalPages}; največ ${MAX_PAGES}).`,
        },
        { status: 413 }
      );
    }
    const extracted = await extractText(pdf, { mergePages: true });
    // mergePages: true → text je združen niz (tip je string)
    text = typeof extracted.text === "string" ? extracted.text : "";
  } catch (err) {
    console.error("[ingest-pdf] unpdf napaka:", err);
    return NextResponse.json(
      {
        error:
          "PDF-ja ni bilo mogoče prebrati (poškodovana ali neobičajna datoteka).",
      },
      { status: 422 }
    );
  }

  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS);
  if (clean.length < 40) {
    // Tipičen primer: SKENIRAN PDF (slika besedila) — usmeri na zavihek Slika
    return NextResponse.json(
      {
        error:
          "PDF ne vsebuje berljivega besedila (verjetno je skeniran) — naloži ga kot sliko v zavihku Slika.",
        pages: totalPages,
      },
      { status: 422 }
    );
  }

  // === DETERMINISTIČNO ujemanje (ista funkcija kot pri povezavah/slikah) ===
  const result = matchDestinationsInText(clean, null);
  if (result.matches.length === 0) {
    // Poštena zavrnitev — NIČ izmišljujemo (enako kot pri ostalih virih)
    return NextResponse.json(
      {
        error:
          "V PDF-ju nisem prepoznal nobene slovenske destinacije iz našega podatkovnega niza.",
        pages: totalPages,
      },
      { status: 422 }
    );
  }

  return NextResponse.json(
    {
      method: "pdf" as const,
      pages: totalPages,
      pdfChars: clean.length,
      matches: result.matches,
      suggestion: result.suggestion,
    },
    { status: 200 }
  );
}
