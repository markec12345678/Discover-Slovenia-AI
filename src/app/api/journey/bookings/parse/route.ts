import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  generateVisionCompletion,
  generateCompletion,
} from "@/lib/ai-client";
import {
  RESERVATION_PARSE_PROMPT,
  normalizeParsedReservation,
  providerSlugFromName,
  importedProductId,
  type ParsedReservation,
} from "@/lib/imported-reservation";
import {
  parseReservationText,
  isReservationParseEmpty,
} from "@/lib/reservation-text-parse";

// ============================================================================
// POST /api/journey/bookings/parse — ISSUE #4 §4: STATELESS AI EKSTRAKCIJA
// ============================================================================
// Prebere potrdilo o rezervaciji (SLIKA screenshot/foto, PDF ali PRILEPLJENO
// BESEDILO e-pošte) in vrne NORMALIZIRANA polja — NIČ SE NE ZAPIŠE.
//
// Načelo (ista disciplina kot ingest-image / ingest-pdf):
//  · AI (VLM/LLM) SAMO prebere dokument in ekstrahira polja, ki so v njem
//    IZRECNO prisotna — manjkajoče ostane null (nikoli ne ugiba);
//  · normalizacija je DETERMINISTIČNA (lib/imported-reservation.ts): striže,
//    kapira, validira ceno/valuto — AI izhod NI zaupanja vreden vhod v bazo;
//  · M1 (Issue #5 / T5-D): če AI ni na voljo (brez ključev/timeout) ALI vrne
//    neuporaben izhod, PDF in BESEDILO padejo na deterministični regex
//    parser (lib/reservation-text-parse.ts) — vir je iskreno razkrit
//    (method:"deterministic", via:"fallback"). SLIKA ostane AI-only:
//    iz slike ni besedila za regex — pošten 502 z nasvetom (ročni vnos);
//  · ZAPIO samo uporabnik po pregledu in potrditvi (gumb v UI) — prek
//    /api/journey/bookings/import; nezanesljiv parsing ostane DRAFT;
//  · vir parsanja razkrijemo v odgovoru (`via`) — kot pri ingest slikah.
//
// Vhod: { image: dataURL } | { pdf: dataURL } | { text: string } (ena možnost).
// Izhod: { fields: ParsedReservation, providerSlug, providerProductId,
//          via, needsConfirmation } — vse za predogled UI obrazca.
//
// Varnost: rate limit 6/min (drag AI klic); slika ≤ 6 MB base64 JPEG/PNG/WebP;
// PDF ≤ 8 MB base64 + max 60 strani (isti cap kot ingest-pdf); besedilo ≤
// 20_000 znakov. Dokument se NE shrani nikamor (pomnilnik → pozabljen).
// ============================================================================

const MAX_BASE64_CHARS_IMAGE = 6 * 1024 * 1024;
const MAX_BASE64_CHARS_PDF = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 20_000;
const MAX_PDF_PAGES = 60;

const SUPPORTED_MIME: Record<string, string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
};

function parseImageDataUrl(
  raw: string
): { mime: string; base64: string } | null {
  const m = raw.match(/^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!SUPPORTED_MIME[mime]) return null;
  const base64 = m[2].replace(/\s+/g, "");
  if (base64.length === 0) return null;
  return { mime, base64 };
}

