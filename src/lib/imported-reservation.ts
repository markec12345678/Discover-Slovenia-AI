// ============================================================================
// UVOŽENA REZERVACIJA — normalizacija AI parse izhoda (Issue #4 §4, val 3)
// ============================================================================
// NAMEN: AI (VLM za slike / LLM za PDF & besedilo) IZKLJUČNO ekstrahira
// polja IZ dokumenta — TA plast deterministično striže, validira in kapira
// vse, kar je prišlo iz modela. NIČ se ne zapiše v bazo brez uporabnikove
// potrditve (parse je STATELESS — glej /api/journey/bookings/parse).
//
// NAČELA (ISKRENOST, ista disciplina kot ingest-image/pdf):
//  · AI ne izbira, ne dopolnjuje, ne ugiba — manjkajoče polje ostane null;
//  · vsako polje ima TRDO kap dolžine (whitelist" pri free-text ne obstaja,
//    obstaja pa meja);
//  · cena > 0 in ≤ 100_000 (nad tem je to napaka parse, ne rezervacija);
//  · valuta: 3-črkovna koda iz znane množice (sicer null — ne pretvarjamo);
//  · datum/čas: ohranimo SUROV niz iz dokumenta (YYYY-MM-DD[T]HH:MM,
//    DD.MM.YYYY …) — NIKOLI ne interpretiramo časovnih pasov;
//  · needsConfidence: parse, ki ni prebral ključnih polj, ostane DRAFT.
// ============================================================================

/** Normalizirana ekstrakcija rezervacije (VSEBINA dokumenta, ne trditev). */
export interface ParsedReservation {
  providerName: string | null;
  reservationNumber: string | null;
  startDateTime: string | null;
  endDateTime: string | null;
  locationName: string | null;
  guestName: string | null;
  price: number | null;
  currency: string | null;
  cancellationDeadline: string | null;
  contact: string | null;
  notes: string | null;
  /** Ali parse utemeljeno podpira ZAPIS brez potrditve (vedno false pri
   *  uvozu — uporabnik MORA potrditi; DRAFT je izhod nezanesljivega parse). */
  needsConfirmation: boolean;
}

/** Kratek vodnik AI modelu (slika/PDF/besedilo) — STROG JSON obrazec. */
export const RESERVATION_PARSE_PROMPT = [
  "You are a strict reservation-document extractor for a travel planner.",
  "Read the document (booking confirmation email text, PDF text, or screenshot).",
  "Extract ONLY fields that are explicitly present. Output ONE JSON object:",
  "{",
  '  "providerName": string | null,',
  '  "reservationNumber": string | null,',
  '  "startDateTime": string | null,',
  '  "endDateTime": string | null,',
  '  "locationName": string | null,',
  '  "guestName": string | null,',
  '  "price": number | null,',
  '  "currency": string | null,',
  '  "cancellationDeadline": string | null,',
  '  "contact": string | null,',
  '  "notes": string | null',
  "}",
  "Rules:",
  "- NEVER invent values. If a field is not clearly present, use null.",
  "- providerName: the company that issued the confirmation (e.g. 'Booking.com',",
  "  'GetYourGuide', 'KiwiTaxi', 'JP Slovenske železnice', a hotel name …).",
  "- reservationNumber: the booking/reservation/reference code, copied exactly.",
  "- startDateTime/endDateTime: date (and time if present) as shown, e.g.",
  "  '2026-07-12', '12.07.2026 14:30'. Copy the format from the document.",
  "- price: the total price as a plain number (1250.00 not '1.250,00 EUR').",
  "- currency: 3-letter code if stated (EUR, USD …), else null.",
  "- cancellationDeadline: free cancellation deadline as shown, else null.",
  "- contact: phone / email / support URL shown in the document, else null.",
  "- notes: one short sentence with anything else important, else null.",
  "- Output ONLY the JSON object. No markdown, no commentary, no HTML.",
].join("\n");

const MAX_TEXT = 200;
const MAX_NOTES = 300;

/** Znane valute (ISO 4217 podmnožica, ki se realno pojavi v potrdilih). */
const KNOWN_CURRENCIES = new Set([
  "EUR", "USD", "GBP", "CHF", "HRK", "CZK", "HUF", "PLN", "SEK", "NOK",
  "DKK", "RSD", "BAM", "MKD", "AUD", "CAD", "JPY",
]);

function capText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  if (!t || /^null$/i.test(t) || /^n\/?a$/i.test(t)) return null;
  return t.slice(0, max);
}

function capPrice(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v > 0 && v <= 100_000 ? Math.round(v * 100) / 100 : null;
  }
  if (typeof v === "string") {
    const t = v.trim().replace(/[€$£\s]/g, "");
    // 1.234,56 (EU) ali 1,234.56 (US)
    const eu = t.replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    const n = Number(eu);
    if (Number.isFinite(n) && n > 0 && n <= 100_000) {
      return Math.round(n * 100) / 100;
    }
  }
  return null;
}

function capCurrency(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const c = v.trim().toUpperCase();
  return KNOWN_CURRENCIES.has(c) ? c : null;
}

