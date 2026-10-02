// ============================================================================
// TRIP CHAT — čisti helperji skupinskega klepeta z @AI (W2, Issue #15)
// ============================================================================
//
// Skupinski klepet na /pot/[shareId] (nadgradnja obstoječih TripComment
// komentarjev — ZERO FEATURE LOSS, zgodovina postane klepet):
//   - uporabnik v sporočilu omeni @AI → deterministični svetovalec odgovori
//     kot nova (strežniško izstavljena) vrstica z authorName "AI svetovalec";
//   - AI odgovor lahko prinese PREDLOGE krajev (gumb "Dodaj v pot" — isti
//     kanon kot klepet "+") in citate uradnih virov STO;
//   - Mindtripov vzorec "@Mindtrip AI v skupinskem klepetu", po našem
//     modelu: odgovori so deterministični, iz realnih podatkov platforme.
//
// VSE funkcije so ČISTE (brez DB/fetch) — jih pokrivajo testi enote.

import { isValidChatPlace } from "@/lib/chat-add-place";
import type { ChatPlace } from "@/lib/geo-intent";
import type { StoCitation } from "@/lib/rag/types";

/** Prikazno ime AI svetovalca v skupinskem klepetu — kanonično (DB) ime;
 *  /pot je od 1.164.0 (#24 Sklop 1) dvojezična {sl,en}: EN prikaz je
 *  AI_ADVISOR_NAME_EN (samo prikazna preklop — DB ime ostaja tole). */
export const AI_ADVISOR_NAME = "AI svetovalec";

/** ISSUE #24 Sklop 1 (1.164.0): prikazno ime AI svetovalca na EN površini
 *  (/en/pot/…). DB ostaja kanonično SL ime (rezervirana imena že vsebujejo
 *  "ai advisor" — ponarejanje ni mogoče); to je SAMO prikazna preklop. */
export const AI_ADVISOR_NAME_EN = "AI Advisor";

/**
 * Rezervirana imena — uporabnik jih NE sme uporabiti kot authorName
 * (prepreči ponarejanje AI značke v POST /api/trip-comments).
 * Primerjava po normalizaciji (brez ločil, lowercase).
 */
const RESERVED_AUTHOR_NAMES = new Set([
  "ai svetovalec",
  "ai svetovalka",
  "ai advisor",
  "ai",
  "ai pomočnik",
]);

/** Normalizacija imena za primerjavo (diakritika, presledki, lowercase). */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Ali je to ime rezervirano za AI svetovalca?
 * (POST /api/trip-comments ga zavre s 400 — značka je strežniška.)
 */
export function isReservedAuthorName(name: string): boolean {
  const n = normalizeName(name);
  return n.length > 0 && RESERVED_AUTHOR_NAMES.has(n);
}

/**
 * Ali sporočilo OBUJE @AI svetovalca?
 * Prepozna "@AI" / "@ai" (case-insensitive) kot besedo na začetku ali za
 * presledkom — NE znotraj drugih besed (email@aim... ne šteje).
 * Prav tako sprejme slovensko različico "@svetovalec".
 */
export function isAiMention(text: string): boolean {
  return /(^|\s)@(ai|svetovalec|advisor)\b/i.test(text.trim());
}

/**
 * Odstrani @AI omembo iz sporočila (vprašanje za svetovalca).
 * Odstrani VSE pojavitve žetona @ai/@svetovalec/@advisor in pobriše dvojne
 * presledke; vrne triman niz (lahko prazen — "samo @AI" ni vprašanje).
 */
export function stripAiMention(text: string): string {
  return text
    .replace(/(^|\s)@(ai|svetovalec|advisor)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// JSON priloga AI odgovora (TripComment.payload) — veljavnost + gradnja
// ---------------------------------------------------------------------------

/** Uspešno razčlenjena priloga AI vrstice ( klient vedno znova validira). */
export interface AiChatPayload {
  places: ChatPlace[];
  sources: StoCitation[];
}

/** Kapice iste kot /api/chat odgovor (5 virov STO; kraji ≤ 8, iz pois). */
const MAX_PLACES = 8;
const MAX_SOURCES = 5;

/** Strežniško preveri obliko citata STO (ista polja kot chatbot validacija). */
function isValidCitation(s: unknown): s is StoCitation {
  if (!s || typeof s !== "object") return false;
  const c = s as Partial<StoCitation>;
  return (
    typeof c.title === "string" &&
    c.title.length > 0 &&
    typeof c.url === "string" &&
    c.url.length > 0 &&
    typeof c.section === "string" &&
    (c.lang === "sl" || c.lang === "en") &&
    (c.destinationSlug === undefined ||
      typeof c.destinationSlug === "string") &&
    (c.destinationName === undefined ||
      typeof c.destinationName === "string")
  );
}

/**
 * Zgradi (strežniško) JSON prilogo AI odgovora — z kapami.
 * Vrne null, če ni ne krajev ne virov (vrstica takrat ne rabi priloge).
 */
export function buildAiPayload(
  places: ChatPlace[],
  sources: StoCitation[]
): string | null {
  const cleanPlaces = places.filter(isValidChatPlace).slice(0, MAX_PLACES);
  const cleanSources = sources.filter(isValidCitation).slice(0, MAX_SOURCES);
  if (cleanPlaces.length === 0 && cleanSources.length === 0) return null;
  return JSON.stringify({
    places: cleanPlaces,
    sources: cleanSources,
  });
}

/**
 * Defenzivno razčleni prilogo AI vrstice (klient — shranjenemu JSON-u
 * NIKOLI ne zaupamo; pokvarjena/prevelika priloga → prazna).
 */
export function parseAiPayload(raw: string | null | undefined): AiChatPayload {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 20_000) {
    return { places: [], sources: [] };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { places: [], sources: [] };
    }
    const p = parsed as { places?: unknown; sources?: unknown };
    const places = Array.isArray(p.places)
      ? p.places.filter(isValidChatPlace).slice(0, MAX_PLACES)
      : [];
    const sources = Array.isArray(p.sources)
      ? p.sources.filter(isValidCitation).slice(0, MAX_SOURCES)
      : [];
    return { places, sources };
  } catch {
    return { places: [], sources: [] };
  }
}