function parsePdfDataUrl(raw: string): { base64: string } | null {
  const m = raw.match(/^data:application\/pdf;base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return null;
  // M1 (T5-D): POPOVLJENA obstoječa napaka — regex ima ENO skupino (bazo),
  // stara koda je brala m[2] (undefined → TypeError → 503 za VELJAVNE PDF-e).
  const base64 = m[1].replace(/\s+/g, "");
  if (base64.length === 0) return null;
  // Magicka glava (isti fail-closed kot ingest-pdf): brez %PDF- to ni PDF.
  const head = Buffer.from(base64.slice(0, 1024), "base64").toString("latin1");
  if (!head.startsWith("%PDF-")) return null;
  return { base64 };
}

/**
 * M1 (T5-D): AI je odpovedal (brez ključev/timeout) ali vrnil prazen izhod
 * → DETERMINISTIČNI regex parser nad besedilom (0 AI). Iskrenost: vir je
 * razkrit (method:"deterministic", via:"fallback"); če tudi parser ne
 * prepozna ključnih polj, 422 z jasnim nasvetom (ročni vnos) — nikoli
 * "praznega uspeha" in nikoli tihe nadomestitve vira.
 */
function deterministicParseResponse(text: string): NextResponse {
  const fields = parseReservationText(text);
  if (isReservationParseEmpty(fields)) {
    return NextResponse.json(
      {
        error:
          "Iz besedila nisem prepoznal ključnih polj (ponudnik, št. rezervacije ali datum). Vnesi rezervacijo ročno ali prilepi popolnejše potrdilo.",
      },
      { status: 422 }
    );
  }
  const providerSlug = providerSlugFromName(fields.providerName);
  const providerProductId = importedProductId(
    providerSlug,
    fields.reservationNumber
  );
  return NextResponse.json(
    {
      method: "deterministic" as const,
      via: "fallback",
      fields,
      providerSlug,
      providerProductId,
      needsConfirmation: fields.needsConfirmation,
      // ISKRENOST: parse SAMO prebere — zapis (tudi CONFIRMED) zahteva
      // uporabnikovo potrditev v naslednjem koraku (import ruta).
      persisted: false,
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const limited = rateLimit(request, {
    limit: 6,
    windowMs: 60_000,
    key: "reservation-parse",
  });
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  const image = typeof body.image === "string" ? body.image.trim() : "";
  const pdf = typeof body.pdf === "string" ? body.pdf.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const provided = [image, pdf, text].filter(Boolean).length;
  if (provided === 0) {
    return NextResponse.json(
      { error: "Manjka vhod: image (data URL), pdf (data URL) ali text." },
      { status: 400 }
    );
  }
  if (provided > 1) {
    return NextResponse.json(
      { error: "Posreduj SAMO EN vhod (image ALI pdf ALI text)." },
      { status: 400 }
    );
  }

  try {
    let fields: ParsedReservation;
    let via: string;

    if (image) {
      if (image.length > MAX_BASE64_CHARS_IMAGE) {
        return NextResponse.json(
          { error: "Slika je prevelika (največ ~4,5 MB)." },
          { status: 413 }
        );
      }
      const parsed = parseImageDataUrl(image);
      if (!parsed) {
        return NextResponse.json(
          {
            error:
              "Nepodprta slika. Sprejmemo JPEG, PNG ali WebP kot data URL.",
          },
          { status: 400 }
        );
      }
      // VLM (Gemini → z-ai veriga, F10) — isti strogi ekstraktor prompt.
      const vision = await generateVisionCompletion(
        RESERVATION_PARSE_PROMPT,
        `data:${parsed.mime};base64,${parsed.base64}`,
        { maxTokens: 2048, usageLog: { feature: "reservation_parse" } }
      );
      if (!vision) {
        return NextResponse.json(
          {
            error:
              "Slike ni bilo mogoče prebrati (AI storitev trenutno ni dosegljiva). Poskusi kasneje ali vnesi rezervacijo ročno.",
          },
          { status: 502 }
        );
      }
      via = vision.source;
      fields = normalizeParsedReservation(vision.content);
    } else if (pdf) {
      if (pdf.length > MAX_BASE64_CHARS_PDF) {
        return NextResponse.json(
          { error: "PDF je prevelik (največ ~6 MB)." },
          { status: 413 }
        );
      }
      const parsed = parsePdfDataUrl(pdf);
      if (!parsed) {
        return NextResponse.json(
          {
            error:
              "Nepodprt PDF (pričakovan data URL application/pdf z veljavno glavo).",
          },
          { status: 400 }
        );
      }
      // unpdf besedilna ekstrakcija (0 AI) — isti cap kot ingest-pdf.
      const pdfText = await extractPdfText(parsed.base64);
      if (pdfText == null) {
        return NextResponse.json(
          {
            error:
              "PDF ni bil mogoče prebrati. Če je skeniran (slika), naredi posnetek zaslona in uporabi zavihek Slika.",
          },
          { status: 422 }
        );
      }
      if (pdfText.trim().length === 0) {
        return NextResponse.json(
          {
            error:
              "V PDF-u ni besedila (skeniran dokument) — naredi posnetek zaslona in uporabi zavihek Slika.",
          },
          { status: 422 }
        );
      }
      const completion = await generateCompletion(
        [
          {
            role: "user" as const,
            content: `${RESERVATION_PARSE_PROMPT}\n\n--- DOCUMENT TEXT ---\n${pdfText.slice(0, 60_000)}`,
          },
        ],
        {
          jsonMode: true,
          maxTokens: 2048,
          usageLog: { feature: "reservation_parse" },
        }
      );
      if (!completion) {
        // M1 (T5-D): AI nedosegljiv → deterministični parser nad unpdf
        // besedilom (ista besedila, ki bi jih dobil LLM — 0 AI žetonov).
        return deterministicParseResponse(pdfText);
      }
      via = completion.source;
      fields = normalizeParsedReservation(completion.content);
      // AI je odgovoril, a ničesar ni izluščil (deformiran izhod) → rezerva
      // nad istim besedilom; če tudi ta ne prepozna nič → iskren 422 znotraj
      // deterministicParseResponse (napaka je v dokumentu, ne v storitvi).
      if (
        fields.providerName == null &&
        fields.reservationNumber == null &&
        fields.startDateTime == null
      ) {
        return deterministicParseResponse(pdfText);
      }
    } else {
      // Besedilo (prilepljena potrditvena e-pošta)
      if (text.length > MAX_TEXT_CHARS) {
        return NextResponse.json(
          { error: "Besedilo je predolgo (največ 20.000 znakov)." },
          { status: 413 }
        );
      }
      const completion = await generateCompletion(
        [
          {
            role: "user" as const,
            content: `${RESERVATION_PARSE_PROMPT}\n\n--- DOCUMENT TEXT ---\n${text}`,
          },
        ],
        {
          jsonMode: true,
          maxTokens: 2048,
          usageLog: { feature: "reservation_parse" },
        }
      );
      if (!completion) {
        // M1 (T5-D): AI nedosegljiv → deterministični parser nad prilepljenim
        // besedilom (0 AI žetonov, enaka normalizacija kot AI pot).
        return deterministicParseResponse(text);
      }
      via = completion.source;
      fields = normalizeParsedReservation(completion.content);
      if (
        fields.providerName == null &&
        fields.reservationNumber == null &&
        fields.startDateTime == null
      ) {
        return deterministicParseResponse(text);
      }
    }

    const providerSlug = providerSlugFromName(fields.providerName);
    const providerProductId = importedProductId(
      providerSlug,
      fields.reservationNumber
    );

    return NextResponse.json(
      {
        method: "ai" as const,
        via,
        fields,
        providerSlug,
        providerProductId,
        needsConfirmation: fields.needsConfirmation,
        // ISKRENOST: parse SAMO prebere — zapis (tudi CONFIRMED) zahteva
        // uporabnikovo potrditev v naslednjem koraku (import ruta).
        persisted: false,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[journey/bookings/parse] POST napaka:", error);
    return NextResponse.json(
      { error: "Branje dokumenta trenutno ni možno" },
      { status: 503 }
    );
  }
}

/** PDF besedilo prek unpdf (dinamičen uvoz — teža samo na tej poti). */
async function extractPdfText(base64: string): Promise<string | null> {
  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const buffer = Buffer.from(base64, "base64");
    const data = new Uint8Array(buffer);
    const pdf = await getDocumentProxy(data);
    if (pdf.numPages > MAX_PDF_PAGES) return null;
    const { text } = await extractText(pdf, { mergePages: true });
    return typeof text === "string" ? text : null;
  } catch {
    return null;
  }
}
