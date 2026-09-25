// ============================================================================
// REZERVACIJA IZ BESEDILO — DETERMINISTIČNI PARSER (Issue #5 / T5-D / M1)
// ============================================================================
// NAMEN: /api/journey/bookings/parse je bil za PDF in besedilo AI-ONLY — brez
// ključev je VEDNO padel z 502 (vrzel M1 iz matrike). Ta modul je REZERVA:
// regex ekstrakcija ključnih polj iz besedila potrdila (prilepljena e-pošta
// ali unpdf besedilo iz PDF-a) — 0 AI, 0 DB, 0 omrežja.
//
// NAČELA (ISTA disciplina kot AI pot v lib/imported-reservation.ts):
//  · NIČ NE IZMIŠLJUJEMO — polje nastane SAMO iz eksplicitne (označene ali
//    nedvoumne) pojavitve v besedilu; sicer ostane null;
//  · izhod gre ŠE VEDNO skozi normalizeParsedReservation() (isti striži,
//    kapi, validacija cene/valute, needsConfirmation) — en vir resnice;
//  · datum/čas ohranimo SUROV niz iz dokumenta (nikoli ne interpretiramo
//    časovnih pasov);
//  · rezultat je DRAFT-grade: uporabnik v UI potrdi/uredi, zapis prek
//    /api/journey/bookings/import (source IMPORTED, nikoli samodejno).
//
// Znani formati: Booking.com / Airbnb / Agoda / Expedia / GetYourGuide /
// Viator / Tripadvisor / KiwiTaxi / DiscoverCars / letalska PNR / SŽ in
// generična potrdila z oznakami (SL + EN + del DE). Neznan format → iskrene
// null vrednosti (ruta odgovori 422 z nasvetom za ročni vnos).
//
// Deterministične odločitve (zapisane, da jih testi pinirajo):
//  · št. rezervacije MORA vsebovati števko (čista-besedni zadetki so zavrnjeni
//    — preprečuje "confirmation sent to your email" lažne zadetke);
//  · "odhod/departure" se šteje za ZAČETEK (let/prevoz); "check-out/odjava"
//    za KONEC bivanja;
//  · neoznačen prvi datum v besedilu → startDateTime (datum je v dokumentu
//    izrecno prisoten; datum znotraj že porabljenih oznak se preskoči);
//  · cena: označeni skupni znesek (z do 20 znaki neštevčnega polnila, npr.
//    "Skupaj z DDV: 58,00"), sicer prvi samostojni znesek z valuto;
//  · "1.250" / "1,250" (točno 3 števke po ločilu) = skupina → 1250.
// ============================================================================

import {
  normalizeParsedReservation,
  type ParsedReservation,
} from "./imported-reservation";

/** Trda kap vhoda (ista kot AI pot: 60 000 znakov). */
const MAX_INPUT_CHARS = 60_000;

// ---------------------------------------------------------------------------
// ZNANI PONUDNIKI — iskanje po celotnem besedilu (word-boundary, case-insens.)
// ----------------------------------------------------------------------------

/** [regex na besedilu, kanonski prikaz imena] — vrstni red = prioritetnost.
 *  IZVOŽENO (Issue #6 / D6-B): reservation-ics-parse.ts uporablja ISTI seznam
 *  za SUMMARY hevristiko VEVENT dogodkov — en vir resnice, brez podvajanja. */
export const PROVIDER_BRANDS: Array<[RegExp, string]> = [
  [/\bbooking\.?com\b/i, "Booking.com"],
  [/\bgetyourguide\b|\bgyg\b/i, "GetYourGuide"],
  [/\bkiwi ?taxi\b/i, "KiwiTaxi"],
  [/\bdiscover ?cars\b/i, "DiscoverCars"],
  [/\bslovenske železnice\b|\bslovenskim železnicam\b/i, "Slovenske železnice"],
  [/\btripadvisor\b/i, "Tripadvisor"],
  [/\bviator\b/i, "Viator"],
  [/\bskyscanner\b/i, "Skyscanner"],
  [/\bomio\b/i, "Omio"],
  [/\bairalo\b/i, "Airalo"],
  [/\bworld ?nomads\b/i, "World Nomads"],
  [/\bsafety ?wing\b/i, "SafetyWing"],
  [/\bairbnb\b/i, "Airbnb"],
  [/\bagoda\b/i, "Agoda"],
  [/\bexpedia\b/i, "Expedia"],
  [/\bwizz ?air\b/i, "Wizz Air"],
  [/\bryanair\b/i, "Ryanair"],
  [/\beasyjet\b/i, "easyJet"],
  [/\blufthansa\b/i, "Lufthansa"],
  [/\bturkish airlines\b/i, "Turkish Airlines"],
  [/\bair france\b/i, "Air France"],
  [/\bair serbia\b/i, "Air Serbia"],
  [/\bcroatia airlines\b/i, "Croatia Airlines"],
  [/\b europcar\b/i, "Europcar"],
  [/\bsixt\b/i, "Sixt"],
  [/\bhertz\b/i, "Hertz"],
  [/\bavis\b/i, "Avis"],
];

