import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
// ISSUE #9 (ZERO-AI/deterministic-first): VLM (vision) je edini ostanek AI
// v tej poti — SAMO za SLIKO (vizualno-semantično branje, brez besedilne
// plasti). Besedilo/PDF/e-pošta so popolnoma deterministični (0 AI žetonov,
// 0 odvisnosti od omrežja) — generateCompletion je ODSTRANJEN iz vseh
// besedilnih poti.
import { generateVisionCompletion } from "@/lib/ai-client";
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
// Issue #6 (D6-B): ICS koledarski zapisi v besedilnem kanalu — BOLJ SPECIFIČEN
// deterministični parser (VEVENT bloki) PREJ generičnega besedilnega parserja.
import {
  parseIcsReservation,
  isIcsInput,
} from "@/lib/reservation-ics-parse";
// TASK 31 (Tier 1 #3): surova e-pošta (RFC 5322) → čist MIME bralnik →
// obstoječi parserji (besedilo/ICS/PDF) — TripItov model brez storitve.
import {
  parseEmailSource,
  emailTextForParsing,
  MAX_RAW_EMAIL_CHARS,
} from "@/lib/email-mime-parse";

// ============================================================================
// POST /api/journey/bookings/parse — ISSUE #4 §4 + ISSUE #9 (ZERO-AI):
// DETERMINISTIČNA EKSTRAKCIJA REZERVACIJ (STATELESS)
// ============================================================================
// Prebere potrdilo o rezervaciji (SLIKA screenshot/foto, PDF, PRILEPLJENO
// BESEDILO e-pošte ali SUROVA E-POŠTA — glava + MIME) in vrne NORMALIZIRANA
// polja — NIČ SE NE ZAPIŠE.
//
// Načelo (ISSUE #9 — obrat vrstnega reda: prej AI prima + deterministična
// rezerva, zdaj DETERMINISTIČNI PARSER PRIMA — 0 AI žetonov, 0 odvisnosti od
// omrežja; pot besedilo/PDF/e-pošta deluje tudi brez vseh AI ključev):
//  · AI (VLM/LLM) SAMO prebere dokument in ekstrahira polja, ki so v njem
//    IZRECNO prisotna — manjkajoče ostane null (nikoli ne ugiba);
//  · normalizacija je DETERMINISTIČNA (lib/imported-reservation.ts): striže,
//    kapira, validira ceno/valuto — AI izhod NI zaupanja vreden vhod v bazo;
//  · ISSUE #9: neprepoznano besedilo → iskren 422 z nasvetom (ročni vnos)
//    — nikoli "prazen uspeh", nikoli tiha zamenjava vira;
//  · `via` iskreno razkrije KANAL: "text-parser" | "pdf-parser" |
//    "email-ics" (deterministične) | vision provider (SAMO slika);
//  · SLIKA ostaja VLM-only: iz slike ni besedilne plasti za parser (OCR bi
//    pomenil hujšo odvisnost — §28) — pošten 502 z nasvetom (ročni vnos).
//    `method:"ai"` pomeni SAMO to pot;
//  · Issue #6 (D6-B): besedilo, ki VIDETI kot ICS koledar (BEGIN:VCALENDAR),
//    prebere BOLJ SPECIFIČEN VEVENT parser
//    (lib/reservation-ics-parse.ts) PREJ generičnega besedilnega —
//    specifično pred splošnim (vrstni red nespremenjen); pogodba IDENTIČNA;
//  · TASK 31 (Tier 1 #3): { email } = SUROVA e-pošta (RFC 5322 — izvorna
//    koda iz Gmaila/Outlooka ali .eml). Deterministični MIME bralnik
//    (lib/email-mime-parse.ts, 0 odvisnosti) razstavi glavo + telo +
//    priloge; kaskada (specifično pred splošnim):
//      1. .ics priloga → VEVENT parser (0 AI — strukturirani podatki,
//         via:"email-ics");
//      2. besedilo (Subject + text/plain pred html) → ISTA kaskada kot
//         zavihek Besedilo (deterministični text-parser, 0 AI);
//      3. .pdf priloga → ISTA kaskada kot zavihek Dokument (unpdf →
//         deterministični pdf-parser);
//      4. nič uporabnega → iskren 422 z nasvetom (ročni vnos / Besedilo).
//    Subject se prišteje besedilu — pogosto nosi ponudnika + št. rezervacije.
//  · ZAPIO samo uporabnik po pregledu in potrditvi (gumb v UI) — prek
//    /api/journey/bookings/import; nezanesljiv parsing ostane DRAFT;
//  · vir parsanja razkrijemo v odgovoru (`via`) — kot pri ingest slikah.
//
// Vhod: { image: dataURL } | { pdf: dataURL } | { text: string } |
//       { email: string } — ENA možnost.
// Izhod: { fields: ParsedReservation, providerSlug, providerProductId,
//          via, needsConfirmation } — vse za predogled UI obrazca.
//
// Varnost: rate limit 6/min (drag VLM klic za sliko); slika ≤ 6 MB base64
// JPEG/PNG/WebP; PDF ≤ 8 MB base64 + max 60 strani (isti cap kot
// ingest-pdf); besedilo ≤ 20_000 znakov; e-pošta ≤ 2 MB surovega vira
// (pokrije bazo64 priloge). Dokument se NE shrani nikamor (pomnilnik →
// pozabljen).
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
 * ISSUE #9 (ZERO-AI): PRIMARNA deterministična pot besedila/PDF — 0 AI
 * žetonov, 0 omrežja (prej AI prima + regex rezerva). Iskrenost: vir je
 * razkrit (method:"deterministic", via:"text-parser"|"pdf-parser"); če
 * parser ne prepozna ključnih polj, 422 z jasnim nasvetom (ročni vnos)
 * — nikoli "praznega uspeha" in nikoli tihe nadomestitve vira.
 */
