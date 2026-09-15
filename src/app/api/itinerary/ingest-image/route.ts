import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { matchDestinationsInText } from "@/lib/url-ingest";
import { generateVisionCompletion } from "@/lib/ai-client";

// ============================================================================
// POST /api/itinerary/ingest-image — "Začni s sliko" (F8, MindTrip "Start
// Anywhere" s slikami)
// ============================================================================
//
// Konkurenčna referenca: MindTrip-ov "Start Anywhere" sprejema tudi SLIKE
// (App Store: "share images"). Naš F5.4 URL ingest je tekstovni — ta pot
// razširi isti vnos na fotografije/screenshot-e (Instagram post, okvir iz
// videa, infografika potovanja …).
//
// NAČELO ZNAMKE (deljena resnica s F5.4): AI (VLM) LE PREBERE sliko in
// izpiše imena krajev/orientirjev/vidnega besedila — UJEMANJE z našimi 22
// destinacijami je DETERMINISTIČNO (ista čista funkcija
// matchDestinationsInText kot pri povezavah). VLM torej NE izbira
// destinacij; samo ekstrahira besedilo, ki ga preverimo against našega
// podatkovnega niza. Če ni zadetkov, rečemo TO (422) — nič "podobnih"
// lokacij ne izmišljujemo.
//
// Poštenost v odgovoru: `method: "vlm"` + `via` (kateri vision provider
// je sliko dejansko bral — F10: Gemini v produkciji, z-ai VLM v sandbox
// razvoju) + `vlmChars` — UI razkrije, da je prepoznavanje potekalo po AI
// poti (za razliko od povezav, kjer je besedilno ujemanje čisto
// deterministično). VLM znaki SE NE vračajo (zasebnost — slika se obdela
// v pomnilniku in pozabi).
//
// Varnost:
//  - sprejmemo SAMO data URL s podprto vrsto (jpeg/png/webp) + base64
//  - največ 6 MB base64 (~4,5 MB dekodirano)
//  - rate limit 6 klicev/min na IP (odprta javna pot, dražji od HTML
//    prenosov — zato nižji kot 10/min pri povezavah)
//  - slika se NE shranjuje nikamor; vision klic dobi base64 v pomnilniku
//    (timeout 45 s — v ai-client generateVisionCompletion)
// ============================================================================

const MAX_BASE64_CHARS = 6 * 1024 * 1024; // ~4,5 MB dekodirane slike

/** Podprte vrste slik (MIME → prijazno ime za napake). */
const SUPPORTED_MIME: Record<string, string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
};

/**
 * VLM prompt — STROG obrazec: seznam imen, brez komentarjev. Ključno za
 * deterministično nadaljevanje: izpis je VHOD za matchDestinationsInText,
 * zato no pripovedi, razlag ali HTML.
 */
const VLM_PROMPT = [
  "You are a strict place-name extractor for a travel planner.",
  "Look at this image (a photo, screenshot, or infographic about Slovenia,",
  "or possibly about somewhere else).",
  "List EVERY place name, landmark, region, and readable text you can see,",
  "in original language AND English if both appear (e.g. 'Postojnska jama',",
  "'Postojna Cave', 'Lake Bled', 'Bled', 'Triglav', 'Soča', 'Piran' …).",
  "Rules:",
  "- One name per line, nothing else — no numbering, no commentary, no HTML.",
  "- Include text visible on signs, captions, watermarks, maps.",
  "- If you see NO place names at all, output exactly: NONE",
  "Do not guess names that are not visible. Do not invent destinations.",
].join("\n");

/** Razčleni in validiraj data URL slike. Vrne { mime, base64 } ali null. */
function parseImageDataUrl(
  raw: string
): { mime: string; base64: string } | null {
  const m = raw.match(/^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!SUPPORTED_MIME[mime]) return null;
  // Notranji beli prostor (news v base64 iz JSON) očistimo — VLM SDK pričakuje
  // čist base64 v data URL
  const base64 = m[2].replace(/\s+/g, "");
  if (base64.length === 0) return null;
  return { mime, base64 };
}

export async function POST(request: Request) {
  // Odprta javna pot → dosleden rate limit (nižji od povezav: VLM strošek)
  const limited = rateLimit(request, {
    limit: 6,
    windowMs: 60000,
    key: "itinerary-ingest-image",
  });
  if (limited) return limited;

  let body: { image?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON." }, { status: 400 });
  }

  const raw = typeof body.image === "string" ? body.image.trim() : "";
  if (!raw) {
    return NextResponse.json(
      { error: "Manjka slika (pričakovan data URL)." },
      { status: 400 }
    );
  }

  if (raw.length > MAX_BASE64_CHARS) {
    return NextResponse.json(
      { error: "Slika je prevelika (največ ~4,5 MB)." },
      { status: 413 }
    );
  }

  const parsed = parseImageDataUrl(raw);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "Nepodprta slika. Sprejmemo JPEG, PNG ali WebP kot data URL (data:image/…;base64,…).",
      },
      { status: 400 }
    );
  }

  // === Vision klic (STREŽNIŠKO — F10 veriga v ai-client: Gemini → z-ai VLM)
  // ===
  // generateVisionCompletion poskusi Geminija (OpenAI-compat image_url;
  // produkcija na Vercel/Render, regija kjer API deluje) in ob napaki pade
  // na z-ai VLM (razvojni sandbox). Oba poganjata ISTI strog ekstraktor
  // prompt zgoraj; ujemanje spodaj ostaja DETERMINISTIČNO — provider samo
  // PREBRE sliko, ne izbira destinacij.
  const vision = await generateVisionCompletion(
    VLM_PROMPT,
    `data:${parsed.mime};base64,${parsed.base64}`,
    { maxTokens: 2048 } // F10: ekstraktor + thinking proračun (Gemini 3.x)
  );

  if (!vision) {
    console.error(
      "[ingest-image] vision napaka: vsi providerji (Gemini + z-ai VLM) odpovedali"
    );
    return NextResponse.json(
      {
        error:
          "Slike ni bilo mogoče prepoznati (AI storitev trenutno ni dosegljiva). Poskusi kasneje ali uporabi povezavo.",
      },
      { status: 502 }
    );
  }

  const vlmText = vision.content;
  const visionVia = vision.source; // poštenost: kdo je bral sliko

  // Poštena "nič" iz VLM (NONE) → obravnavamo kot prazno besedilo
  const isNone = /^none\b/i.test(vlmText.trim());
  const textForMatching = isNone ? "" : vlmText;

  // === DETERMINISTIČNO ujemanje (ista funkcija kot pri povezavah) ===
  const result = matchDestinationsInText(textForMatching, null);

  if (result.matches.length === 0) {
    // Poštena zavrnitev — NIČ izmišljujemo (enako kot pri URL ingestu)
    return NextResponse.json(
      {
        error:
          "Na sliki nisem prepoznal nobene slovenske destinacije iz našega podatkovnega niza.",
        method: "vlm" as const,
        via: visionVia,
        vlmChars: vlmText.length,
      },
      { status: 422 }
    );
  }

  return NextResponse.json(
    {
      method: "vlm" as const,
      via: visionVia,
      vlmChars: vlmText.length,
      matches: result.matches,
      suggestion: result.suggestion,
    },
    { status: 200 }
  );
}