// ---------------------------------------------------------------------------
// DATUMI — jedro (zapisi) + neobvezen čas; surov niz se OHRANI
// ----------------------------------------------------------------------------

/** Slovenski meseci (+ rodilnik "12. julija 2026") — daljše oblike najprej. */
const SL_MONTHS = [
  "januarja", "januar", "februarja", "februar", "marca", "marec",
  "aprila", "april", "maja", "maj", "junija", "junij",
  "julija", "julij", "avgusta", "avgust", "septembra", "september",
  "oktobra", "oktober", "novembra", "november", "decembra", "december",
].join("|");

/** Angleški meseci (+ okrajšave) — daljše najprej. */
const EN_MONTHS = [
  "January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December",
  "Jan", "Feb", "Mar", "Apr", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
].join("|");

const MONTHS = `(?:${SL_MONTHS}|${EN_MONTHS})`;

/** Jedro datuma: 12.07.2026 · 2026-07-12 · 12. julij 2026 · July 12, 2026 … */
const DATE_CORE = [
  String.raw`\d{1,2}\.\s?\d{1,2}\.\s?\d{4}`, // 12.07.2026
  String.raw`\d{4}-\d{2}-\d{2}`, // 2026-07-12
  String.raw`\d{1,2}\.\s?${MONTHS}\s+\d{4}`, // 12. julij 2026
  String.raw`${MONTHS}\s+\d{1,2},?\s+\d{4}`, // July 12, 2026
  String.raw`\d{1,2}\s+${MONTHS}\s+\d{4}`, // 12 July 2026
].join("|");

/** Celoten datetime (jedro + neobvezen čas z morebitno vejico). */
const DATE_TIME_PATTERN = `(?:${DATE_CORE})(?:,?\\s*\\d{1,2}:\\d{2})?`;

const DATE_TIME_RE = new RegExp(DATE_TIME_PATTERN, "gi");

/** Oznake (pred ciljem) → ciljno polje. Vrstni red = prioritetnost iskanja.
 *  SEMANTIKA (deterministično zapisana): hotelske oznake (check-in/out,
 *  prijava/odjava) imajo prednost pred prevoznimi; "arrival/prihod" je KONEC
 *  prevoza (let/transfer), "datum prihoda" (hotel) pa ZAČETEK (zato
 *  lookbehind — goli "prihod" ne sme ukrasti hotelskega "datum prihoda"). */
const DATE_LABELS: Array<[RegExp, "start" | "end" | "cancel"]> = [
  // odpoved (najbolj specifična — najprej)
  [
    /brezplač\w*\s+odpoved|rok za odpoved|odpovedi do|free cancellation|cancel (?:by|before)|cancellation deadline|stornier(?:en|ung) bis/i,
    "cancel",
  ],
  // konec: hotelska odjava + konec prevoza (arrival/drop-off/return)
  [
    /check[- ]?out\b|odjavitev\b|odjava\b|datum oddaje|return date|drop[- ]?off\b|vrnitev\b|arrival\b|(?<!datum )prihod\b/i,
    "end",
  ],
  // začetek: prijava + začetek prevoza (departure/pickup) + generični datum
  [
    /check[- ]?in\b|prijavitev\b|prijava\b|datum prihoda|prevzem\b|pick[- ]?up\b|datum odhoda|departure\b|odhod\b|let\b|wann\b|datum\b|\bdate\b/i,
    "start",
  ],
];

// ---------------------------------------------------------------------------
// OSTALE OZNAKE
// ----------------------------------------------------------------------------

/** Oznake številke rezervacije (SL/EN/DE) pred vrednostjo — NA ISTI VRSTICI
 *  (ločilo ne sme prečkati nove vrstice, sicer "booking confirmation\n…"
 *  požre naslednjo vrstico kot vrednost). */