function deterministicParseResponse(
  text: string,
  via: "text-parser" | "pdf-parser"
): NextResponse {
  // Issue #6 (D6-B): če besedilo VIDETI kot ICS koledar (BEGIN:VCALENDAR),
  // uporabimo BOLJ SPECIFIČEN deterministični VEVENT parser PREJ generičnega
  // besedilnega (specifično pred splošnim — isti besedilni kanal, IDENTIČNA
  // odgovorna pogodba method/via/fields/providerSlug/…/persisted).
  const fields = isIcsInput(text)
    ? parseIcsReservation(text)
    : parseReservationText(text);
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
}

/**
 * AI (VLM) odgovor — ISSUE #9: po odstranitvi generateCompletion iz
 * besedilnih poti je to izključno SLIKA (vision provider razkrito v via);
 * ISTA pogodba kot deterministične poti (le method:"ai").
 */
function aiParseResponse(fields: ParsedReservation, via: string): NextResponse {
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
}

/**
 * TASK 31 (Tier 1 #3): deterministični izhod iz E-POŠTNE .ics priloge —
 * strukturirani podatki (VEVENT), AI ni potreben; via:"email-ics" iskreno
 * razkrije kanal (priloga koledarja v posredovani e-pošti).
 */
function deterministicEmailResponse(
  fields: ParsedReservation,
  via: string
): NextResponse {
  const providerSlug = providerSlugFromName(fields.providerName);
  const providerProductId = importedProductId(
    providerSlug,
    fields.reservationNumber
  );
  return NextResponse.json(
    {
      method: "deterministic" as const,
      via,
      fields,
      providerSlug,
      providerProductId,
      needsConfirmation: fields.needsConfirmation,
      persisted: false,
    },
    { status: 200 }
  );
}

/**
 * Skupna BESEDILO kaskada (zavihek Besedilo + besedilo iz e-pošte) —
 * ISSUE #9 (ZERO-AI): DETERMINISTIČNI PARSER JE PRIMA (0 AI žetonov,
 * 0 omrežja; prej AI prima + regex rezerva). Kaskada znotraj nje ostaja
 * specifično-pred-splošnim: ICS zaznavanje (D6-B) → VEVENT parser →
 * generični besedilni parser. Neprepoznano → iskren 422 (ročni vnos).
 */
async function textParseCascade(text: string): Promise<NextResponse> {
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json(
      { error: "Besedilo je predolgo (največ 20.000 znakov)." },
      { status: 413 }
    );
  }
  return deterministicParseResponse(text, "text-parser");
}