/**
 * Normaliziraj surovi AI izhod (JSON objekt ali niz) v varno ekstrakcijo.
 * Vraca { fields } — vedno objekt (manjkajoče = null), NIKOLI izjema.
 */
export function normalizeParsedReservation(
  raw: unknown
): ParsedReservation {
  let obj: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    obj = extractJsonObject(raw);
  } else if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  }
  const o = obj ?? {};

  const providerName = capText(o.providerName, MAX_TEXT);
  const reservationNumber = capText(
    o.reservationNumber ?? o.reservation_number ?? o.bookingNumber,
    MAX_TEXT
  );
  const startDateTime = capText(
    o.startDateTime ?? o.start_date_time ?? o.date ?? o.startDate,
    MAX_TEXT
  );
  const endDateTime = capText(
    o.endDateTime ?? o.end_date_time ?? o.endDate,
    MAX_TEXT
  );
  const locationName = capText(
    o.locationName ?? o.location_name ?? o.location,
    MAX_TEXT
  );
  const guestName = capText(
    o.guestName ?? o.guest_name ?? o.guest ?? o.passenger,
    MAX_TEXT
  );
  const price = capPrice(o.price ?? o.total ?? o.totalPrice);
  const currency = capCurrency(o.currency ?? o.currencyCode);
  const cancellationDeadline = capText(
    o.cancellationDeadline ?? o.cancellation_deadline,
    MAX_TEXT
  );
  const contact = capText(o.contact ?? o.supportContact, MAX_TEXT);
  const notes = capText(o.notes, MAX_NOTES);

  // Ključna polja za smiseln zapis: ponudnik + kdaj. Manjka karkoli →
  // zapis (ko ga uporabnik potrdi) nosi status DRAFT, ne CONFIRMED.
  const needsConfirmation =
    providerName == null ||
    (startDateTime == null && reservationNumber == null);

  return {
    providerName,
    reservationNumber,
    startDateTime,
    endDateTime,
    locationName,
    guestName,
    price,
    currency,
    cancellationDeadline,
    contact,
    notes,
    needsConfirmation,
  };
}

/** Izlušči prvi JSON objekt iz besedila (modeli radi dodajo ograje). */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  if (typeof text !== "string" || !text.trim()) return null;
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1));
          return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// PRESLIKAVA IMENA PONUDNIKA → KANONSKI SLUG
// ---------------------------------------------------------------------------
// IZKRENOST: uvožena rezervacija "Booking.com" ni naš kanonski produkt —
// a prepoznavanje poveže zapis z obstoječim registrom (UI žeton, /go poti
// kjer obstajajo). NEZNANO ime → "manual" (izrecno uporabniški vnos).

/** Kanonski slugi, ki jih sprejema bookings validacija + /go rute. */
const KNOWN_PROVIDER_SLUGS = new Set([
  "osm", "fsq", "sto", "own", "booking", "viator", "getyourguide",
  "tiqets", "kiwitaxi", "discovercars", "skyscanner", "omio", "airalo",
  "worldnomads", "safetywing", "travelpayouts", "events", "manual",
]);

/** Imena (male črke, brez ločil) → kanonski slug. */
const PROVIDER_NAME_HINTS: Array<[RegExp, string]> = [
  [/^booking\.?com$|^booking$/, "booking"],
  [/^viator$|^tripadvisor( trips| experiences)?$/, "viator"],
  [/^getyourguide$|^gyg$/, "getyourguide"],
  [/^tiqets$/, "tiqets"],
  [/^kiwi ?taxi$/, "kiwitaxi"],
  [/^discover ?cars$/, "discovercars"],
  [/^skyscanner$/, "skyscanner"],
  [/^omio$/, "omio"],
  [/^airalo$/, "airalo"],
  [/^world ?nomads$/, "worldnomads"],
  [/^safety ?wing$/, "safetywing"],
  [/^slovenske železnice$|^sž(?:[- ]železnice)?$/, "events"],
];

/** Preslikaj ime ponudnika iz dokumenta na kanonski slug ("manual" = neznano). */
export function providerSlugFromName(
  name: string | null | undefined
): "manual" | string {
  if (!name) return "manual";
  const key = name
    .toLowerCase()
    .replace(/\.(?:com|net|eu|si|de|io)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const [re, slug] of PROVIDER_NAME_HINTS) {
    if (re.test(key)) return slug;
  }
  return "manual";
}

/** Ali je slug kanonski (znana množica). */
export function isKnownProviderSlug(slug: string): boolean {
  return KNOWN_PROVIDER_SLUGS.has(slug);
}

// ---------------------------------------------------------------------------
// KLJUČ REZERVACIJE (dedup) — determinističen iz vsebine
// ---------------------------------------------------------------------------

/**
 * Determinističen productId za uvoz: "imp-" + čist niz ključa. Enak dokument
 * (isti ponudnik + št. rezervacije) → isti ključ → idempotenten zapis;
 * različna št. rezervacije → različen ključ (brez naključja — v nasprotju
 * s randomId bi ponovni uvoz istega potrdila NAREDIL duplikat).
 */
export function importedProductId(
  slug: string,
  reservationNumber: string | null
): string {
  const clean = (reservationNumber ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 40);
  return `imp-${slug}-${clean || "NN"}`;
}