const RES_NUM_LABEL =
  /(?:št(?:evilka)?[.\s]*rezervacije|število rezervacije|potrditven[ao] št(?:evilka)?|rezervacijsk[ao] koda|koda rezervacije|referen[cc][ao] (?:številka|number)?|št[.\s]*naročila|booking(?:[- ](?:reference|number|confirmation|no\.?|id|ref))?|confirmation(?:[- ](?:number|code|id))?|reservation(?:[- ](?:number|no\.?|id|reference|code))?|order number|book(?:ing)? ref|pnr\b|record locator|rezervacija\b|rezervacijo\b|naročilo\b|naročilnica\b)/i;

/**
 * Vrednost št. rezervacije (trip zahteva ≥1 števko):
 *  (a) Booking.com skupine: "408.921.371.224" / "408 921 371 224";
 *  (b) dolga števčna koda: "12345678";
 *  (c) tesni alfanumerični: "GYG-123456", "ABC123", "XK7L2P".
 */
const RES_NUM_VALUE = String.raw`(?:\d{1,4}(?:[. ]\d{3})+|\d{5,}|[A-Za-z0-9][A-Za-z0-9-]{2,20}[A-Za-z0-9])`;

/** Oznake gosta — specifične pred generičnimi (generične zahtevajo dvopičje). */
const GUEST_LABELS: RegExp[] = [
  /(?:ime gosta|ime potnika|guest name|name of guest|potnik(?:ka)?\b|passenger(?: name)?\b|booker\b)\s*[:：-]?\s*/i,
  /(?:gost(?:je)?|ime|name)\s*[:：]\s*/,
];

/** Oznake lokacije (zahtevajo ločilo, da ne lovimo proze). */
const LOCATION_LABELS: RegExp[] = [
  /(?:naslov|address|lokacija|location|kraj|prevzemna točka|pick[- ]?up (?:location|point))\s*[:：-]\s*/i,
];

/** Oznake skupnega zneska — bolj specifične prve. */
const TOTAL_LABELS: RegExp[] = [
  /(?:skupaj|skupna cena|skupni znesek|za plačilo|grand total|total price|gesamtbetrag|zu zahlen)\b\s*[:：-]?\s*/i,
  /(?:znesek|cena|total|amount due|summe|price)\b\s*[:：]\s*/,
];

/** Valute (simboli + kode). */
const CURRENCY_TOKEN = String.raw`(?:€|[$]|£|\bkn\b|EUR|USD|GBP|CHF|HRK|CZK|HUF|PLN|SEK|NOK|DKK|RSD|BAM|MKD|AUD|CAD|JPY)`;

/** Simbol → koda. */
const CURRENCY_SYMBOL_MAP: Record<string, string> = {
  "€": "EUR",
  "$": "USD",
  "£": "GBP",
  "kn": "HRK",
};

// ---------------------------------------------------------------------------
// POMOŽNE FUNKCIJE (čiste, brez stanja)
// ----------------------------------------------------------------------------

function capLine(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.slice(0, max);
}

/**
 * Deterministično pretvori niz cene v številko (AI poti prepustimo nize,
 * tu pa ŽE prevrednotimo, ker poznamo zapis konteksta):
 *  · "1.250.000" / "1,250,000" — skupine po 3 → celo število;
 *  · "1.250,00" / "1,250.00" — zadnje ločilo je decimalno;
 *  · "58" / "89,90" / "89.90" → 58 / 89.9 / 89.9;
 *  · >2 decimalni mesti ali tuji znaki → null (ni cena);
 *  · 0 ali > 100_000 → null (ista kap kot capPrice).
 */
function parsePriceNumber(raw: string): number | null {
  const t = raw
    .replace(/[€$£\s]/g, "")
    .replace(/[.,]+$/, "")
    .trim();
  if (!t || !/^[\d.,]+$/.test(t)) return null;
  const ok = (n: number) =>
    Number.isFinite(n) && n > 0 && n <= 100_000
      ? Math.round(n * 100) / 100
      : null;
  if (/^\d{1,3}(?:\.\d{3})+$/.test(t)) return ok(Number(t.replace(/\./g, "")));
  if (/^\d{1,3}(?:,\d{3})+$/.test(t)) return ok(Number(t.replace(/,/g, "")));
  const decIdx = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
  if (decIdx < 0) return ok(Number(t));
  const intPart = t.slice(0, decIdx).replace(/[.,]/g, "");
  const frac = t.slice(decIdx + 1);
  if (!/^\d{1,2}$/.test(frac) || !/^\d+$/.test(intPart)) return null;
  return ok(Number(`${intPart}.${frac}`));
}