/**
 * Skupna PDF kaskada (zavihek Dokument + .pdf priloga iz e-pošte) —
 * ISSUE #9 (ZERO-AI): unpdf besedilna ekstrakcija (0 AI) → DETERMINISTIČNI
 * parser (0 AI žetonov, 0 omrežja; prej AI prima + regex rezerva).
 * Besedilno prazen/skeniran PDF → iskren 422 (nasvet: zavihek Slika).
 */
async function pdfParseCascade(base64: string): Promise<NextResponse> {
  // unpdf besedilna ekstrakcija (0 AI) — isti cap kot ingest-pdf.
  const pdfText = await extractPdfText(base64);
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
  // ISSUE #9 (ZERO-AI): besedilo iz PDF-a gre DIREKTNO v deterministični
  // parser (0 AI žetonov) — via:"pdf-parser" iskreno razkrije kanal.
  return deterministicParseResponse(pdfText, "pdf-parser");
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
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const provided = [image, pdf, text, email].filter(Boolean).length;
  if (provided === 0) {
    return NextResponse.json(
      {
        error:
          "Manjka vhod: image (data URL), pdf (data URL), text ali email (surova e-pošta).",
      },
      { status: 400 }
    );
  }
  if (provided > 1) {
    return NextResponse.json(
      { error: "Posreduj SAMO EN vhod (image ALI pdf ALI text ALI email)." },
      { status: 400 }
    );
  }

  try {
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
      // ISSUE #9: VLM (Gemini → z-ai veriga, F10) — EDINA AI pot te rute
      // (sliko brez besedilne plasti zna prebrati le vizualni model); isti
      // strogi ekstraktor prompt. Odpoved → pošten 502 (ročni vnos).
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
      return aiParseResponse(
        normalizeParsedReservation(vision.content),
        vision.source
      );
    }

    if (pdf) {
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
      return await pdfParseCascade(parsed.base64);
    }

    if (email) {
      // TASK 31 (Tier 1 #3): surova e-pošta → MIME razstavitev (0 AI) →
      // obstoječe kaskade. Subject se prišteje besedilu (pogosto nosi
      // ponudnika + št. rezervacije).
      if (email.length > MAX_RAW_EMAIL_CHARS) {
        return NextResponse.json(
          { error: "E-pošta je prevelika (največ 2 MB surovega vira)." },
          { status: 413 }
        );
      }
      const parsedEmail = parseEmailSource(email);
      if (!parsedEmail.ok) {
        return NextResponse.json(
          {
            error:
              "V prilepljenem besedilu ne prepoznavam strukture e-pošte (pričakovana glava s Subject/From + telo). Uporabi zavihek »Besedilo« ali vnesi rezervacijo ročno.",
          },
          { status: 422 }
        );
      }
      const msg = parsedEmail.message;
      // 1. .ics priloga — SPECIFIČNO PREJ SPLOŠNIM (structured data, 0 AI):
      if (msg.icsAttachment && isIcsInput(msg.icsAttachment)) {
        const icsFields = parseIcsReservation(msg.icsAttachment);
        if (!isReservationParseEmpty(icsFields)) {
          return deterministicEmailResponse(icsFields, "email-ics");
        }
        // prazna ICS vsebina → NE odnehaj: Subject/telo pogosto nosita
        // ponudnika + št. rezervacije → nadaljuj na besedilno kaskado.
      }
      // 2. besedilo (Subject + text/plain pred html→text) — ISTA kaskada
      //    kot zavihek Besedilo (ISSUE #9: deterministični text-parser,
      //    0 AI žetonov):
      const emailText = emailTextForParsing(msg);
      if (emailText) {
        return await textParseCascade(emailText.slice(0, MAX_TEXT_CHARS));
      }
      // 3. .pdf priloga — ISTA kaskada kot zavihek Dokument:
      if (msg.pdfAttachmentBase64) {
        return await pdfParseCascade(msg.pdfAttachmentBase64);
      }
      // 4. nič uporabnega — iskren 422 z nasvetom:
      return NextResponse.json(
        {
          error:
            "Iz e-pošte nisem prepoznal uporabne vsebine (ni berljivega besedila, .ics ali .pdf priloge). Vnesi rezervacijo ročno.",
        },
        { status: 422 }
      );
    }

    // Besedilo (prilepljena potrditvena e-pošta)
    return await textParseCascade(text);
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