/** Izlušči valuto (koda) iz zadetka (simbol ali koda). */
function extractCurrency(chunk: string): string | null {
  const m = chunk.match(new RegExp(CURRENCY_TOKEN, "i"));
  if (!m) return null;
  const token = m[0].trim();
  return CURRENCY_SYMBOL_MAP[token.toLowerCase()] ?? token.toUpperCase();
}

interface PriceHit {
  price: number;
  currency: string | null;
}

/**
 * Znesek za OZNAKO (dovoljena do 20 znakov neštevčnega polnila — "z DDV:",
 * "(2 gostota)" …). Podpira "Total: 58 EUR", "Skupaj: EUR 1.250,00",
 * "Total: $1,250.00", "Znesek: 89,90" (brez valute → currency null).
 */
function priceAfterLabel(text: string, labels: RegExp[]): PriceHit | null {
  for (const label of labels) {
    const re = new RegExp(
      `${label.source}[^\\d\\n]{0,20}?(${CURRENCY_TOKEN})?\\s*(\\d[\\d.,]*)\\s*(${CURRENCY_TOKEN})?`,
      "i"
    );
    const m = re.exec(text);
    if (!m) continue;
    const price = parsePriceNumber(m[2]);
    if (price == null) continue;
    const currency = extractCurrency(m[1] ?? m[3] ?? "");
    return { price, currency };
  }
  return null;
}

/** Prvi SAMOSTOJOČI znesek z valuto ("58 EUR", "€89", "$ 1,250.00").
 *  Preskusi VSE zadetke — datumu podobni nizi ("12.07.2026 EUR") se pri
 *  pretvorbi zavrnejo in NE smejo zadušiti kasnejše prave cene. */
function firstStandalonePrice(text: string): PriceHit | null {
  const re = new RegExp(
    String.raw`(?:${CURRENCY_TOKEN})\s?\d[\d.,]*|\d[\d.,]*\s?(?:${CURRENCY_TOKEN})`,
    "gi"
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const currency = extractCurrency(m[0]);
    const numMatch = m[0].match(/\d[\d.,]*/);
    if (!numMatch) continue;
    const price = parsePriceNumber(numMatch[0]);
    if (price == null) continue;
    return { price, currency };
  }
  return null;
}

/** Vse pojavitve datetime (globalno, brez prekrivanj). */
function allDateTimeMatches(
  text: string
): Array<{ value: string; index: number }> {
  const hits: Array<{ value: string; index: number }> = [];
  DATE_TIME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DATE_TIME_RE.exec(text)) !== null) {
    hits.push({ value: m[0].trim(), index: m.index });
  }
  return hits;
}

/** Ali se obseg prekriva s katereim od že porabljenih. */
function overlapsRange(
  index: number,
  length: number,
  used: Array<{ start: number; end: number }>
): boolean {
  return used.some((r) => index < r.end && index + length > r.start);
}

// ---------------------------------------------------------------------------
// GLAVNA FUNKCIJA
// ----------------------------------------------------------------------------

/**
 * Deterministično preberi potrdilo o rezervaciji iz besedila.
 * Čista funkcija: enak vhod → enak izhod; nikoli ne vrže izjeme.
 * Vrne NORMALIZIRAN ParsedReservation (isti striži/kapi kot AI pot).
 */
export function parseReservationText(rawText: string): ParsedReservation {
  const text =
    typeof rawText === "string" ? rawText.slice(0, MAX_INPUT_CHARS) : "";

  if (!text.trim()) {
    return normalizeParsedReservation({});
  }

  // 1) Ponudnik — prvi znani videznam v besedilu (kanonski prikaz).
  let providerName: string | null = null;
  for (const [brandRe, display] of PROVIDER_BRANDS) {
    if (brandRe.test(text)) {
      providerName = display;
      break;
    }
  }

  // 2) Št. rezervacije — označena vrednost; ZAHTEVAMO ≥1 števko
  //    (prepreči lažne zadetke tipa "confirmation sent to your email").
  let reservationNumber: string | null = null;
  const resNumRe = new RegExp(
    `${RES_NUM_LABEL.source}[ \t]*[:：-]?[ \t]*(${RES_NUM_VALUE})`,
    "gi"
  );
  let resNumMatch = resNumRe.exec(text);
  while (resNumMatch) {
    const candidate = capLine(resNumMatch[1], 200);
    if (/\d/.test(candidate)) {
      reservationNumber = candidate;
      break;
    }
    resNumMatch = resNumRe.exec(text);
  }

  // 3) Datumi: odpoved (cela vrstica po oznaki) → konec → začetek
  //    (označeni datumovi se izključujejo med seboj), nato neoznačeni prvi.
  const usedSpans: Array<{ start: number; end: number }> = [];
  let cancellationDeadline: string | null = null;
  let endDateTime: string | null = null;
  let startDateTime: string | null = null;

  for (const [labelRe, target] of DATE_LABELS) {
    if (target === "cancel") {
      if (cancellationDeadline) continue;
      const labelMatch = labelRe.exec(text);
      if (!labelMatch) continue;
      const lineEnd = text.indexOf("\n", labelMatch.index);
      const limit =
        lineEnd < 0
          ? Math.min(text.length, labelMatch.index + 220)
          : lineEnd;
      const line = text.slice(labelMatch.index, limit);
      // Dati v tej vrstici so "porabljeni" (ne smejo postati startDateTime).
      for (const d of allDateTimeMatches(line)) {
        usedSpans.push({
          start: labelMatch.index + d.index,
          end: labelMatch.index + d.index + d.value.length,
        });
      }
      const value = capLine(
        line
          .slice(labelMatch[0].length)
          .replace(/^\s*[:：-]?\s*/, "")
          .replace(/\s*$/, ""),
        200
      );
      if (value) cancellationDeadline = value;
      continue;
    }

    if (target === "end" && endDateTime) continue;
    if (target === "start" && startDateTime) continue;

    // oznaka + do 30 znakov polnila (isti vrstici) + datetime; preskoči
    // že porabljene (npr. datum znotraj vrstice odpovedi).
    const re = new RegExp(
      `(?:${labelRe.source})[^\\n]{0,30}?(${DATE_TIME_PATTERN})`,
      "gi"
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const value = capLine(m[1], 200);
      if (!value) continue;
      const absStart = m.index + m[0].lastIndexOf(m[1]);
      if (overlapsRange(absStart, m[1].length, usedSpans)) continue;
      usedSpans.push({ start: absStart, end: absStart + m[1].length });
      if (target === "end") endDateTime = value;
      else startDateTime = value;
      break;
    }
  }

  // Neoznačeni prvi datum (izven porabljenih oznak) → startDateTime.
  if (!startDateTime) {
    const free = allDateTimeMatches(text).find(
      (h) => !overlapsRange(h.index, h.value.length, usedSpans)
    );
    if (free) startDateTime = capLine(free.value, 200);
  }

  // 4) Cena — označeni skupni znesek, sicer prvi samostojni znesek z valuto.
  const priceHit =
    priceAfterLabel(text, TOTAL_LABELS) ?? firstStandalonePrice(text);

  // 5) Gost — specifične oznake, sicer generični "ime/name:" (z dvopičjem).
  let guestName: string | null = null;
  for (const label of GUEST_LABELS) {
    const re = new RegExp(`${label.source}([^\\n]{2,80})`, "i");
    const m = re.exec(text);
    if (!m) continue;
    const value = capLine(m[1], 200);
    // Gost mora vsebovati črke (ne samo številke/ločila).
    if (!/[A-Za-zčšžćđČŠŽĆĐ]/.test(value)) continue;
    guestName = value;
    break;
  }

  // 6) Lokacija — označena (isti vrstica, do 120 znakov).
  let locationName: string | null = null;
  for (const label of LOCATION_LABELS) {
    const re = new RegExp(`${label.source}([^\\n]{2,120})`, "i");
    const m = re.exec(text);
    if (!m) continue;
    const value = capLine(m[1], 200);
    if (!value) continue;
    locationName = value;
    break;
  }

  // 7) Stik — najprej e-pošta, sicer označena telefonska številka.
  let contact: string | null = null;
  const email = text.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
  );
  if (email) {
    contact = capLine(email[0], 200);
  } else {
    const phone = text.match(
      /(?:telefon|phone|tel\.?|mobilna|kontakt|contact)\s*[:：-]\s*(\+?[\d][\d\s./-]{6,18}\d)/i
    );
    if (phone) contact = capLine(phone[1], 200);
  }

  // notes: vedno null — sinteza povedi bi bila ugibanje (AI to sme, mi ne).

  return normalizeParsedReservation({
    providerName,
    reservationNumber,
    startDateTime,
    endDateTime,
    locationName,
    guestName,
    price: priceHit?.price ?? null,
    currency: priceHit?.currency ?? null,
    cancellationDeadline,
    contact,
    notes: null,
  });
}

/** Ali je ekstrakcija prazna (nič ključnih polj) — za iskren 422 na ruti. */
export function isReservationParseEmpty(parsed: ParsedReservation): boolean {
  return (
    parsed.providerName == null &&
    parsed.reservationNumber == null &&
    parsed.startDateTime == null
  );
}
